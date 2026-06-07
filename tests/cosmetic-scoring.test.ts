import assert from "node:assert/strict";
import test from "node:test";

import { scoreCosmeticProduct } from "../src/cosmetics/scoring.ts";
import { buildCosmeticCard } from "../src/cosmetics/product-card.ts";
import { parseInciList } from "../src/cosmetics/ingredient-concerns.ts";
import type { CosmeticCategory, CosmeticProduct, CosmeticProfile, CosmeticUse } from "../src/cosmetics/types.ts";

const EMPTY_PROFILE: CosmeticProfile = { id: "t", preferences: [], avoidedIngredients: [] };

function cosmetic(over: { name?: string; inci: string; use?: CosmeticUse; category?: CosmeticCategory; confidence?: number }): CosmeticProduct {
  const parsed = parseInciList(over.inci);
  return {
    id: "c", gtin: "0", market: "US_CA", vertical: "cosmetic",
    category: over.category ?? "skincare",
    use: over.use ?? "leave_on",
    name: over.name ?? "Test",
    brand: "B", versionId: "v", version: 1,
    dataQuality: {
      source: "open_product_database", observedAt: "2026-01-01T00:00:00.000Z",
      confidence: over.confidence ?? 0.85, verificationStatus: "unverified",
      lastSeenAt: "2026-01-01T00:00:00.000Z", userContributionCount: 0,
      brandConfirmation: "none", conflictFlags: []
    },
    ingredients: parsed.ingredients,
    hasUndisclosedFragrance: parsed.hasUndisclosedFragrance
  };
}

test("parseInciList parses INCI, flags fragrance allergens, and detects undisclosed fragrance", () => {
  const parsed = parseInciList("Ingredients: Water, Glycerin, Parfum, Limonene, Phenoxyethanol.");
  assert.equal(parsed.hasUndisclosedFragrance, true);
  const limonene = parsed.ingredients.find((item) => item.normalizedName === "limonene");
  assert.ok(limonene);
  assert.ok(limonene.concerns.includes("fragrance_allergen"));
});

test("a simple clean formula scores well and flags a simple formulation", () => {
  const score = scoreCosmeticProduct(cosmetic({ inci: "Water, Glycerin, Cetearyl Alcohol, Squalane, Tocopherol" }), EMPTY_PROFILE);
  assert.equal(score.gradeBand, "good");
  assert.equal(score.safetyLevel, "ok");
  assert.ok(score.reasonCodes.includes("COS_SIMPLE_FORMULATION"));
  assert.equal(score.scoreComponents.optiFit, score.scoreComponents.optiScore, "empty profile: fit equals universal");
});

test("a banned substance hard-caps the score and sets safetyLevel=avoid", () => {
  const score = scoreCosmeticProduct(cosmetic({ inci: "Water, Mercury, Glycerin" }), EMPTY_PROFILE);
  assert.ok(score.scoreComponents.optiScore <= 30);
  assert.equal(score.safetyLevel, "avoid");
  assert.equal(score.gradeBand, "poor");
  assert.ok(score.reasonCodes.includes("COS_BANNED_SUBSTANCE"));
});

test("fragrance allergens inform via advisory without tanking the score (anti-alarmist)", () => {
  const score = scoreCosmeticProduct(cosmetic({ inci: "Water, Glycerin, Parfum, Limonene, Linalool, Citronellol, Phenoxyethanol" }), EMPTY_PROFILE);
  assert.ok(score.reasonCodes.includes("COS_FRAGRANCE_ALLERGEN"));
  assert.ok(score.reasonCodes.includes("COS_FRAGRANCE_UNDISCLOSED"));
  assert.ok(score.advisories.some((note) => /patch-test/i.test(note)));
  assert.ok(score.scoreComponents.optiScore > 50, "a fragranced-but-otherwise-fine lotion is not junk");
});

test("contested chemical UV filters are labeled as debated, not asserted as toxic", () => {
  const score = scoreCosmeticProduct(cosmetic({ inci: "Water, Oxybenzone, Octinoxate, Glycerin", category: "suncare" }), EMPTY_PROFILE);
  assert.ok(score.reasonCodes.includes("COS_CONTESTED_INGREDIENT"));
  assert.ok(score.reasonCodes.includes("COS_ENDOCRINE_SUSPECTED"));
  assert.ok(score.advisories.some((note) => /debated|not settled/i.test(note)));
  assert.ok(score.scoreComponents.optiScore > 50, "contested ≠ banned; not tanked");
});

test("irritant penalty is dose/use-aware: rinse-off is gentler than leave-on", () => {
  const leaveOn = scoreCosmeticProduct(cosmetic({ inci: "Water, Sodium Lauryl Sulfate, Glycerin", use: "leave_on" }), EMPTY_PROFILE);
  const rinseOff = scoreCosmeticProduct(cosmetic({ inci: "Water, Sodium Lauryl Sulfate, Glycerin", use: "rinse_off" }), EMPTY_PROFILE);
  assert.ok(rinseOff.scoreComponents.sensitizationScore > leaveOn.scoreComponents.sensitizationScore);
  assert.ok(leaveOn.reasonCodes.includes("COS_IRRITANT"));
});

test("restricted actives advise pregnancy caution; pregnancy_safe profile conflicts", () => {
  const product = cosmetic({ inci: "Water, Retinol, Glycerin" });
  const universal = scoreCosmeticProduct(product, EMPTY_PROFILE);
  assert.ok(universal.reasonCodes.includes("COS_RESTRICTED_USE"));

  const pregnancy: CosmeticProfile = { id: "p", preferences: ["pregnancy_safe"], avoidedIngredients: [] };
  const personal = scoreCosmeticProduct(product, pregnancy);
  assert.ok(personal.personalizationReasonCodes.includes("PERS_PREGNANCY_CONFLICT"));
  assert.equal(personal.safetyLevel, "caution");
  assert.ok(personal.scoreComponents.optiFit < personal.scoreComponents.optiScore);
});

test("buildCosmeticCard assembles a consumer card with advisories and alternatives", () => {
  const fragranced = cosmetic({ inci: "Water, Glycerin, Parfum, Limonene", name: "Scented Cream" });
  const clean = cosmetic({ inci: "Water, Glycerin, Squalane", name: "Unscented Cream" });
  const card = buildCosmeticCard({ product: fragranced, profile: EMPTY_PROFILE, alternatives: [clean] });

  assert.equal(card.vertical, "cosmetic");
  assert.equal(card.methodology.version, "cosmetic-us-ca-v1");
  assert.ok(card.advisories.length > 0, "fragranced product surfaces advisories");
  assert.equal(card.alternatives.length, 1);
  assert.ok(card.alternatives[0].whyBetter.length > 0);
  assert.equal(typeof card.scores.optiScore, "number");
});

test("fragrance-free profile conflicts with a fragranced product", () => {
  const product = cosmetic({ inci: "Water, Glycerin, Parfum, Limonene" });
  const fragranceFree: CosmeticProfile = { id: "ff", preferences: ["fragrance_free"], avoidedIngredients: [] };
  const score = scoreCosmeticProduct(product, fragranceFree);
  assert.ok(score.personalizationReasonCodes.includes("PERS_FRAGRANCE_CONFLICT"));
  assert.equal(score.safetyLevel, "caution");
  assert.ok(score.scoreComponents.optiFit < score.scoreComponents.optiScore);
});
