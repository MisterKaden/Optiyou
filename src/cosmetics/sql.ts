import { sqlNumber, sqlText } from "../ingestion/sql.ts";
import type { CosmeticScoreResult } from "./types.ts";
import type { NormalizedCosmetic } from "./open-beauty-facts.ts";

// Idempotent (INSERT OR IGNORE) statements that load one normalized cosmetic product into the shared
// product schema (vertical='cosmetic') plus the cosmetic_scores table. OFFLINE BULK SEED ONLY — the
// request path must use parameterized prepared statements (see repository.ts).
export function buildCosmeticStatements(normalized: NormalizedCosmetic, score: CosmeticScoreResult): string[] {
  const { product } = normalized;
  const versionId = product.versionId;
  const sourceId = `${versionId}_src`;
  const conflictFlagsJson = JSON.stringify(product.dataQuality.conflictFlags);
  const statements: string[] = [];

  statements.push(
    "INSERT OR IGNORE INTO products " +
    "(id, gtin, market, category, current_version_id, verification_status, brand_confirmation, user_contribution_count, conflict_flags_json, last_seen_at, vertical) " +
    `VALUES (${sqlText(product.id)}, ${sqlText(product.gtin)}, 'US_CA', ${sqlText(product.category)}, ${sqlText(versionId)}, ` +
    `${sqlText(product.dataQuality.verificationStatus)}, 'none', 0, ${sqlText(conflictFlagsJson)}, ${sqlText(normalized.observedAt)}, 'cosmetic');`
  );

  statements.push(
    "INSERT OR IGNORE INTO product_versions " +
    "(id, product_id, version_number, name, brand, image_r2_key, source_summary, status, primary_source, last_seen_at, cosmetic_use, has_undisclosed_fragrance) " +
    `VALUES (${sqlText(versionId)}, ${sqlText(product.id)}, 1, ${sqlText(product.name)}, ${sqlText(product.brand)}, NULL, ` +
    `'open_product_database', 'provisional', 'off', ${sqlText(normalized.observedAt)}, ${sqlText(product.use)}, ${product.hasUndisclosedFragrance ? 1 : 0});`
  );

  statements.push(
    "INSERT OR IGNORE INTO product_field_sources " +
    "(id, product_version_id, field_path, source_type, source_ref, observed_at, confidence, verification_status, last_seen_at, user_contribution_count, brand_confirmation, conflict_flags_json, source_published_at) " +
    `VALUES (${sqlText(sourceId)}, ${sqlText(versionId)}, '$', 'off', ${sqlText(normalized.sourceRef)}, ${sqlText(normalized.observedAt)}, ` +
    `${sqlNumber(product.dataQuality.confidence)}, 'unverified', ${sqlText(normalized.observedAt)}, 0, 'none', ${sqlText(conflictFlagsJson)}, ${sqlText(normalized.sourcePublishedAt)});`
  );

  for (const ingredient of product.ingredients) {
    const ingredientId = `${versionId}_i${ingredient.position}`;
    statements.push(
      "INSERT OR IGNORE INTO ingredients " +
      "(id, product_version_id, position, display_name, normalized_name, function, flags_json, source_id) " +
      `VALUES (${sqlText(ingredientId)}, ${sqlText(versionId)}, ${sqlNumber(ingredient.position)}, ${sqlText(ingredient.inci)}, ` +
      `${sqlText(ingredient.normalizedName)}, NULL, ${sqlText(JSON.stringify(ingredient.concerns))}, ${sqlText(sourceId)});`
    );
  }

  const c = score.scoreComponents;
  statements.push(
    "INSERT OR IGNORE INTO cosmetic_scores " +
    "(product_version_id, methodology_version, opti_score, hazard_score, sensitization_score, transparency_score, environmental_score, confidence_score, safety_level, grade_band, reason_codes_json, advisories_json, normalization_version, concern_version) " +
    `VALUES (${sqlText(versionId)}, ${sqlText(score.methodologyVersion)}, ${sqlNumber(c.optiScore)}, ${sqlNumber(c.hazardScore)}, ` +
    `${sqlNumber(c.sensitizationScore)}, ${sqlNumber(c.transparencyScore)}, ${sqlNumber(c.environmentalScore)}, ${sqlNumber(c.confidenceScore)}, ` +
    `${sqlText(score.safetyLevel)}, ${sqlText(score.gradeBand)}, ${sqlText(JSON.stringify(score.reasonCodes))}, ${sqlText(JSON.stringify(score.advisories))}, ` +
    `${sqlText(normalized.normalizationVersion)}, ${sqlText(normalized.concernVersion)});`
  );

  return statements;
}
