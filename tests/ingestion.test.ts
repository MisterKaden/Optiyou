import assert from "node:assert/strict";
import test from "node:test";

import { flagsForIngredient, parseIngredientString } from "../src/ingestion/ingredient-flags.ts";
import { normalizeUsdaFood, type UsdaBrandedFood } from "../src/ingestion/usda.ts";
import { buildProductStatements } from "../src/ingestion/sql.ts";
import { scoreFoodProduct } from "../src/scoring/food-scoring.ts";
import type { PersonalizationProfile } from "../src/platform/types.ts";

const PROFILE: PersonalizationProfile = {
  id: "test",
  preferences: [],
  allergens: [],
  avoidedIngredients: []
};

const SAMPLE: UsdaBrandedFood = {
  fdcId: 555,
  description: "COCOA CRUNCH CEREAL",
  brandName: "Morning Bolt",
  brandOwner: "Bolt Foods",
  gtinUpc: "006178200002",
  brandedFoodCategory: "Cereal",
  ingredients:
    "INGREDIENTS: CORN FLOUR, CANE SUGAR, HIGH FRUCTOSE CORN SYRUP, COCOA, COLOR (RED 40), NATURAL FLAVOR. CONTAINS: MILK, WHEAT.",
  servingSize: 30,
  servingSizeUnit: "g",
  publicationDate: "3/2/2023",
  labelNutrients: {
    calories: { value: 210 },
    protein: { value: 3 },
    fiber: { value: 2 },
    sugars: { value: 15 },
    addedSugars: { value: 12 },
    sodium: { value: 180 }
  }
};

test("flagsForIngredient detects dyes, sugars, and gluten without a false malt match", () => {
  assert.deepEqual(flagsForIngredient("Red 40"), ["synthetic_dye"]);
  const hfcs = flagsForIngredient("High Fructose Corn Syrup");
  assert.ok(hfcs.includes("added_sugar"));
  assert.ok(hfcs.includes("ultra_processed_marker"));
  assert.ok(flagsForIngredient("Wheat Flour").includes("contains_gluten"));
  const maltodextrin = flagsForIngredient("Maltodextrin");
  assert.equal(maltodextrin.includes("contains_gluten"), false);
  assert.ok(maltodextrin.includes("ultra_processed_marker"));
});

test("parseIngredientString splits tokens, flags them, and extracts the CONTAINS statement", () => {
  const parsed = parseIngredientString(SAMPLE.ingredients!);
  const names = parsed.ingredients.map((item) => item.normalizedName);
  assert.ok(names.includes("corn flour"));
  assert.ok(names.some((name) => name.includes("red 40")));
  assert.match(parsed.containsStatement ?? "", /milk/i);
  assert.match(parsed.containsStatement ?? "", /wheat/i);
});

test("normalizeUsdaFood maps a branded food to the Optiyou schema", () => {
  const normalized = normalizeUsdaFood(SAMPLE, { observedAt: "2026-06-06T00:00:00.000Z" });
  assert.ok(normalized);
  assert.equal(normalized.product.gtin, "006178200002");
  assert.equal(normalized.product.name, "COCOA CRUNCH CEREAL");
  assert.equal(normalized.product.brand, "Morning Bolt");
  assert.equal(normalized.product.category, "cereal");
  assert.equal(normalized.product.nutrition.addedSugarGrams, 12);
  assert.equal(normalized.product.nutrition.sodiumMilligrams, 180);
  assert.ok(normalized.product.allergens.includes("dairy"));
  assert.ok(normalized.product.allergens.includes("wheat"));
  assert.equal(normalized.product.processingLevel, "high");
  assert.equal(normalized.primarySource, "usda");
});

test("normalizeUsdaFood separates sourcePublishedAt (USDA) from observedAt (ingestion)", () => {
  const normalized = normalizeUsdaFood(SAMPLE, { observedAt: "2026-06-06T00:00:00.000Z" });
  assert.ok(normalized);
  assert.equal(normalized.sourcePublishedAt, "2023-03-02T00:00:00.000Z");
  assert.equal(normalized.observedAt, "2026-06-06T00:00:00.000Z");
  assert.equal(normalized.product.dataQuality.sourcePublishedAt, "2023-03-02T00:00:00.000Z");
  assert.equal(normalized.product.dataQuality.observedAt, "2026-06-06T00:00:00.000Z");
  assert.equal(normalized.normalizationVersion, "usda-v0.1.0");
  assert.equal(normalized.ingredientFlagVersion, "ingredients-v0.1.0");
});

test("normalizeUsdaFood estimates added sugar from total sugar and lowers confidence", () => {
  const noAdded: UsdaBrandedFood = {
    ...SAMPLE,
    labelNutrients: { calories: { value: 210 }, protein: { value: 3 }, fiber: { value: 2 }, sugars: { value: 15 }, sodium: { value: 180 } }
  };
  const normalized = normalizeUsdaFood(noAdded);
  assert.ok(normalized);
  assert.equal(normalized.product.nutrition.addedSugarGrams, 15);
  assert.ok(normalized.product.dataQuality.conflictFlags.includes("added_sugar_estimated_from_total"));
  assert.ok(normalized.product.dataQuality.confidence < 0.8);
});

test("normalizeUsdaFood returns null without a usable GTIN", () => {
  assert.equal(normalizeUsdaFood({ description: "no barcode" }), null);
});

test("buildProductStatements produces escaped, idempotent SQL", () => {
  const normalized = normalizeUsdaFood({ ...SAMPLE, description: "BOB'S CEREAL" });
  assert.ok(normalized);
  const score = scoreFoodProduct(normalized.product, PROFILE);
  const sql = buildProductStatements(normalized, score).join("\n");
  assert.ok(sql.includes("INSERT OR IGNORE INTO products"));
  assert.ok(sql.includes("'BOB''S CEREAL'"));
  assert.ok(sql.includes("'usda'"));
  assert.ok(sql.includes("INSERT OR IGNORE INTO scores"));
});

test("scoring penalizes a high-sugar, dyed, ultra-processed cereal for the right reasons", () => {
  const normalized = normalizeUsdaFood(SAMPLE);
  assert.ok(normalized);
  const score = scoreFoodProduct(normalized.product, PROFILE);
  assert.ok(score.scoreComponents.optiScore < 55);
  assert.equal(score.gradeBand, "poor");
  assert.ok(score.scoreComponents.nutritionScore <= 55);
  assert.ok(score.scoreComponents.ingredientScore <= 72);
  assert.ok(score.reasonCodes.includes("NUTRI_ADDED_SUGAR_HIGH"));
  assert.ok(score.reasonCodes.includes("ING_SYNTHETIC_DYE"));
  assert.ok(score.reasonCodes.includes("ING_ULTRA_PROCESSED_MARKER"));
  assert.ok(score.reasonCodes.includes("PROCESSING_HIGH"));
  // Data is complete (declared added sugar, nutrition, ingredients) so confidence stays high.
  assert.ok(score.scoreComponents.confidenceScore >= 80);
});

test("flagsForIngredient catches dye and sugar aliases without false positives", () => {
  assert.ok(flagsForIngredient("Red #40").includes("synthetic_dye"));
  assert.ok(flagsForIngredient("FD&C Yellow No. 5").includes("synthetic_dye"));
  assert.ok(flagsForIngredient("Evaporated Cane Juice").includes("added_sugar"));
  assert.ok(flagsForIngredient("Brown Rice Syrup").includes("added_sugar"));
  // "Rye" is gluten but not the wheat allergen; "Carbonated Water" is nothing.
  assert.deepEqual(flagsForIngredient("Carbonated Water"), []);
});

test("parseIngredientString keeps '2% or less' ingredients and only allergen-CONTAINS becomes a statement", () => {
  const parsed = parseIngredientString(
    "INGREDIENTS: OATS, SUGAR, CONTAINS 2% OR LESS OF SALT, NATURAL FLAVOR. CONTAINS: MILK."
  );
  const names = parsed.ingredients.map((item) => item.normalizedName);
  assert.ok(names.includes("oats"));
  assert.ok(names.some((name) => name.includes("salt")), "salt after '2% or less' must survive as an ingredient");
  assert.match(parsed.containsStatement ?? "", /milk/i);
  assert.ok(!/2%/.test(parsed.containsStatement ?? ""), "the allergen statement must not capture the '2% or less' phrase");
});
