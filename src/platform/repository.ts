import type {
  Allergen,
  ContributionIntent,
  FoodProduct,
  Ingredient,
  IngredientFlag,
  PersonalizationProfile,
  ProductCategory,
  ProcessingLevel
} from "./types.ts";
import type { AuthenticatedUser } from "./auth.ts";
import { HttpError } from "../http/responses.ts";

interface ProductRow {
  product_id: string;
  gtin: string;
  market: "US_CA";
  category: ProductCategory;
  version_id: string;
  version_number: number;
  name: string;
  brand: string;
  image_r2_key: string | null;
  verification_status: FoodProduct["dataQuality"]["verificationStatus"];
  brand_confirmation: FoodProduct["dataQuality"]["brandConfirmation"];
  user_contribution_count: number;
  conflict_flags_json: string;
  last_seen_at: string;
  source_summary: string;
  data_confidence: number;
}

interface NutritionRow {
  calories: number;
  added_sugar_grams: number;
  protein_grams: number;
  fiber_grams: number;
  sodium_milligrams: number;
}

interface IngredientRow {
  position: number;
  display_name: string;
  flags_json: string;
}

interface AllergenRow {
  allergen: Allergen;
}

interface ProfileRow {
  id: string;
  preferences_json: string;
  allergens_json: string;
  avoided_ingredients_json: string;
}

export async function findProductByGtin(env: Env, gtin: string): Promise<FoodProduct | null> {
  const row = await env.DB.prepare(`
    SELECT
      p.id AS product_id,
      p.gtin,
      p.market,
      p.category,
      pv.id AS version_id,
      pv.version_number,
      pv.name,
      pv.brand,
      pv.image_r2_key,
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
      ), 0.58) AS data_confidence
    FROM products p
    JOIN product_versions pv ON pv.id = p.current_version_id
    WHERE p.gtin = ?
    LIMIT 1
  `).bind(gtin).first<ProductRow>();

  if (!row) {
    return null;
  }

  return loadProductFromRow(env, row);
}

export async function loadProfile(env: Env, userId: string, profileId?: string): Promise<PersonalizationProfile> {
  if (!profileId) {
    return defaultProfile(userId);
  }

  const row = await env.DB.prepare(`
    SELECT id, preferences_json, allergens_json, avoided_ingredients_json
    FROM profiles
    WHERE id = ? AND user_id = ?
    LIMIT 1
  `).bind(profileId, userId).first<ProfileRow>();

  if (!row) {
    throw new HttpError(404, "profile_not_found", "Profile was not found for this user.");
  }

  return {
    id: row.id,
    preferences: parseStringArray(row.preferences_json),
    allergens: parseStringArray(row.allergens_json),
    avoidedIngredients: parseStringArray(row.avoided_ingredients_json)
  } as PersonalizationProfile;
}

export async function ensureUser(env: Env, user: Pick<AuthenticatedUser, "id" | "email">): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO users (id, email)
    VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET
      email = COALESCE(excluded.email, users.email),
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `).bind(user.id, user.email ?? null).run();
}

export async function listAlternatives(env: Env, product: FoodProduct): Promise<FoodProduct[]> {
  const rows = await env.DB.prepare(`
    SELECT
      alt.id AS product_id,
      alt.gtin,
      alt.market,
      alt.category,
      pv.id AS version_id,
      pv.version_number,
      pv.name,
      pv.brand,
      pv.image_r2_key,
      alt.verification_status,
      alt.brand_confirmation,
      alt.user_contribution_count,
      alt.conflict_flags_json,
      alt.last_seen_at,
      pv.source_summary,
      COALESCE((
        SELECT AVG(confidence)
        FROM product_field_sources pfs
        WHERE pfs.product_version_id = pv.id
      ), 0.58) AS data_confidence
    FROM alternatives a
    JOIN products p ON p.id = a.product_id
    JOIN products alt ON alt.id = a.alternative_product_id
    JOIN product_versions pv ON pv.id = alt.current_version_id
    WHERE p.gtin = ? AND a.paid_placement = 0
    LIMIT 3
  `).bind(product.gtin).all<ProductRow>();

  const products: FoodProduct[] = [];
  for (const row of rows.results) {
    products.push(await loadProductFromRow(env, row));
  }

  return products;
}

export async function createContributionShell(
  env: Env,
  intent: ContributionIntent,
  userId: string
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO products (
      id, gtin, market, category, verification_status, brand_confirmation, user_contribution_count
    ) VALUES (?, ?, 'US_CA', 'unknown', 'unverified', 'none', 1)
    ON CONFLICT(gtin) DO UPDATE SET
      user_contribution_count = user_contribution_count + 1,
      last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `).bind(intent.product.id, intent.product.gtin).run();

  const product = await env.DB.prepare(`
    SELECT id
    FROM products
    WHERE gtin = ?
    LIMIT 1
  `).bind(intent.product.gtin).first<{ id: string }>();

  if (!product) {
    throw new Error(`Product shell was not created for GTIN ${intent.product.gtin}.`);
  }

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO contributions (id, product_id, user_id, profile_id, status)
      VALUES (?, ?, ?, ?, ?)
    `).bind(intent.contribution.id, product.id, userId, intent.contribution.profileId, intent.contribution.status),
    ...intent.uploads.map((upload) =>
      env.DB.prepare(`
        INSERT INTO contribution_uploads (id, contribution_id, kind, r2_key, status)
        VALUES (?, ?, ?, ?, 'awaiting_upload')
      `).bind(`upload_${crypto.randomUUID()}`, intent.contribution.id, upload.kind, upload.objectKey)
    )
  ]);
}

export async function markUploadReceived(env: Env, contributionId: string, objectKey: string): Promise<void> {
  await env.DB.prepare(`
    UPDATE contribution_uploads
    SET status = 'uploaded', uploaded_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE contribution_id = ? AND r2_key = ?
  `).bind(contributionId, objectKey).run();
}

export async function recordScan(
  env: Env,
  input: {
    userId: string;
    profileId?: string;
    productId?: string;
    gtin: string;
    scanSource: string;
    resultStatus: string;
    optiScore?: number;
    optiFit?: number;
  }
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO scan_history (
      id, user_id, profile_id, product_id, gtin, scan_source, result_status, opti_score, opti_fit
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    `scan_${crypto.randomUUID()}`,
    input.userId,
    input.profileId ?? null,
    input.productId ?? null,
    input.gtin,
    input.scanSource,
    input.resultStatus,
    input.optiScore ?? null,
    input.optiFit ?? null
  ).run();
}

async function loadProductFromRow(env: Env, row: ProductRow): Promise<FoodProduct> {
  const nutrition = await env.DB.prepare(`
    SELECT calories, added_sugar_grams, protein_grams, fiber_grams, sodium_milligrams
    FROM nutrition_facts
    WHERE product_version_id = ?
    LIMIT 1
  `).bind(row.version_id).first<NutritionRow>();
  const ingredientRows = await env.DB.prepare(`
    SELECT position, display_name, flags_json
    FROM ingredients
    WHERE product_version_id = ?
    ORDER BY position ASC
  `).bind(row.version_id).all<IngredientRow>();
  const allergenRows = await env.DB.prepare(`
    SELECT allergen
    FROM product_allergens
    WHERE product_version_id = ?
  `).bind(row.version_id).all<AllergenRow>();

  if (!nutrition) {
    throw new Error(`Product ${row.product_id} has no nutrition facts.`);
  }

  return {
    id: row.product_id,
    gtin: row.gtin,
    market: row.market,
    category: row.category,
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
    nutrition: {
      calories: nutrition.calories,
      addedSugarGrams: nutrition.added_sugar_grams,
      proteinGrams: nutrition.protein_grams,
      fiberGrams: nutrition.fiber_grams,
      sodiumMilligrams: nutrition.sodium_milligrams
    },
    ingredients: ingredientRows.results.map((ingredient): Ingredient => ({
      position: ingredient.position,
      name: ingredient.display_name,
      flags: parseStringArray(ingredient.flags_json) as IngredientFlag[]
    })),
    allergens: allergenRows.results.map((item) => item.allergen),
    processingLevel: processingFromIngredients(ingredientRows.results),
    imageUrl: row.image_r2_key ? `r2://${row.image_r2_key}` : undefined
  };
}

function defaultProfile(id: string): PersonalizationProfile {
  return {
    id,
    preferences: [],
    allergens: [],
    avoidedIngredients: []
  };
}

function parseStringArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function sourceFromSummary(source: string): FoodProduct["dataQuality"]["source"] {
  if (source === "verified_label" || source === "brand_portal" || source === "open_product_database" ||
    source === "community_contribution" || source === "ai_extraction") {
    return source;
  }
  return "community_contribution";
}

function processingFromIngredients(ingredients: IngredientRow[]): ProcessingLevel {
  const flags = new Set(ingredients.flatMap((ingredient) => parseStringArray(ingredient.flags_json)));
  if (flags.has("ultra_processed_marker")) {
    return "high";
  }
  return ingredients.length <= 4 ? "minimal" : "moderate";
}
