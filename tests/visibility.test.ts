import assert from "node:assert/strict";
import test from "node:test";

import { USER_VISIBILITY_MIN_CONFIDENCE, includeUnverified, isUserVisible, visibilityLabel } from "../src/platform/visibility.ts";
import type { FoodProduct, VerificationStatus } from "../src/platform/types.ts";

function productWith(verificationStatus: VerificationStatus, confidence: number): FoodProduct {
  return {
    id: "p", gtin: "0", market: "US_CA", category: "unknown", name: "P", brand: "B",
    versionId: "v", version: 1,
    dataQuality: {
      source: "open_product_database",
      observedAt: "2026-01-01T00:00:00.000Z",
      confidence,
      verificationStatus,
      lastSeenAt: "2026-01-01T00:00:00.000Z",
      userContributionCount: 0,
      brandConfirmation: "none",
      conflictFlags: []
    },
    nutrition: { calories: 0, addedSugarGrams: 0, proteinGrams: 0, fiberGrams: 0, sodiumMilligrams: 0 },
    ingredients: [], allergens: [], processingLevel: "minimal"
  };
}

test("verified products are always user-visible", () => {
  assert.equal(isUserVisible(productWith("verified", 0.1)), true);
});

test("unverified products are visible only at or above the confidence bar", () => {
  assert.equal(isUserVisible(productWith("unverified", USER_VISIBILITY_MIN_CONFIDENCE)), true);
  assert.equal(isUserVisible(productWith("unverified", 0.8)), true, "USDA bulk import (~0.8) is visible");
  assert.equal(isUserVisible(productWith("unverified", 0.45)), false, "incomplete-data records are hidden");
});

test("conflicted and needs_review products are never user-visible", () => {
  assert.equal(isUserVisible(productWith("conflicted", 0.99)), false);
  assert.equal(isUserVisible(productWith("needs_review", 0.99)), false);
});

test("visibilityLabel reflects the gate", () => {
  assert.equal(visibilityLabel(productWith("verified", 0.9)), "public");
  assert.equal(visibilityLabel(productWith("unverified", 0.4)), "admin_only");
});

test("includeUnverified is admin-only and opt-out-able", () => {
  const base = new URL("https://optiyou.test/v1/products?query=x");
  const optOut = new URL("https://optiyou.test/v1/products?query=x&includeUnverified=false");
  assert.equal(includeUnverified(false, base), false, "non-admins are always gated");
  assert.equal(includeUnverified(false, optOut), false);
  assert.equal(includeUnverified(true, base), true, "admins see unverified by default");
  assert.equal(includeUnverified(true, optOut), false, "admins can preview the user view");
});
