import type {
  Allergen,
  ContributionIntent,
  FoodProduct,
  Ingredient,
  IngredientFlag,
  IngestionQueueMessage,
  PersonalizationProfile,
  ProductCategory,
  ProcessingLevel,
  ScanSource,
  UploadKind
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

export interface ScanHistoryEntry {
  id: string;
  gtin: string;
  source: ScanSource;
  resultStatus: string;
  optiScore?: number;
  optiFit?: number;
  createdAt: string;
  product?: FoodProduct;
}

interface ScanHistoryRow {
  id: string;
  gtin: string;
  scan_source: string;
  result_status: string;
  opti_score: number | null;
  opti_fit: number | null;
  created_at: string;
}

interface ContributionProductRow {
  contribution_id: string;
  product_id: string;
  gtin: string;
  status: string;
}

interface ContributionReviewQueueRow {
  id: string;
  product_id: string;
  gtin: string;
  status: string;
  uploads_received: number;
  total_uploads: number;
  created_at: string;
  updated_at: string;
}

interface ContributionUploadRow {
  kind: UploadKind;
  r2_key: string;
  status: "awaiting_upload" | "uploaded";
  uploaded_at: string | null;
}

export interface ContributionUploadReceipt {
  contributionId: string;
  productId: string;
  gtin: string;
  status: string;
  readyForReview: boolean;
  uploads: Array<{
    kind: UploadKind;
    r2Key: string;
    status: "awaiting_upload" | "uploaded";
    uploadedAt?: string;
  }>;
  queueMessage?: IngestionQueueMessage;
}

export interface ContributionReviewQueueItem {
  id: string;
  productId: string;
  gtin: string;
  status: string;
  uploadsReceived: number;
  totalUploads: number;
  createdAt: string;
  updatedAt: string;
  uploads: Array<{
    kind: UploadKind;
    r2Key: string;
    status: "awaiting_upload" | "uploaded";
    uploadedAt?: string;
  }>;
}

export type ContributionReviewDecision = "needs_review" | "approved" | "rejected";

const REQUIRED_UPLOAD_KINDS: UploadKind[] = ["front_package", "nutrition_label", "ingredients_label"];

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

export async function searchProducts(env: Env, query: string, limit = 20): Promise<FoodProduct[]> {
  const term = query.trim();
  if (!term) {
    return [];
  }

  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const likeTerm = `%${term}%`;
  const exactGtin = term.replace(/\D/g, "");
  const rows = await env.DB.prepare(`
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
    WHERE p.gtin LIKE ? OR pv.name LIKE ? OR pv.brand LIKE ? OR p.category LIKE ?
    ORDER BY
      CASE
        WHEN p.gtin = ? THEN 0
        WHEN pv.name LIKE ? THEN 1
        WHEN pv.brand LIKE ? THEN 2
        ELSE 3
      END,
      p.last_seen_at DESC
    LIMIT ${safeLimit}
  `).bind(likeTerm, likeTerm, likeTerm, likeTerm, exactGtin, likeTerm, likeTerm).all<ProductRow>();

  const products: FoodProduct[] = [];
  for (const row of rows.results) {
    products.push(await loadProductFromRow(env, row));
  }

  return products;
}

export async function listScanHistory(env: Env, userId: string, limit = 50): Promise<ScanHistoryEntry[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const rows = await env.DB.prepare(`
    SELECT id, gtin, scan_source, result_status, opti_score, opti_fit, created_at
    FROM scan_history
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ${safeLimit}
  `).bind(userId).all<ScanHistoryRow>();

  const entries: ScanHistoryEntry[] = [];
  for (const row of rows.results) {
    const product = row.result_status === "known" ? await findProductByGtin(env, row.gtin) : null;
    entries.push({
      id: row.id,
      gtin: row.gtin,
      source: scanSourceFromDatabase(row.scan_source),
      resultStatus: row.result_status,
      optiScore: row.opti_score ?? undefined,
      optiFit: row.opti_fit ?? undefined,
      createdAt: row.created_at,
      product: product ?? undefined
    });
  }

  return entries;
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

export async function markUploadReceived(
  env: Env,
  contributionId: string,
  objectKey: string
): Promise<ContributionUploadReceipt> {
  await env.DB.prepare(`
    UPDATE contribution_uploads
    SET status = 'uploaded', uploaded_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE contribution_id = ? AND r2_key = ?
  `).bind(contributionId, objectKey).run();

  const contribution = await loadContributionProduct(env, contributionId);

  if (!contribution) {
    throw new HttpError(404, "contribution_not_found", "Contribution was not found for this upload.");
  }

  const uploads = await listContributionUploads(env, contributionId);
  const uploadedKinds = new Set(
    uploads
      .filter((upload) => upload.status === "uploaded")
      .map((upload) => upload.kind)
  );
  const readyForReview = REQUIRED_UPLOAD_KINDS.every((kind) => uploadedKinds.has(kind));
  const transitionedToReview = readyForReview ? await markContributionReadyForReview(env, contributionId) : false;
  const latestContribution = transitionedToReview ? {
    ...contribution,
    status: "needs_review"
  } : readyForReview ? await loadContributionProduct(env, contributionId) ?? contribution : contribution;

  if (!transitionedToReview && readyForReview && latestContribution.status === "awaiting_uploads") {
    throw new HttpError(409, "contribution_review_transition_failed", "Contribution upload status could not be finalized.");
  }

  return {
    contributionId,
    productId: contribution.product_id,
    gtin: contribution.gtin,
    status: latestContribution.status,
    readyForReview,
    uploads,
    queueMessage: transitionedToReview ? {
      type: "ingest_missing_product",
      productId: contribution.product_id,
      contributionId,
      gtin: contribution.gtin,
      market: "US_CA",
      uploadKeys: uploadKeysFromRows(uploads)
    } : undefined
  };
}

async function markContributionReadyForReview(env: Env, contributionId: string): Promise<boolean> {
  const result = await env.DB.prepare(`
      UPDATE contributions
      SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ?
        AND status NOT IN ('needs_review', 'approved', 'rejected')
    `).bind("needs_review", contributionId).run();

  return d1ResultChangedRows(result);
}

export async function listContributionReviewQueue(env: Env): Promise<ContributionReviewQueueItem[]> {
  const rows = await env.DB.prepare(`
    SELECT
      c.id,
      c.product_id,
      p.gtin,
      c.status,
      SUM(CASE WHEN cu.status = 'uploaded' THEN 1 ELSE 0 END) AS uploads_received,
      COUNT(cu.id) AS total_uploads,
      c.created_at,
      c.updated_at
    FROM contributions c
    JOIN products p ON p.id = c.product_id
    LEFT JOIN contribution_uploads cu ON cu.contribution_id = c.id
    WHERE c.status IN ('awaiting_uploads', 'uploaded', 'needs_review')
    GROUP BY c.id, c.product_id, p.gtin, c.status, c.created_at, c.updated_at
    ORDER BY c.updated_at DESC, c.created_at DESC
    LIMIT 50
  `).all<ContributionReviewQueueRow>();

  const queue: ContributionReviewQueueItem[] = [];
  for (const row of rows.results) {
    queue.push({
      id: row.id,
      productId: row.product_id,
      gtin: row.gtin,
      status: row.status,
      uploadsReceived: row.uploads_received,
      totalUploads: row.total_uploads,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      uploads: await listContributionUploads(env, row.id)
    });
  }

  return queue;
}

export async function reviewContribution(
  env: Env,
  input: {
    contributionId: string;
    status: ContributionReviewDecision;
    notes?: string;
    actorId: string;
  }
): Promise<{ id: string; status: ContributionReviewDecision }> {
  const contribution = await loadContributionProduct(env, input.contributionId);
  if (!contribution) {
    throw new HttpError(404, "contribution_not_found", "Contribution was not found.");
  }

  const notes = input.notes?.trim().slice(0, 2000);
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE contributions
      SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ?
    `).bind(input.status, input.contributionId),
    env.DB.prepare(`
      INSERT INTO correction_reviews (id, product_id, contribution_id, status, reviewer_user_id, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(`review_${crypto.randomUUID()}`, contribution.product_id, input.contributionId, input.status, null, notes ?? null),
    env.DB.prepare(`
      INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, before_json, after_json)
      VALUES (?, ?, 'review_contribution', 'contribution', ?, ?, ?)
    `).bind(
      `audit_${crypto.randomUUID()}`,
      input.actorId,
      input.contributionId,
      JSON.stringify({ status: contribution.status }),
      JSON.stringify({ status: input.status, notes: notes || undefined })
    )
  ]);

  return { id: input.contributionId, status: input.status };
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

function scanSourceFromDatabase(value: string): ScanSource {
  switch (value) {
    case "manual_search":
      return "manual_search";
    case "nutrition_photo":
      return "nutrition_photo";
    case "ingredients_photo":
      return "ingredients_photo";
    default:
      return "barcode";
  }
}

async function loadContributionProduct(env: Env, contributionId: string): Promise<ContributionProductRow | null> {
  return env.DB.prepare(`
    SELECT c.id AS contribution_id, c.product_id, p.gtin, c.status
    FROM contributions c
    JOIN products p ON p.id = c.product_id
    WHERE c.id = ?
    LIMIT 1
  `).bind(contributionId).first<ContributionProductRow>();
}

async function listContributionUploads(
  env: Env,
  contributionId: string
): Promise<ContributionUploadReceipt["uploads"]> {
  const rows = await env.DB.prepare(`
    SELECT kind, r2_key, status, uploaded_at
    FROM contribution_uploads
    WHERE contribution_id = ?
    ORDER BY CASE kind
      WHEN 'front_package' THEN 1
      WHEN 'nutrition_label' THEN 2
      WHEN 'ingredients_label' THEN 3
      ELSE 4
    END
  `).bind(contributionId).all<ContributionUploadRow>();

  return rows.results.map((row) => ({
    kind: row.kind,
    r2Key: row.r2_key,
    status: row.status,
    uploadedAt: row.uploaded_at ?? undefined
  }));
}

function uploadKeysFromRows(
  uploads: Array<{ kind: UploadKind; r2Key: string }>
): Record<UploadKind, string> {
  const keys = Object.fromEntries(uploads.map((upload) => [upload.kind, upload.r2Key])) as Partial<Record<UploadKind, string>>;

  for (const kind of REQUIRED_UPLOAD_KINDS) {
    if (!keys[kind]) {
      throw new Error(`Contribution is missing required upload key for ${kind}.`);
    }
  }

  return keys as Record<UploadKind, string>;
}

function d1ResultChangedRows(result: unknown): boolean {
  if (!result || typeof result !== "object") {
    return false;
  }

  const meta = Reflect.get(result, "meta");
  if (!meta || typeof meta !== "object") {
    return false;
  }

  const changes = Reflect.get(meta, "changes");
  if (typeof changes === "number") {
    return changes > 0;
  }

  const rowsWritten = Reflect.get(meta, "rows_written");
  if (typeof rowsWritten === "number") {
    return rowsWritten > 0;
  }

  return Reflect.get(meta, "changed_db") === true;
}
