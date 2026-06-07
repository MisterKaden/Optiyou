import assert from "node:assert/strict";
import test from "node:test";

import { normalizeOpenBeautyProduct, type OpenBeautyFactsProduct } from "../src/cosmetics/open-beauty-facts.ts";
import { buildCosmeticStatements } from "../src/cosmetics/sql.ts";
import { scoreCosmeticProduct } from "../src/cosmetics/scoring.ts";
import type { CosmeticProfile } from "../src/cosmetics/types.ts";

const EMPTY_PROFILE: CosmeticProfile = { id: "t", preferences: [], avoidedIngredients: [] };

const SAMPLE: OpenBeautyFactsProduct = {
  code: "3600540000000",
  product_name: "Gentle Hydrating Moisturizer",
  brands: "Clean Co, SubBrand",
  ingredients_text: "Aqua, Glycerin, Cetearyl Alcohol, Parfum, Limonene, Phenoxyethanol",
  categories_tags: ["en:moisturizers", "en:face-creams"],
  last_modified_t: 1_700_000_000
};

test("normalizeOpenBeautyProduct maps an OBF record to a cosmetic product", () => {
  const normalized = normalizeOpenBeautyProduct(SAMPLE, { observedAt: "2026-06-06T00:00:00.000Z" });
  assert.ok(normalized);
  assert.equal(normalized.product.gtin, "3600540000000");
  assert.equal(normalized.product.vertical, "cosmetic");
  assert.equal(normalized.product.brand, "Clean Co", "uses the first brand");
  assert.equal(normalized.product.category, "skincare");
  assert.equal(normalized.product.use, "leave_on");
  assert.equal(normalized.product.hasUndisclosedFragrance, true);
  assert.equal(normalized.primarySource, "off", "Open Beauty Facts is ODbL — tagged off for isolation");
  assert.equal(normalized.observedAt, "2026-06-06T00:00:00.000Z");
  assert.ok(normalized.sourcePublishedAt, "derives sourcePublishedAt from last_modified_t");
});

test("normalizeOpenBeautyProduct drops confidence when there is no ingredient list", () => {
  const normalized = normalizeOpenBeautyProduct({ code: "3600540000001", product_name: "Mystery Cream" });
  assert.ok(normalized);
  assert.ok(normalized.product.dataQuality.confidence < 0.5);
  assert.ok(normalized.product.dataQuality.conflictFlags.includes("no_ingredient_list"));
});

test("normalizeOpenBeautyProduct returns null without a usable barcode", () => {
  assert.equal(normalizeOpenBeautyProduct({ product_name: "No Code" }), null);
});

test("buildCosmeticStatements writes cosmetic rows with off provenance and cosmetic_scores", () => {
  const normalized = normalizeOpenBeautyProduct({ ...SAMPLE, product_name: "L'Oréal Serum" });
  assert.ok(normalized);
  const score = scoreCosmeticProduct(normalized.product, EMPTY_PROFILE);
  const sql = buildCosmeticStatements(normalized, score).join("\n");
  assert.ok(sql.includes("INSERT OR IGNORE INTO products"));
  assert.ok(sql.includes("'cosmetic'"));
  assert.ok(sql.includes("'off'"), "primary_source/source_type is off");
  assert.ok(sql.includes("'L''Oréal Serum'"), "escapes the apostrophe");
  assert.ok(sql.includes("INSERT OR IGNORE INTO cosmetic_scores"));
});
