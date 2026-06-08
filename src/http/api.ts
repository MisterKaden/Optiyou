import { buildContributionIntent, verifyUploadToken } from "../contributions/contribution-intent.ts";
import { buildProductCard } from "../products/product-card.ts";
import { buildCosmeticCard } from "../cosmetics/product-card.ts";
import { scoreCosmeticProduct } from "../cosmetics/scoring.ts";
import { findCosmeticByGtin, listCosmeticAlternatives } from "../cosmetics/repository.ts";
import type { CosmeticPreference, CosmeticProfile } from "../cosmetics/types.ts";
import { scoreFoodProduct, FOOD_METHODOLOGY_VERSION } from "../scoring/food-scoring.ts";
import {
  createAppleSignInNonce,
  exchangeAppleIdentityToken,
  requireAdminAccess,
  requireUser,
  readSecret
} from "../platform/auth.ts";
import { includeUnverified, isUserVisible, visibilityLabel } from "../platform/visibility.ts";
import { planRefresh } from "../ingestion/refresh.ts";
import {
  createContributionShell,
  ensureUser,
  findProductByGtin,
  getAdminMetrics,
  listAlternatives,
  listContributionReviewQueue,
  listEvidenceCards,
  listScanHistory,
  loadProfile,
  markUploadReceived,
  recordScan,
  reviewContribution,
  searchProducts
} from "../platform/repository.ts";
import { errorResponse, HttpError, jsonResponse, readJsonBody } from "./responses.ts";
import type { FoodProduct, PersonalizationProfile, ProductCard, ScanRequestBody } from "../platform/types.ts";

interface RuntimeContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface ProductAnalytics {
  outcome: "known" | "missing" | "estimated" | "pending_verification";
  gtin: string;
  userId: string;
  optiScore?: number;
  optiFit?: number;
}

export async function handleApiRequest(request: Request, env: Env, ctx: RuntimeContext): Promise<Response> {
  const url = new URL(request.url);

  try {
    if (request.method === "POST" && url.pathname === "/v1/scan") {
      return await handleScan(request, env, ctx);
    }

    if (request.method === "GET" && url.pathname === "/v1/products") {
      return await handleProductSearch(request, env, url);
    }

    if (request.method === "GET" && url.pathname.startsWith("/v1/products/")) {
      return await handleProductLookup(request, env, url);
    }

    if (request.method === "GET" && url.pathname === "/v1/auth/apple/nonce") {
      return await handleAppleNonce(env);
    }

    if (request.method === "POST" && url.pathname === "/v1/auth/apple") {
      return await handleAppleSignIn(request, env);
    }

    if (request.method === "POST" && url.pathname === "/v1/score") {
      return await handleScore(request, env);
    }

    if (request.method === "POST" && url.pathname === "/v1/contributions") {
      return await handleContribution(request, env, ctx);
    }

    if (request.method === "PUT" && url.pathname.startsWith("/v1/uploads/")) {
      return await handleUpload(request, env, url, ctx);
    }

    if (request.method === "POST" && url.pathname === "/v1/ai/ask") {
      return await handleAsk(request, env);
    }

    if (request.method === "GET" && url.pathname === "/v1/methodology") {
      return handleMethodology();
    }

    if (request.method === "GET" && url.pathname === "/v1/history") {
      return await handleHistory(request, env, url);
    }

    if (request.method === "POST" && url.pathname === "/v1/storekit/notifications") {
      await requireUser(request, env);
      return jsonResponse({ accepted: true, service: "optiyou-subscriptions" }, { status: 202 });
    }

    if (url.pathname.startsWith("/v1/admin/")) {
      return await handleAdmin(request, env, url);
    }

    return errorResponse(404, "not_found", "API route not found.");
  } catch (error) {
    if (error instanceof HttpError) {
      return errorResponse(error.status, error.code, error.message, error.details);
    }

    console.error(JSON.stringify({
      level: "error",
      event: "api_unhandled_error",
      message: error instanceof Error ? error.message : "Unknown error"
    }));
    return errorResponse(500, "internal_error", "Unexpected platform error.");
  }
}

export async function handleIngestionQueue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    const body = message.body;

    if (isRefreshMessage(body)) {
      // Always-on pipeline: mark the product as queued for refresh. Full re-fetch + re-score is the
      // deploy-time integration (USDA/OBF re-pull through the importers).
      await env.APP_CONFIG.put(`refresh:${body.gtin}`, JSON.stringify({
        status: "refresh_planned",
        productId: body.productId,
        updatedAt: new Date().toISOString()
      }));
      message.ack();
      continue;
    }

    if (!isIngestionQueueMessage(body)) {
      message.ack();
      continue;
    }

    await env.APP_CONFIG.put(`ingestion:${body.contributionId}`, JSON.stringify({
      status: "queued_for_ai_extraction",
      productId: body.productId,
      gtin: body.gtin,
      uploadKeys: body.uploadKeys,
      updatedAt: new Date().toISOString()
    }));
    message.ack();
  }
}

// Nightly cron entry point: find stale catalog entries and enqueue them for refresh.
export async function handleScheduledRefresh(env: Env): Promise<void> {
  const rows = await env.DB.prepare(`
    SELECT id AS product_id, gtin, last_seen_at
    FROM products
    ORDER BY last_seen_at ASC
    LIMIT 500
  `).all<{ product_id: string; gtin: string; last_seen_at: string }>();

  const stale = planRefresh(
    rows.results.map((row) => ({ productId: row.product_id, gtin: row.gtin, lastSeenAt: row.last_seen_at })),
    new Date()
  );

  for (const candidate of stale.slice(0, 100)) {
    await env.INGESTION_QUEUE.send({ type: "refresh_product", productId: candidate.productId, gtin: candidate.gtin });
  }
}

function isRefreshMessage(value: unknown): value is { type: "refresh_product"; productId: string; gtin: string } {
  return Boolean(value) && typeof value === "object" &&
    Reflect.get(value as object, "type") === "refresh_product" &&
    typeof Reflect.get(value as object, "gtin") === "string" &&
    typeof Reflect.get(value as object, "productId") === "string";
}

async function handleScan(request: Request, env: Env, ctx: RuntimeContext): Promise<Response> {
  const user = await requireUser(request, env);
  await ensureUser(env, user);
  const body = parseScanRequest(await readJsonBody(request));
  const profile = body.profile ?? await loadProfile(env, user.id, body.profileId);
  const persistedProfileId = body.profile ? undefined : body.profileId;
  const cacheKey = await scanCacheKey(body.gtin, profile, body.skinPreferences);
  const cached = await env.PRODUCT_CACHE.get(cacheKey);

  if (cached) {
    const card = JSON.parse(cached) as ProductCard;
    // Only an admin may receive a cached card that is not user-visible (only visible cards are
    // cached, but this guards against stale entries if the threshold changes).
    if (user.isAdmin || isUserVisible(card.product)) {
      ctx.waitUntil(recordKnownScan(env, user.id, persistedProfileId, body.gtin, body.source ?? "barcode", card));
      ctx.waitUntil(writeScanAnalytics(env, {
        outcome: "known",
        gtin: body.gtin,
        userId: user.id,
        optiScore: card.scores.optiScore,
        optiFit: card.scores.optiFit
      }));
      return jsonResponse({ ...card, cache: "kv-hit", visibility: visibilityLabel(card.product) });
    }
  }

  const product = await findProductByGtin(env, body.gtin);
  if (!product) {
    // Not a food product — try the cosmetics vertical before treating it as missing.
    const cosmeticResponse = await tryCosmeticScan(request, env, ctx, user, body, profile, persistedProfileId, cacheKey);
    if (cosmeticResponse) {
      return cosmeticResponse;
    }

    const intent = await createMissingProductIntent(request, env, user.id, body.gtin, profile.id);
    await createContributionShell(env, intent, user.id);
    ctx.waitUntil(recordScan(env, {
      userId: user.id,
      profileId: persistedProfileId,
      gtin: body.gtin,
      scanSource: body.source ?? "barcode",
      resultStatus: "missing_product"
    }));
    ctx.waitUntil(writeScanAnalytics(env, { outcome: "missing", gtin: body.gtin, userId: user.id }));
    return jsonResponse(intent, { status: 202 });
  }

  const visible = isUserVisible(product);
  if (!visible && !user.isAdmin) {
    // The product exists but is not yet verified: show a "still verifying" state and invite a label
    // photo so the crowd can confirm it. Never leak the provisional card to a regular user.
    // TODO(contrib-dedup): createContributionShell inserts a fresh contribution + uploads on every
    // call, so repeat scans of the same unverified product accumulate duplicate open contributions
    // (also true of the missing-product path). Needs a "reuse open contribution for (user, product)"
    // guard that preserves the signed upload-token flow — do with integration tests, not unattended.
    const intent = await createMissingProductIntent(request, env, user.id, body.gtin, profile.id);
    await createContributionShell(env, intent, user.id);
    ctx.waitUntil(recordScan(env, {
      userId: user.id,
      profileId: persistedProfileId,
      productId: product.id,
      gtin: body.gtin,
      scanSource: body.source ?? "barcode",
      resultStatus: "pending_verification"
    }));
    ctx.waitUntil(writeScanAnalytics(env, { outcome: "pending_verification", gtin: body.gtin, userId: user.id }));
    // Flatten the intent (same shape as the missing-product response) + override status and add a
    // message, so clients handle "still verifying" and "missing" with one code path.
    return jsonResponse({
      ...intent,
      status: "pending_verification",
      message: "We're still verifying this product. Add a photo of the label to help us confirm it."
    }, { status: 202 });
  }

  const alternatives = await listAlternatives(env, product);
  const card = buildProductCard({
    product,
    profile,
    alternatives,
    explanation: explanationFromReasonCodes(product)
  });

  // Only cache user-visible cards so the visibility gate cannot be bypassed through the cache.
  if (visible) {
    ctx.waitUntil(env.PRODUCT_CACHE.put(cacheKey, JSON.stringify(card), { expirationTtl: 60 * 60 }));
  }
  ctx.waitUntil(recordScan(env, {
    userId: user.id,
    profileId: persistedProfileId,
    productId: product.id,
    gtin: body.gtin,
    scanSource: body.source ?? "barcode",
    resultStatus: "known",
    optiScore: card.scores.optiScore,
    optiFit: card.scores.optiFit
  }));
  ctx.waitUntil(writeScanAnalytics(env, {
    outcome: "known",
    gtin: body.gtin,
    userId: user.id,
    optiScore: card.scores.optiScore,
    optiFit: card.scores.optiFit
  }));

  return jsonResponse({ ...card, cache: "miss-filled", visibility: visibilityLabel(product) });
}

// Routes a scan to the cosmetics vertical. Returns a Response if the GTIN is a known cosmetic
// (card or pending_verification), or null if it isn't a cosmetic (so the caller treats it as missing).
async function tryCosmeticScan(
  request: Request,
  env: Env,
  ctx: RuntimeContext,
  user: { id: string; isAdmin: boolean },
  body: ScanRequestBody,
  profile: PersonalizationProfile,
  persistedProfileId: string | undefined,
  cacheKey: string
): Promise<Response | null> {
  const cosmetic = await findCosmeticByGtin(env, body.gtin);
  if (!cosmetic) {
    return null;
  }

  const visible = isUserVisible(cosmetic);
  if (!visible && !user.isAdmin) {
    const intent = await createMissingProductIntent(request, env, user.id, body.gtin, profile.id);
    await createContributionShell(env, intent, user.id);
    ctx.waitUntil(recordScan(env, {
      userId: user.id,
      profileId: persistedProfileId,
      productId: cosmetic.id,
      gtin: body.gtin,
      scanSource: body.source ?? "barcode",
      resultStatus: "pending_verification"
    }));
    ctx.waitUntil(writeScanAnalytics(env, { outcome: "estimated", gtin: body.gtin, userId: user.id }));
    return jsonResponse({
      ...intent,
      status: "pending_verification",
      message: "We're still verifying this product. Add a photo of the label to help us confirm it."
    }, { status: 202 });
  }

  const cosmeticProfile: CosmeticProfile = {
    id: profile.id,
    preferences: cosmeticPreferencesFrom(body.skinPreferences),
    avoidedIngredients: profile.avoidedIngredients
  };
  const currentScore = scoreCosmeticProduct(cosmetic, cosmeticProfile);
  const alternatives = await listCosmeticAlternatives(env, cosmetic, currentScore.scoreComponents.optiScore);
  const card = buildCosmeticCard({ product: cosmetic, profile: cosmeticProfile, alternatives });

  if (visible) {
    ctx.waitUntil(env.PRODUCT_CACHE.put(cacheKey, JSON.stringify(card), { expirationTtl: 60 * 60 }));
  }
  ctx.waitUntil(recordScan(env, {
    userId: user.id,
    profileId: persistedProfileId,
    productId: cosmetic.id,
    gtin: body.gtin,
    scanSource: body.source ?? "barcode",
    resultStatus: "known",
    optiScore: card.scores.optiScore,
    optiFit: card.scores.optiFit
  }));
  ctx.waitUntil(writeScanAnalytics(env, {
    outcome: "known",
    gtin: body.gtin,
    userId: user.id,
    optiScore: card.scores.optiScore,
    optiFit: card.scores.optiFit
  }));

  return jsonResponse({ ...card, cache: "miss-filled", visibility: visibilityLabel(cosmetic) });
}

const COSMETIC_PREFERENCES = new Set<CosmeticPreference>([
  "sensitive_skin", "fragrance_free", "pregnancy_safe", "acne_prone", "vegan", "avoid_endocrine_disruptors"
]);

function cosmeticPreferencesFrom(values: string[] | undefined): CosmeticPreference[] {
  return (values ?? []).filter((value): value is CosmeticPreference =>
    COSMETIC_PREFERENCES.has(value as CosmeticPreference));
}

async function recordKnownScan(
  env: Env,
  userId: string,
  profileId: string | undefined,
  gtin: string,
  scanSource: NonNullable<ScanRequestBody["source"]>,
  card: ProductCard
): Promise<void> {
  await recordScan(env, {
    userId,
    profileId,
    productId: card.product.id,
    gtin,
    scanSource,
    resultStatus: "known",
    optiScore: card.scores.optiScore,
    optiFit: card.scores.optiFit
  });
}

async function handleProductSearch(request: Request, env: Env, url: URL): Promise<Response> {
  const user = await requireUser(request, env);
  const query = url.searchParams.get("query") ?? "";
  const limitValue = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
  const products = await searchProducts(env, query, Number.isFinite(limitValue) ? limitValue : 20);
  // Non-admins only see user-visible products; admins see all unless they opt into the user view.
  const results = includeUnverified(user.isAdmin, url) ? products : products.filter(isUserVisible);

  return jsonResponse({ products: results });
}

async function handleProductLookup(request: Request, env: Env, url: URL): Promise<Response> {
  const user = await requireUser(request, env);
  const gtin = url.pathname.split("/").at(-1);
  if (!gtin) {
    throw new HttpError(400, "gtin_required", "Product lookup requires a GTIN.");
  }

  const product = await findProductByGtin(env, gtin);
  if (!product) {
    return errorResponse(404, "product_missing", "No product exists for this GTIN yet.");
  }

  if (!isUserVisible(product) && !user.isAdmin) {
    return jsonResponse({ product: null, status: "pending_verification", gtin }, { status: 200 });
  }

  return jsonResponse({ product, visibility: visibilityLabel(product) });
}

async function handleAppleNonce(env: Env): Promise<Response> {
  return jsonResponse(await createAppleSignInNonce(env));
}

async function handleAppleSignIn(request: Request, env: Env): Promise<Response> {
  const session = await exchangeAppleIdentityToken(parseAppleSignInBody(await readJsonBody(request)), env);
  await ensureUser(env, session.user);

  return jsonResponse({
    accessToken: session.accessToken,
    tokenType: session.tokenType,
    expiresAt: session.expiresAt,
    authentication: "apple",
    user: {
      id: session.user.id,
      email: session.user.email,
      isAdmin: session.user.isAdmin
    }
  });
}

async function handleScore(request: Request, env: Env): Promise<Response> {
  await requireUser(request, env);
  const body = await readJsonBody(request);
  if (!isScoreBody(body)) {
    throw new HttpError(400, "invalid_score_body", "Send a product and profile to score.");
  }

  return jsonResponse({ score: scoreFoodProduct(body.product, body.profile) });
}

async function handleHistory(request: Request, env: Env, url: URL): Promise<Response> {
  const user = await requireUser(request, env);
  const limitValue = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
  const history = await listScanHistory(env, user.id, Number.isFinite(limitValue) ? limitValue : 50);

  return jsonResponse({ history, source: "scan_history" });
}

async function handleContribution(request: Request, env: Env, _ctx: RuntimeContext): Promise<Response> {
  const user = await requireUser(request, env);
  await ensureUser(env, user);
  const body = parseContributionBody(await readJsonBody(request));
  const profile = await loadProfile(env, user.id, body.profileId);
  const intent = await createMissingProductIntent(request, env, user.id, body.gtin, profile.id);

  await createContributionShell(env, intent, user.id);
  return jsonResponse(intent, { status: 202 });
}

async function handleUpload(request: Request, env: Env, url: URL, ctx: RuntimeContext): Promise<Response> {
  const token = url.pathname.slice("/v1/uploads/".length);
  const secret = readSecret(env, "UPLOAD_SIGNING_SECRET");
  if (!secret) {
    throw new HttpError(500, "upload_signing_not_configured", "UPLOAD_SIGNING_SECRET must be configured as a Worker secret.");
  }

  const verified = await verifyUploadToken(token, secret, new Date());
  if (!verified) {
    throw new HttpError(403, "upload_token_invalid", "Upload token is invalid or expired.");
  }

  if (!request.body) {
    throw new HttpError(400, "upload_body_required", "Upload body is required.");
  }

  const artifactBucket = getArtifactBucket(env);
  if (!artifactBucket) {
    throw new HttpError(503, "artifact_storage_not_configured", "Product artifact storage is not enabled yet.");
  }

  await artifactBucket.put(verified.objectKey, request.body, {
    httpMetadata: {
      contentType: request.headers.get("content-type") ?? "application/octet-stream"
    },
    customMetadata: {
      contributionId: verified.contributionId,
      userId: verified.userId,
      kind: verified.kind
    }
  });
  const receipt = await markUploadReceived(env, verified.contributionId, verified.objectKey);
  if (receipt.queueMessage) {
    ctx.waitUntil(env.INGESTION_QUEUE.send(receipt.queueMessage));
  }

  return jsonResponse({
    ok: true,
    objectKey: verified.objectKey,
    contributionId: verified.contributionId,
    status: receipt.status,
    readyForReview: receipt.readyForReview,
    uploadsReceived: receipt.uploads.filter((upload) => upload.status === "uploaded").length,
    totalUploads: receipt.uploads.length
  });
}

function getArtifactBucket(env: Env): R2Bucket | null {
  const maybeEnv = env as unknown as { PRODUCT_ARTIFACTS?: R2Bucket };
  return maybeEnv.PRODUCT_ARTIFACTS ?? null;
}

async function handleAsk(request: Request, env: Env): Promise<Response> {
  await requireUser(request, env);
  const body = await readJsonBody(request);
  const question = body && typeof body === "object" ? Reflect.get(body, "question") : null;
  if (typeof question !== "string" || question.trim().length === 0) {
    throw new HttpError(400, "question_required", "Ask Optiyou requires a question.");
  }

  return jsonResponse({
    answer: "I can explain product fields, score reason codes, and approved evidence. I will not invent product facts or make medical claims.",
    aiFinalJudge: false,
    sourcePolicy: ["product_field", "score_reason", "methodology", "approved_evidence"]
  });
}

function handleMethodology(): Response {
  return jsonResponse({
    version: FOOD_METHODOLOGY_VERSION,
    scope: "U.S./Canada packaged food",
    excludes: ["cosmetics", "supplements", "household_products", "pet_food", "global_coverage"],
    scoring: {
      deterministic: true,
      aiFinalJudge: false,
      outputs: ["OptiScore", "OptiFit", "nutrition score", "ingredient score", "processing score", "confidence score", "reason codes"]
    },
    trustRules: [
      "Low-confidence data is labeled and not presented as fact.",
      "Alternatives are same-category, similar-use, higher-scoring, and never paid placements.",
      "AI explanations must map claims back to product fields, scoring rules, or approved evidence."
    ]
  });
}

async function handleAdmin(request: Request, env: Env, url: URL): Promise<Response> {
  const admin = await requireAdminAccess(request, env);

  if (request.method === "GET" && url.pathname === "/v1/admin/review-queue") {
    return jsonResponse({ queue: await listContributionReviewQueue(env) });
  }

  if (request.method === "GET" && url.pathname === "/v1/admin/metrics") {
    return jsonResponse({ metrics: await getAdminMetrics(env), generatedAt: new Date().toISOString() });
  }

  if (request.method === "GET" && url.pathname === "/v1/admin/evidence") {
    const cards = await listEvidenceCards(env, {
      reviewStatus: url.searchParams.get("status") ?? undefined,
      domain: url.searchParams.get("domain") ?? undefined
    });
    return jsonResponse({ cards });
  }

  const contributionMatch = /^\/v1\/admin\/contributions\/([^/]+)$/.exec(url.pathname);
  if (request.method === "PATCH" && contributionMatch) {
    const body = parseContributionReviewBody(await readJsonBody(request));
    const review = await reviewContribution(env, {
      contributionId: decodeURIComponent(contributionMatch[1]),
      status: body.status,
      notes: body.notes,
      actorId: admin.actorId
    });

    return jsonResponse({ review });
  }

  if (request.method === "GET" && url.pathname === "/v1/admin/products") {
    const query = url.searchParams.get("query") ?? "";
    const rows = await env.DB.prepare(`
      SELECT p.id, p.gtin, p.category, p.verification_status, p.conflict_flags_json, pv.name, pv.brand
      FROM products p
      LEFT JOIN product_versions pv ON pv.id = p.current_version_id
      WHERE p.gtin LIKE ? OR pv.name LIKE ? OR pv.brand LIKE ?
      ORDER BY p.updated_at DESC
      LIMIT 50
    `).bind(`%${query}%`, `%${query}%`, `%${query}%`).all();
    return jsonResponse({ products: rows.results });
  }

  return errorResponse(404, "admin_route_not_found", "Admin route not found.");
}

function parseScanRequest(value: unknown): ScanRequestBody {
  if (!value || typeof value !== "object") {
    throw new HttpError(400, "invalid_scan_body", "Scan request must be a JSON object.");
  }

  const gtin = Reflect.get(value, "gtin");
  const profileId = Reflect.get(value, "profileId");
  const profile = Reflect.get(value, "profile");
  const source = Reflect.get(value, "source");
  const skinPreferences = Reflect.get(value, "skinPreferences");

  if (typeof gtin !== "string" || !/^\d{8,14}$/.test(gtin)) {
    throw new HttpError(400, "invalid_gtin", "GTIN must be 8 to 14 digits.");
  }

  return {
    gtin,
    profileId: typeof profileId === "string" ? profileId : undefined,
    profile: isProfile(profile) ? profile : undefined,
    skinPreferences: Array.isArray(skinPreferences)
      ? skinPreferences.filter((entry): entry is string => typeof entry === "string")
      : undefined,
    source: isScanSource(source) ? source : "barcode"
  };
}

function parseContributionBody(value: unknown): { gtin: string; profileId?: string } {
  if (!value || typeof value !== "object") {
    throw new HttpError(400, "invalid_contribution_body", "Contribution request must be a JSON object.");
  }

  const gtin = Reflect.get(value, "gtin");
  const profileId = Reflect.get(value, "profileId");
  if (typeof gtin !== "string" || !/^\d{8,14}$/.test(gtin)) {
    throw new HttpError(400, "invalid_gtin", "GTIN must be 8 to 14 digits.");
  }

  return {
    gtin,
    profileId: typeof profileId === "string" ? profileId : undefined
  };
}

function parseAppleSignInBody(value: unknown): { identityToken: string; nonce: string } {
  if (!value || typeof value !== "object") {
    throw new HttpError(400, "invalid_auth_body", "Send an Apple identity token and nonce.");
  }

  const identityToken = Reflect.get(value, "identityToken");
  const nonce = Reflect.get(value, "nonce");
  if (typeof identityToken !== "string" || typeof nonce !== "string") {
    throw new HttpError(400, "invalid_auth_body", "Send an Apple identity token and nonce.");
  }

  return {
    identityToken,
    nonce
  };
}

function parseContributionReviewBody(value: unknown): { status: "needs_review" | "approved" | "rejected"; notes?: string } {
  if (!value || typeof value !== "object") {
    throw new HttpError(400, "invalid_review_body", "Contribution review requires a JSON object.");
  }

  const status = Reflect.get(value, "status");
  const notes = Reflect.get(value, "notes");
  if (status !== "needs_review" && status !== "approved" && status !== "rejected") {
    throw new HttpError(400, "invalid_review_status", "Review status must be needs_review, approved, or rejected.");
  }

  return {
    status,
    notes: typeof notes === "string" ? notes : undefined
  };
}

async function createMissingProductIntent(
  request: Request,
  env: Env,
  userId: string,
  gtin: string,
  profileId: string
) {
  const secret = readSecret(env, "UPLOAD_SIGNING_SECRET");
  if (!secret) {
    throw new HttpError(500, "upload_signing_not_configured", "UPLOAD_SIGNING_SECRET must be configured as a Worker secret.");
  }

  return buildContributionIntent({
    gtin,
    userId,
    profileId,
    baseUrl: new URL(request.url).origin,
    now: new Date(),
    signingSecret: secret
  });
}

async function scanCacheKey(
  gtin: string,
  profile: PersonalizationProfile,
  skinPreferences: string[] | undefined
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify({
      preferences: [...profile.preferences].sort(),
      allergens: [...profile.allergens].sort(),
      avoidedIngredients: [...profile.avoidedIngredients].sort(),
      skinPreferences: [...(skinPreferences ?? [])].sort()
    }))
  );
  return `scan:${gtin}:${base64UrlEncode(digest)}`;
}

async function writeScanAnalytics(env: Env, event: ProductAnalytics): Promise<void> {
  const analytics = getScanAnalytics(env);
  if (!analytics) {
    return;
  }

  analytics.writeDataPoint({
    blobs: [event.outcome, event.gtin],
    doubles: [event.optiScore ?? -1, event.optiFit ?? -1],
    indexes: [event.userId]
  });
}

function getScanAnalytics(env: Env): AnalyticsEngineDataset | null {
  const maybeEnv = env as unknown as { SCAN_ANALYTICS?: AnalyticsEngineDataset };
  return maybeEnv.SCAN_ANALYTICS ?? null;
}

function explanationFromReasonCodes(product: FoodProduct) {
  return {
    summary: `${product.name} was scored with deterministic food rules. Review reason codes for the exact drivers.`,
    claimMap: [
      { claim: "Score generated by deterministic methodology", source: "methodology" as const, ref: FOOD_METHODOLOGY_VERSION }
    ]
  };
}

function isScoreBody(value: unknown): value is { product: FoodProduct; profile: PersonalizationProfile } {
  if (!value || typeof value !== "object") {
    return false;
  }
  return isFoodProduct(Reflect.get(value, "product")) && isProfile(Reflect.get(value, "profile"));
}

function isFoodProduct(value: unknown): value is FoodProduct {
  if (!value || typeof value !== "object") {
    return false;
  }
  return typeof Reflect.get(value, "gtin") === "string" &&
    typeof Reflect.get(value, "id") === "string" &&
    typeof Reflect.get(value, "versionId") === "string";
}

function isProfile(value: unknown): value is PersonalizationProfile {
  if (!value || typeof value !== "object") {
    return false;
  }
  return typeof Reflect.get(value, "id") === "string" &&
    Array.isArray(Reflect.get(value, "preferences")) &&
    Array.isArray(Reflect.get(value, "allergens")) &&
    Array.isArray(Reflect.get(value, "avoidedIngredients"));
}

function isScanSource(value: unknown): value is NonNullable<ScanRequestBody["source"]> {
  return value === "barcode" ||
    value === "manual_search" ||
    value === "nutrition_photo" ||
    value === "ingredients_photo";
}

function isIngestionQueueMessage(value: unknown): value is { contributionId: string; productId: string; gtin: string; uploadKeys: Record<string, string> } {
  if (!value || typeof value !== "object") {
    return false;
  }

  return Reflect.get(value, "type") === "ingest_missing_product" &&
    typeof Reflect.get(value, "contributionId") === "string" &&
    typeof Reflect.get(value, "productId") === "string" &&
    typeof Reflect.get(value, "gtin") === "string";
}

function base64UrlEncode(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
