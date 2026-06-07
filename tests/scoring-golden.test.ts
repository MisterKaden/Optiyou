import assert from "node:assert/strict";
import test from "node:test";

import { scoreFoodProduct } from "../src/scoring/food-scoring.ts";
import type {
  Allergen,
  FoodProduct,
  Ingredient,
  NutritionFacts,
  PersonalizationProfile,
  ProcessingLevel,
  ProductCategory
} from "../src/platform/types.ts";

const EMPTY_PROFILE: PersonalizationProfile = { id: "t", preferences: [], allergens: [], avoidedIngredients: [] };

interface FixtureOverrides {
  name?: string;
  category?: ProductCategory;
  processingLevel?: ProcessingLevel;
  confidence?: number;
  conflictFlags?: string[];
  nutrition?: NutritionFacts;
  ingredients?: Ingredient[];
  allergens?: Allergen[];
}

function product(over: FixtureOverrides): FoodProduct {
  return {
    id: "p",
    gtin: "0",
    market: "US_CA",
    category: over.category ?? "snack_bar",
    name: over.name ?? "Test",
    brand: "Brand",
    versionId: "v",
    version: 1,
    dataQuality: {
      source: "open_product_database",
      observedAt: "2026-01-01T00:00:00.000Z",
      confidence: over.confidence ?? 0.85,
      verificationStatus: "unverified",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
      userContributionCount: 0,
      brandConfirmation: "none",
      conflictFlags: over.conflictFlags ?? []
    },
    nutrition: over.nutrition ?? { calories: 0, addedSugarGrams: 0, proteinGrams: 0, fiberGrams: 0, sodiumMilligrams: 0 },
    ingredients: over.ingredients ?? [],
    allergens: over.allergens ?? [],
    processingLevel: over.processingLevel ?? "minimal"
  };
}

// --- Golden fixtures spanning the realistic quality spectrum ---
const plainOats = product({
  name: "Plain Rolled Oats", category: "cereal", processingLevel: "minimal", confidence: 0.92,
  nutrition: { calories: 150, addedSugarGrams: 0, proteinGrams: 5, fiberGrams: 4, sodiumMilligrams: 0 },
  ingredients: [{ position: 1, name: "whole grain rolled oats", flags: [] }]
});

const proteinBar = product({
  name: "Sweetened Protein Bar", category: "snack_bar", processingLevel: "high",
  nutrition: { calories: 200, addedSugarGrams: 9, proteinGrams: 10, fiberGrams: 3, sodiumMilligrams: 150 },
  ingredients: [
    { position: 1, name: "soy protein isolate", flags: ["ultra_processed_marker"] },
    { position: 2, name: "cane sugar", flags: ["added_sugar"] }
  ]
});

const cocoaCereal = product({
  name: "Cocoa Crunch", category: "cereal", processingLevel: "high",
  nutrition: { calories: 210, addedSugarGrams: 12, proteinGrams: 3, fiberGrams: 2, sodiumMilligrams: 180 },
  ingredients: [
    { position: 1, name: "corn flour", flags: [] },
    { position: 2, name: "high fructose corn syrup", flags: ["added_sugar", "ultra_processed_marker"] },
    { position: 3, name: "red 40", flags: ["synthetic_dye"] }
  ]
});

const dietSoda = product({
  name: "Diet Cola", category: "beverage", processingLevel: "high",
  nutrition: { calories: 0, addedSugarGrams: 0, proteinGrams: 0, fiberGrams: 0, sodiumMilligrams: 40 },
  ingredients: [
    { position: 1, name: "carbonated water", flags: [] },
    { position: 2, name: "aspartame", flags: ["artificial_sweetener"] },
    { position: 3, name: "natural flavor", flags: ["ultra_processed_marker"] }
  ]
});

const cannedSoup = product({
  name: "Canned Soup", category: "prepared_meal", processingLevel: "moderate",
  nutrition: { calories: 120, addedSugarGrams: 2, proteinGrams: 5, fiberGrams: 2, sodiumMilligrams: 890 },
  ingredients: [{ position: 1, name: "water", flags: [] }, { position: 2, name: "salt", flags: [] }]
});

const missingData = product({
  name: "Unknown Product", category: "unknown", processingLevel: "minimal", confidence: 0.4,
  conflictFlags: ["incomplete_nutrition"],
  nutrition: { calories: 0, addedSugarGrams: 0, proteinGrams: 0, fiberGrams: 0, sodiumMilligrams: 0 }
});

test("golden ranking is obviously sane: oats > protein bar > dyed cereal", () => {
  const oats = scoreFoodProduct(plainOats, EMPTY_PROFILE).scoreComponents.optiScore;
  const bar = scoreFoodProduct(proteinBar, EMPTY_PROFILE).scoreComponents.optiScore;
  const cereal = scoreFoodProduct(cocoaCereal, EMPTY_PROFILE).scoreComponents.optiScore;
  assert.ok(oats > bar, `oats (${oats}) should beat protein bar (${bar})`);
  assert.ok(bar > cereal, `protein bar (${bar}) should beat dyed cereal (${cereal})`);
});

test("golden grade bands land where a human would expect", () => {
  assert.equal(scoreFoodProduct(plainOats, EMPTY_PROFILE).gradeBand, "good");
  assert.equal(scoreFoodProduct(proteinBar, EMPTY_PROFILE).gradeBand, "mixed");
  assert.equal(scoreFoodProduct(cocoaCereal, EMPTY_PROFILE).gradeBand, "poor");
});

test("category-relevant negatives surface as reason codes", () => {
  assert.ok(scoreFoodProduct(cannedSoup, EMPTY_PROFILE).reasonCodes.includes("NUTRI_SODIUM_HIGH"));
  assert.ok(scoreFoodProduct(dietSoda, EMPTY_PROFILE).reasonCodes.includes("ING_ARTIFICIAL_SWEETENER"));
});

test("confidence is independent of score: a data-poor product can still score high but flags low confidence", () => {
  const score = scoreFoodProduct(missingData, EMPTY_PROFILE);
  assert.ok(score.scoreComponents.confidenceScore <= 45, "confidence must reflect the missing data");
  assert.ok(score.scoreComponents.optiScore >= 75, "score is not auto-tanked just because data is sparse");
});

// --- Personalization: universal vs. personal fit, and hard safety caps ---
test("OptiFit equals OptiScore for an empty profile, diverges for a conflicting goal", () => {
  const neutral = scoreFoodProduct(cocoaCereal, EMPTY_PROFILE);
  assert.equal(neutral.scoreComponents.optiFit, neutral.scoreComponents.optiScore);
  assert.equal(neutral.safetyLevel, "ok");

  const lowSugar: PersonalizationProfile = { id: "ls", preferences: ["low_sugar"], allergens: [], avoidedIngredients: [] };
  const personalized = scoreFoodProduct(cocoaCereal, lowSugar);
  assert.ok(personalized.scoreComponents.optiFit < personalized.scoreComponents.optiScore);
  assert.ok(personalized.personalizationReasonCodes.includes("PREF_LOW_SUGAR_CONFLICT"));
});

test("a declared allergen hard-caps OptiFit and sets safetyLevel=avoid even on a good product", () => {
  const plainYogurt = product({
    name: "Plain Whole-Milk Yogurt", category: "yogurt", processingLevel: "minimal", confidence: 0.9,
    nutrition: { calories: 150, addedSugarGrams: 0, proteinGrams: 9, fiberGrams: 0, sodiumMilligrams: 60 },
    ingredients: [{ position: 1, name: "cultured milk", flags: ["contains_dairy"] }],
    allergens: ["dairy"]
  });
  const dairyAllergy: PersonalizationProfile = { id: "da", preferences: [], allergens: ["dairy"], avoidedIngredients: [] };
  const score = scoreFoodProduct(plainYogurt, dairyAllergy);
  assert.equal(score.safetyLevel, "avoid");
  assert.ok(score.scoreComponents.optiScore >= 75, "the yogurt itself is a good product");
  assert.ok(score.scoreComponents.optiFit <= 12, "but OptiFit is hard-capped for the allergic user");
  assert.ok(score.personalizationReasonCodes.includes("PREF_ALLERGEN_CONFLICT"));
});

test("a wheat allergen conflict is avoid; gluten-free without an allergen is a preference, not avoid", () => {
  const cracker = product({
    name: "Wheat Cracker", category: "snack_bar",
    ingredients: [{ position: 1, name: "wheat flour", flags: ["contains_gluten"] }],
    allergens: ["wheat"]
  });
  const wheatAllergy: PersonalizationProfile = { id: "wa", preferences: [], allergens: ["wheat"], avoidedIngredients: [] };
  assert.equal(scoreFoodProduct(cracker, wheatAllergy).safetyLevel, "avoid");

  const glutenFree: PersonalizationProfile = { id: "gf", preferences: ["gluten_free"], allergens: [], avoidedIngredients: [] };
  const pref = scoreFoodProduct(cracker, glutenFree);
  assert.equal(pref.safetyLevel, "caution");
  assert.ok(pref.personalizationReasonCodes.includes("PREF_GLUTEN_FREE_CONFLICT"));
});

test("avoided ingredients emit a personalization reason code", () => {
  const avoidsDyes: PersonalizationProfile = { id: "ad", preferences: [], allergens: [], avoidedIngredients: ["red 40"] };
  const score = scoreFoodProduct(cocoaCereal, avoidsDyes);
  assert.ok(score.personalizationReasonCodes.includes("PREF_AVOIDED_INGREDIENT"));
});
