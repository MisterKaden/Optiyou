import type { ScoreResult } from "../platform/types.ts";
import type { NormalizedProduct } from "./usda.ts";

export function sqlText(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  return `'${value.replace(/'/g, "''")}'`;
}

export function sqlNumber(value: number): string {
  return Number.isFinite(value) ? String(value) : "0";
}

// Builds idempotent (INSERT OR IGNORE) statements that load one normalized USDA product,
// its version, provenance, nutrition, ingredients, allergens, and precomputed score into
// the D1 schema. Designed to be batched into .sql files and applied with `wrangler d1 execute`.
//
// IMPORTANT: this string-building path is for OFFLINE BULK SEEDING ONLY. The live ingestion
// pipeline and request handlers must use parameterized prepared statements (env.DB.prepare().bind()),
// as in repository.ts — never feed runtime/user input through this builder.
export function buildProductStatements(normalized: NormalizedProduct, score: ScoreResult): string[] {
  const { product } = normalized;
  const versionId = product.versionId;
  const sourceId = `${versionId}_src`;
  const conflictFlagsJson = JSON.stringify(product.dataQuality.conflictFlags);
  const statements: string[] = [];

  statements.push(
    "INSERT OR IGNORE INTO products " +
    "(id, gtin, market, category, current_version_id, verification_status, brand_confirmation, user_contribution_count, conflict_flags_json, last_seen_at) " +
    `VALUES (${sqlText(product.id)}, ${sqlText(product.gtin)}, 'US_CA', ${sqlText(product.category)}, ${sqlText(versionId)}, ` +
    `${sqlText(product.dataQuality.verificationStatus)}, 'none', 0, ${sqlText(conflictFlagsJson)}, ${sqlText(normalized.observedAt)});`
  );

  statements.push(
    "INSERT OR IGNORE INTO product_versions " +
    "(id, product_id, version_number, name, brand, image_r2_key, source_summary, status, primary_source, last_seen_at) " +
    `VALUES (${sqlText(versionId)}, ${sqlText(product.id)}, 1, ${sqlText(product.name)}, ${sqlText(product.brand)}, NULL, ` +
    `'open_product_database', 'provisional', 'usda', ${sqlText(normalized.observedAt)});`
  );

  statements.push(
    "INSERT OR IGNORE INTO product_field_sources " +
    "(id, product_version_id, field_path, source_type, source_ref, observed_at, confidence, verification_status, last_seen_at, user_contribution_count, brand_confirmation, conflict_flags_json, source_published_at) " +
    `VALUES (${sqlText(sourceId)}, ${sqlText(versionId)}, '$', 'usda', ${sqlText(normalized.sourceRef)}, ${sqlText(normalized.observedAt)}, ` +
    `${sqlNumber(product.dataQuality.confidence)}, 'unverified', ${sqlText(normalized.observedAt)}, 0, 'none', ${sqlText(conflictFlagsJson)}, ${sqlText(normalized.sourcePublishedAt)});`
  );

  const nutrition = product.nutrition;
  statements.push(
    "INSERT OR IGNORE INTO nutrition_facts " +
    "(product_version_id, calories, added_sugar_grams, protein_grams, fiber_grams, sodium_milligrams, source_id) " +
    `VALUES (${sqlText(versionId)}, ${sqlNumber(nutrition.calories)}, ${sqlNumber(nutrition.addedSugarGrams)}, ` +
    `${sqlNumber(nutrition.proteinGrams)}, ${sqlNumber(nutrition.fiberGrams)}, ${sqlNumber(nutrition.sodiumMilligrams)}, ${sqlText(sourceId)});`
  );

  for (const ingredient of product.ingredients) {
    const ingredientId = `${versionId}_i${ingredient.position}`;
    statements.push(
      "INSERT OR IGNORE INTO ingredients " +
      "(id, product_version_id, position, display_name, normalized_name, function, flags_json, source_id) " +
      `VALUES (${sqlText(ingredientId)}, ${sqlText(versionId)}, ${sqlNumber(ingredient.position)}, ${sqlText(ingredient.name)}, ` +
      `${sqlText(ingredient.name.toLowerCase())}, NULL, ${sqlText(JSON.stringify(ingredient.flags))}, ${sqlText(sourceId)});`
    );
  }

  for (const allergen of product.allergens) {
    statements.push(
      "INSERT OR IGNORE INTO product_allergens (product_version_id, allergen, source_id) " +
      `VALUES (${sqlText(versionId)}, ${sqlText(allergen)}, ${sqlText(sourceId)});`
    );
  }

  const components = score.scoreComponents;
  statements.push(
    "INSERT OR IGNORE INTO scores " +
    "(product_version_id, methodology_version, opti_score, nutrition_score, ingredient_score, processing_score, confidence_score, reason_codes_json, grade_band, normalization_version, ingredient_flag_version) " +
    `VALUES (${sqlText(versionId)}, ${sqlText(score.methodologyVersion)}, ${sqlNumber(components.optiScore)}, ` +
    `${sqlNumber(components.nutritionScore)}, ${sqlNumber(components.ingredientScore)}, ${sqlNumber(components.processingScore)}, ` +
    `${sqlNumber(components.confidenceScore)}, ${sqlText(JSON.stringify(score.reasonCodes))}, ${sqlText(score.gradeBand)}, ` +
    `${sqlText(normalized.normalizationVersion)}, ${sqlText(normalized.ingredientFlagVersion)});`
  );

  return statements;
}
