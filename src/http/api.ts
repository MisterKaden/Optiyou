import { buildContributionIntent, verifyUploadToken } from "../contributions/contribution-intent.ts";
import { buildProductCard } from "../products/product-card.ts";
import { scoreFoodProduct, FOOD_METHODOLOGY_VERSION } from "../scoring/food-scoring.ts";
import { requireAdmin, requireUser, readSecret } from "../platform/auth.ts";
import {
  createContributionShell,
  ensureUser,
  findProductByGtin,
  listAlternatives,
  loadProfile,
  markUploadReceived,
  recordScan
} from "../platform/repository.ts";
import { errorResponse, HttpError, jsonResponse, readJsonBody } from "./responses.ts";
import type { FoodProduct, PersonalizationProfile, ProductCard, ScanRequestBody } from "../platform/types.ts";

interface RuntimeContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface ProductAnalytics {
  outcome: "known" | "missing" | "estimated";
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

    if (request.method === "GET" && url.pathname.startsWith("/v1/products/")) {
      return await handleProductLookup(request, env, url);
    }

    if (request.method === "POST" && url.pathname === "/v1/score") {
      return await handleScore(request, env);
    }

    if (request.method === "POST" && url.pathname === "/v1/contributions") {
      return await handleContribution(request, env, ctx);
    }

    if (request.method === "PUT" && url.pathname.startsWith("/v1/uploads/")) {
      return await handleUpload(request, env, url);
    }

    if (request.method === "POST" && url.pathname === "/v1/ai/ask") {
      return await handleAsk(request, env);
    }

    if (request.method === "GET" && url.pathname === "/v1/methodology") {
      return handleMethodology();
    }

    if (request.method === "GET" && url.pathname === "/v1/history") {
      await requireUser(request, env);
      return jsonResponse({ history: [], source: "scan_history", note: "History persistence is active; list pagination is the next API slice." });
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

async function handleScan(request: Request, env: Env, ctx: RuntimeContext): Promise<Response> {
  const user = await requireUser(request, env);
  await ensureUser(env, user);
  const body = parseScanRequest(await readJsonBody(request));
  const profile = body.profile ?? await loadProfile(env, user.id, body.profileId);
  const persistedProfileId = body.profile ? undefined : body.profileId;
  const cacheKey = await scanCacheKey(body.gtin, profile);
  const cached = await env.PRODUCT_CACHE.get(cacheKey);

  if (cached) {
    const card = JSON.parse(cached) as ProductCard;
    ctx.waitUntil(recordKnownScan(env, user.id, persistedProfileId, body.gtin, card));
    ctx.waitUntil(writeScanAnalytics(env, {
      outcome: "known",
      gtin: body.gtin,
      userId: user.id,
      optiScore: card.scores.optiScore,
      optiFit: card.scores.optiFit
    }));
    return jsonResponse({ ...card, cache: "kv-hit" });
  }

  const product = await findProductByGtin(env, body.gtin);
  if (!product) {
    const intent = await createMissingProductIntent(request, env, user.id, body.gtin, profile.id);
    await createContributionShell(env, intent, user.id);
    ctx.waitUntil(env.INGESTION_QUEUE.send(intent.queueMessage));
    ctx.waitUntil(recordScan(env, {
      userId: user.id,
      profileId: persistedProfileId,
      gtin: body.gtin,
      scanSource: "barcode",
      resultStatus: "missing_product"
    }));
    ctx.waitUntil(writeScanAnalytics(env, { outcome: "missing", gtin: body.gtin, userId: user.id }));
    return jsonResponse(intent, { status: 202 });
  }

  const alternatives = await listAlternatives(env, product);
  const card = buildProductCard({
    product,
    profile,
    alternatives,
    explanation: explanationFromReasonCodes(product)
  });

  ctx.waitUntil(env.PRODUCT_CACHE.put(cacheKey, JSON.stringify(card), { expirationTtl: 60 * 60 }));
  ctx.waitUntil(recordScan(env, {
    userId: user.id,
    profileId: persistedProfileId,
    productId: product.id,
    gtin: body.gtin,
    scanSource: "barcode",
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

  return jsonResponse({ ...card, cache: "miss-filled" });
}

async function recordKnownScan(
  env: Env,
  userId: string,
  profileId: string | undefined,
  gtin: string,
  card: ProductCard
): Promise<void> {
  await recordScan(env, {
    userId,
    profileId,
    productId: card.product.id,
    gtin,
    scanSource: "barcode",
    resultStatus: "known",
    optiScore: card.scores.optiScore,
    optiFit: card.scores.optiFit
  });
}

async function handleProductLookup(request: Request, env: Env, url: URL): Promise<Response> {
  await requireUser(request, env);
  const gtin = url.pathname.split("/").at(-1);
  if (!gtin) {
    throw new HttpError(400, "gtin_required", "Product lookup requires a GTIN.");
  }

  const product = await findProductByGtin(env, gtin);
  if (!product) {
    return errorResponse(404, "product_missing", "No product exists for this GTIN yet.");
  }

  return jsonResponse({ product });
}

async function handleScore(request: Request, env: Env): Promise<Response> {
  await requireUser(request, env);
  const body = await readJsonBody(request);
  if (!isScoreBody(body)) {
    throw new HttpError(400, "invalid_score_body", "Send a product and profile to score.");
  }

  return jsonResponse({ score: scoreFoodProduct(body.product, body.profile) });
}

async function handleContribution(request: Request, env: Env, ctx: RuntimeContext): Promise<Response> {
  const user = await requireUser(request, env);
  await ensureUser(env, user);
  const body = parseContributionBody(await readJsonBody(request));
  const profile = await loadProfile(env, user.id, body.profileId);
  const intent = await createMissingProductIntent(request, env, user.id, body.gtin, profile.id);

  await createContributionShell(env, intent, user.id);
  ctx.waitUntil(env.INGESTION_QUEUE.send(intent.queueMessage));
  return jsonResponse(intent, { status: 202 });
}

async function handleUpload(request: Request, env: Env, url: URL): Promise<Response> {
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

  await env.PRODUCT_ARTIFACTS.put(verified.objectKey, request.body, {
    httpMetadata: {
      contentType: request.headers.get("content-type") ?? "application/octet-stream"
    },
    customMetadata: {
      contributionId: verified.contributionId,
      userId: verified.userId,
      kind: verified.kind
    }
  });
  await markUploadReceived(env, verified.contributionId, verified.objectKey);

  return jsonResponse({
    ok: true,
    objectKey: verified.objectKey,
    contributionId: verified.contributionId
  });
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
  await requireAdmin(request, env);

  if (request.method === "GET" && url.pathname === "/v1/admin/review-queue") {
    const rows = await env.DB.prepare(`
      SELECT id, product_id, status, created_at
      FROM contributions
      WHERE status IN ('awaiting_uploads', 'uploaded', 'needs_review')
      ORDER BY created_at DESC
      LIMIT 50
    `).all();
    return jsonResponse({ queue: rows.results });
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

  if (typeof gtin !== "string" || !/^\d{8,14}$/.test(gtin)) {
    throw new HttpError(400, "invalid_gtin", "GTIN must be 8 to 14 digits.");
  }

  return {
    gtin,
    profileId: typeof profileId === "string" ? profileId : undefined,
    profile: isProfile(profile) ? profile : undefined
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

async function scanCacheKey(gtin: string, profile: PersonalizationProfile): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify({
      preferences: [...profile.preferences].sort(),
      allergens: [...profile.allergens].sort(),
      avoidedIngredients: [...profile.avoidedIngredients].sort()
    }))
  );
  return `scan:${gtin}:${base64UrlEncode(digest)}`;
}

async function writeScanAnalytics(env: Env, event: ProductAnalytics): Promise<void> {
  env.SCAN_ANALYTICS.writeDataPoint({
    blobs: [event.outcome, event.gtin],
    doubles: [event.optiScore ?? -1, event.optiFit ?? -1],
    indexes: [event.userId]
  });
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
