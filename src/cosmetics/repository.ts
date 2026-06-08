import type {
  CosmeticCategory,
  CosmeticConcernType,
  CosmeticIngredient,
  CosmeticProduct,
  CosmeticUse
} from "./types.ts";
import type { ProductDataSource, VerificationStatus, BrandConfirmation } from "../platform/types.ts";

interface CosmeticRow {
  product_id: string;
  gtin: string;
  category: string;
  version_id: string;
  version_number: number;
  name: string;
  brand: string;
  image_r2_key: string | null;
  cosmetic_use: string | null;
  has_undisclosed_fragrance: number;
  verification_status: VerificationStatus;
  brand_confirmation: BrandConfirmation;
  user_contribution_count: number;
  conflict_flags_json: string;
  last_seen_at: string;
  source_summary: string;
  data_confidence: number;
}

interface CosmeticIngredientRow {
  position: number;
  display_name: string;
  normalized_name: string;
  flags_json: string;
}

export async function findCosmeticByGtin(env: Env, gtin: string): Promise<CosmeticProduct | null> {
  const row = await env.DB.prepare(`
    SELECT
      p.id AS product_id,
      p.gtin,
      p.category,
      pv.id AS version_id,
      pv.version_number,
      pv.name,
      pv.brand,
      pv.image_r2_key,
      pv.cosmetic_use,
      pv.has_undisclosed_fragrance,
      p.verification_status,
      p.brand_confirmation,
      p.user_contribution_count,
      p.conflict_flags_json,
      p.last_seen_at,
      pv.source_summary,
      COALESCE((
        SELECT AVG(confidence)
        FROM product_field_sources pfs
        WHERE pfs.product_version_id = pv.id
      ), 0.5) AS data_confidence
    FROM products p
    JOIN product_versions pv ON pv.id = p.current_version_id
    WHERE p.gtin = ? AND p.vertical = 'cosmetic'
    LIMIT 1
  `).bind(gtin).first<CosmeticRow>();

  if (!row) {
    return null;
  }

  const ingredientRows = await env.DB.prepare(`
    SELECT position, display_name, normalized_name, flags_json
    FROM ingredients
    WHERE product_version_id = ?
    ORDER BY position ASC
  `).bind(row.version_id).all<CosmeticIngredientRow>();

  const ingredients: CosmeticIngredient[] = ingredientRows.results.map((item) => ({
    position: item.position,
    inci: item.display_name,
    normalizedName: item.normalized_name,
    concerns: parseConcerns(item.flags_json)
  }));

  return {
    id: row.product_id,
    gtin: row.gtin,
    market: "US_CA",
    vertical: "cosmetic",
    category: mapCategory(row.category),
    use: mapUse(row.cosmetic_use),
    name: row.name,
    brand: row.brand,
    versionId: row.version_id,
    version: row.version_number,
    dataQuality: {
      source: sourceFromSummary(row.source_summary),
      observedAt: row.last_seen_at,
      confidence: row.data_confidence,
      verificationStatus: row.verification_status,
      lastSeenAt: row.last_seen_at,
      userContributionCount: row.user_contribution_count,
      brandConfirmation: row.brand_confirmation,
      conflictFlags: parseStringArray(row.conflict_flags_json)
    },
    ingredients,
    hasUndisclosedFragrance: row.has_undisclosed_fragrance === 1
  };
}

// Same-category cosmetics that score higher than the scanned product — the "better alternatives".
// Computed on the fly (no precomputed alternatives table for cosmetics yet); top 3 by OptiScore.
export async function listCosmeticAlternatives(
  env: Env,
  product: CosmeticProduct,
  minOptiScore: number
): Promise<CosmeticProduct[]> {
  const rows = await env.DB.prepare(`
    SELECT p.gtin
    FROM products p
    JOIN product_versions pv ON pv.id = p.current_version_id
    JOIN cosmetic_scores cs ON cs.product_version_id = pv.id
    WHERE p.vertical = 'cosmetic'
      AND p.category = ?
      AND p.gtin != ?
      AND cs.opti_score > ?
    ORDER BY cs.opti_score DESC
    LIMIT 3
  `).bind(product.category, product.gtin, minOptiScore).all<{ gtin: string }>();

  const alternatives: CosmeticProduct[] = [];
  for (const row of rows.results) {
    const alternative = await findCosmeticByGtin(env, row.gtin);
    if (alternative) {
      alternatives.push(alternative);
    }
  }
  return alternatives;
}

const CONCERN_TYPES = new Set<CosmeticConcernType>([
  "banned", "restricted_use", "cmr", "formaldehyde_releaser", "endocrine_suspected",
  "fragrance_allergen", "irritant", "environmental", "contested"
]);

function parseConcerns(json: string): CosmeticConcernType[] {
  return parseStringArray(json).filter((value): value is CosmeticConcernType =>
    CONCERN_TYPES.has(value as CosmeticConcernType));
}

function parseStringArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

const COSMETIC_CATEGORIES = new Set<CosmeticCategory>([
  "skincare", "haircare", "makeup", "deodorant", "suncare", "unknown"
]);

function mapCategory(value: string): CosmeticCategory {
  return COSMETIC_CATEGORIES.has(value as CosmeticCategory) ? (value as CosmeticCategory) : "unknown";
}

function mapUse(value: string | null): CosmeticUse {
  return value === "leave_on" || value === "rinse_off" ? value : "unknown";
}

function sourceFromSummary(source: string): ProductDataSource {
  if (source === "verified_label" || source === "brand_portal" || source === "open_product_database" ||
    source === "community_contribution" || source === "ai_extraction") {
    return source;
  }
  return "open_product_database";
}
