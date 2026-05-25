import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { handleApiRequest } from "../src/http/api.ts";
import { HttpError } from "../src/http/responses.ts";
import { requireUser } from "../src/platform/auth.ts";
import { createContributionShell, loadProfile, markUploadReceived } from "../src/platform/repository.ts";
import { buildProductCard } from "../src/products/product-card.ts";
import { buildContributionIntent } from "../src/contributions/contribution-intent.ts";
import { scoreFoodProduct } from "../src/scoring/food-scoring.ts";
import type { FoodProduct, PersonalizationProfile, ProductCard } from "../src/platform/types.ts";

const lowSugarProfile: PersonalizationProfile = {
  id: "profile-low-sugar",
  preferences: ["low_sugar", "high_protein", "avoid_synthetic_dyes"],
  allergens: [],
  avoidedIngredients: []
};

const cereal: FoodProduct = {
  id: "prod-cocoa-crunch",
  gtin: "006178200002",
  market: "US_CA",
  category: "cereal",
  name: "Cocoa Crunch Cereal",
  brand: "Morning Bolt",
  versionId: "ver-cocoa-crunch-1",
  version: 1,
  dataQuality: {
    source: "open_product_database",
    observedAt: "2026-05-25T00:00:00.000Z",
    confidence: 0.82,
    verificationStatus: "unverified",
    lastSeenAt: "2026-05-25T00:00:00.000Z",
    userContributionCount: 4,
    brandConfirmation: "none",
    conflictFlags: []
  },
  nutrition: {
    calories: 210,
    addedSugarGrams: 15,
    proteinGrams: 3,
    fiberGrams: 2,
    sodiumMilligrams: 180
  },
  ingredients: [
    { position: 1, name: "corn flour", flags: [] },
    { position: 2, name: "cane sugar", flags: ["added_sugar"] },
    { position: 3, name: "red 40", flags: ["synthetic_dye"] },
    { position: 4, name: "natural flavor", flags: ["ultra_processed_marker"] }
  ],
  allergens: [],
  processingLevel: "high",
  imageUrl: "r2://products/prod-cocoa-crunch/front.jpg"
};

const betterCereal: FoodProduct = {
  ...cereal,
  id: "prod-heritage-oats",
  gtin: "006178200001",
  name: "Heritage Oat Squares",
  brand: "Field & Spoon",
  versionId: "ver-heritage-oats-1",
  dataQuality: {
    ...cereal.dataQuality,
    source: "verified_label",
    confidence: 0.94,
    verificationStatus: "verified",
    userContributionCount: 12
  },
  nutrition: {
    calories: 180,
    addedSugarGrams: 4,
    proteinGrams: 6,
    fiberGrams: 7,
    sodiumMilligrams: 115
  },
  ingredients: [
    { position: 1, name: "whole grain oats", flags: [] },
    { position: 2, name: "brown rice", flags: [] },
    { position: 3, name: "date powder", flags: ["added_sugar"] }
  ],
  processingLevel: "moderate"
};

test("food scoring is deterministic and separates OptiScore from profile-specific OptiFit", () => {
  const result = scoreFoodProduct(cereal, lowSugarProfile);

  assert.equal(result.methodologyVersion, "food-us-ca-v1");
  assert.equal(result.aiFinalJudge, false);
  assert.equal(result.scoreComponents.optiScore, 46);
  assert.equal(result.scoreComponents.optiFit, 0);
  assert.equal(result.scoreComponents.nutritionScore, 55);
  assert.equal(result.scoreComponents.ingredientScore, 72);
  assert.equal(result.scoreComponents.processingScore, 45);
  assert.equal(result.scoreComponents.confidenceScore, 82);
  assert.ok(result.reasonCodes.includes("NUTRI_ADDED_SUGAR_HIGH"));
  assert.ok(result.reasonCodes.includes("PREF_LOW_SUGAR_CONFLICT"));
  assert.ok(result.reasonCodes.includes("PREF_SYNTHETIC_DYE_CONFLICT"));
});

test("known product card maps AI copy to deterministic reason codes and alternatives", () => {
  const card = buildProductCard({
    product: cereal,
    profile: lowSugarProfile,
    alternatives: [betterCereal],
    explanation: {
      summary: "Better option available for your low-sugar profile.",
      claimMap: [
        { claim: "High added sugar", source: "score_reason", ref: "NUTRI_ADDED_SUGAR_HIGH" }
      ]
    }
  });

  assert.equal(card.status, "known");
  assert.equal(card.product.gtin, "006178200002");
  assert.equal(card.scores.optiScore, 46);
  assert.equal(card.scores.optiFit, 0);
  assert.equal(card.confidence.label, "Good confidence");
  assert.equal(card.explanation.aiFinalJudge, false);
  assert.equal(card.explanation.claimMap[0].ref, "NUTRI_ADDED_SUGAR_HIGH");
  assert.equal(card.alternatives[0].gtin, "006178200001");
  assert.match(card.alternatives[0].whyBetter[0], /less added sugar/i);
});

test("missing products create contribution records with signed worker upload targets", async () => {
  const intent = await buildContributionIntent({
    gtin: "000000000999",
    userId: "user-123",
    profileId: "profile-low-sugar",
    baseUrl: "https://optiyou.co",
    now: new Date("2026-05-25T00:00:00.000Z"),
    signingSecret: "test-secret"
  });

  assert.equal(intent.status, "missing_product");
  assert.equal(intent.product.market, "US_CA");
  assert.equal(intent.contribution.status, "awaiting_uploads");
  assert.deepEqual(
    intent.uploads.map((upload) => upload.kind),
    ["front_package", "nutrition_label", "ingredients_label"]
  );
  assert.ok(intent.uploads.every((upload) => upload.url.startsWith("https://optiyou.co/v1/uploads/")));
  assert.equal(intent.queueMessage.type, "ingest_missing_product");
});

test("user auth rejects opaque bearer tokens and accepts Optiyou access JWTs", async () => {
  const env = authEnv();
  const opaqueRequest = new Request("https://optiyou.test/v1/scan", {
    headers: { authorization: "Bearer opaque-token-for-user-123" }
  });

  await assert.rejects(
    requireUser(opaqueRequest, env),
    (error) => error instanceof HttpError && error.status === 401 && error.code === "auth_invalid"
  );

  const token = await signJwt({
    sub: "user-123",
    email: "test@example.com",
    iss: "optiyou-test",
    aud: "optiyou-ios",
    exp: Math.floor(Date.now() / 1000) + 600,
    token_use: "optiyou_access"
  }, "test-secret");
  const validRequest = new Request("https://optiyou.test/v1/scan", {
    headers: { authorization: `Bearer ${token}` }
  });

  const user = await requireUser(validRequest, env);

  assert.equal(user.id, "user-123");
  assert.equal(user.email, "test@example.com");
});

test("local development auth token can coexist with the session signing secret", async () => {
  const user = await requireUser(new Request("https://optiyou.test/v1/history", {
    headers: { authorization: "Bearer local-dev-token-123" }
  }), {
    ...authEnv(),
    ENVIRONMENT: "local",
    DEV_AUTH_TOKEN: "local-dev-token-123",
    DEV_AUTH_USER_ID: "seed-user"
  } as unknown as Env);

  assert.equal(user.id, "seed-user");
});

test("Apple sign-in exchange issues an Optiyou bearer session for protected iOS endpoints", async () => {
  const appleKey = await createAppleTestKey("apple-test-key");
  const db = createFakeD1();
  const env = {
    ...authEnv(),
    APPLE_CLIENT_ID: "co.optiyou.app",
    APPLE_JWKS_JSON: JSON.stringify(appleKey.jwks),
    APP_CONFIG: createFakeKV(),
    DB: db.database
  } as unknown as Env;

  const nonceResponse = await handleApiRequest(new Request("https://optiyou.test/v1/auth/apple/nonce"), env, noopCtx());
  assert.equal(nonceResponse.status, 200);
  const nonceBody = await nonceResponse.json() as {
    nonce: string;
    nonceSha256: string;
    expiresAt: string;
  };

  const identityToken = await signAppleIdentityToken({
    iss: "https://appleid.apple.com",
    aud: "co.optiyou.app",
    sub: "001.apple-user",
    email: "test@example.com",
    exp: Math.floor(Date.now() / 1000) + 600,
    iat: Math.floor(Date.now() / 1000),
    nonce: nonceBody.nonceSha256
  }, appleKey.privateKey, "apple-test-key");

  const authResponse = await handleApiRequest(new Request("https://optiyou.test/v1/auth/apple", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      identityToken,
      nonce: nonceBody.nonce
    })
  }), env, noopCtx());
  assert.equal(authResponse.status, 200);
  const authBody = await authResponse.json() as {
    accessToken: string;
    tokenType: string;
    expiresAt: string;
    user: { id: string; email?: string };
  };

  assert.equal(authBody.tokenType, "Bearer");
  assert.equal(authBody.user.id, "apple:001.apple-user");
  assert.equal(authBody.user.email, "test@example.com");
  assert.match(authBody.expiresAt, /^\d{4}-\d{2}-\d{2}T/);

  const user = await requireUser(new Request("https://optiyou.test/v1/history", {
    headers: { authorization: `Bearer ${authBody.accessToken}` }
  }), env);

  assert.equal(user.id, "apple:001.apple-user");
  assert.ok(db.runs.some((run) => run.sql.includes("INSERT INTO users") && run.values[0] === "apple:001.apple-user"));
});

test("protected endpoints reject anonymous install tokens and raw Apple identity tokens", async () => {
  const appleKey = await createAppleTestKey("apple-protected-key");
  const env = {
    ...authEnv(),
    APPLE_CLIENT_ID: "co.optiyou.app",
    APPLE_JWKS_JSON: JSON.stringify(appleKey.jwks)
  } as unknown as Env;

  await assert.rejects(
    requireUser(new Request("https://optiyou.test/v1/history", {
      headers: { authorization: "Bearer anon:123e4567-e89b-42d3-a456-426614174000" }
    }), env),
    (error) => error instanceof HttpError && error.status === 401 && error.code === "auth_invalid"
  );

  const appleIdentityToken = await signAppleIdentityToken({
    iss: "https://appleid.apple.com",
    aud: "co.optiyou.app",
    sub: "001.apple-user",
    exp: Math.floor(Date.now() / 1000) + 600,
    iat: Math.floor(Date.now() / 1000),
    nonce: await sha256Hex("nonce")
  }, appleKey.privateKey, "apple-protected-key");

  await assert.rejects(
    requireUser(new Request("https://optiyou.test/v1/history", {
      headers: { authorization: `Bearer ${appleIdentityToken}` }
    }), env),
    (error) => error instanceof HttpError && error.status === 401 && error.code === "auth_invalid"
  );
});

test("cached scan responses still write scan history", async () => {
  const card = productCard();
  const db = createFakeD1();
  const waitUntilPromises: Promise<unknown>[] = [];
  const token = await signJwt({
    sub: "user-123",
    iss: "optiyou-test",
    aud: "optiyou-ios",
    exp: Math.floor(Date.now() / 1000) + 600,
    token_use: "optiyou_access"
  }, "test-secret");
  const env = {
    ...authEnv(),
    PRODUCT_CACHE: {
      get: async () => JSON.stringify(card),
      put: async () => undefined
    },
    DB: db.database,
    SCAN_ANALYTICS: { writeDataPoint: () => undefined },
    INGESTION_QUEUE: { send: async () => undefined }
  } as unknown as Env;
  const response = await handleApiRequest(new Request("https://optiyou.test/v1/scan", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ gtin: cereal.gtin, profile: lowSugarProfile })
  }), env, {
    waitUntil(promise: Promise<unknown>) {
      waitUntilPromises.push(promise);
    }
  });

  assert.equal(response.status, 200);
  assert.equal(((await response.json()) as { cache: string }).cache, "kv-hit");
  await Promise.all(waitUntilPromises);

  assert.ok(db.runs.some((run) => run.sql.includes("INSERT INTO scan_history")));
  assert.ok(db.runs.some((run) => run.values.includes(card.product.id) && run.values.includes(cereal.gtin)));
});

test("missing profile ids fail instead of silently using an empty profile", async () => {
  const db = createFakeD1();
  const env = { DB: db.database } as unknown as Env;

  await assert.rejects(
    loadProfile(env, "user-123", "profile-missing"),
    (error) => error instanceof HttpError && error.status === 404 && error.code === "profile_not_found"
  );
});

test("missing product shells stay category-neutral and use the stored product id", async () => {
  const db = createFakeD1({ productIdForGtin: "prod-existing-import" });
  const intent = await buildContributionIntent({
    gtin: "000000000999",
    userId: "user-123",
    profileId: "profile-low-sugar",
    baseUrl: "https://optiyou.co",
    now: new Date("2026-05-25T00:00:00.000Z"),
    signingSecret: "test-secret"
  });
  const env = { DB: db.database } as unknown as Env;

  await createContributionShell(env, intent, "user-123");

  assert.ok(db.runs.some((run) => run.sql.includes("VALUES (?, ?, 'US_CA', 'unknown'")));
  assert.ok(db.runs.some((run) => run.sql.includes("INSERT INTO contributions") && run.values[1] === "prod-existing-import"));
});

test("final signed upload marks a contribution ready for review and queues ingestion", async () => {
  const intent = await buildContributionIntent({
    gtin: "000000000999",
    userId: "user-123",
    profileId: "profile-low-sugar",
    baseUrl: "https://optiyou.test",
    now: new Date(),
    signingSecret: "test-secret"
  });
  const db = createFakeD1({
    contributionProduct: {
      contributionId: intent.contribution.id,
      productId: intent.product.id,
      gtin: intent.product.gtin,
      status: "awaiting_uploads"
    },
    contributionUploads: intent.uploads.map((upload) => ({
      kind: upload.kind,
      r2Key: upload.objectKey,
      status: "uploaded"
    }))
  });
  const queuedMessages: unknown[] = [];
  const storedObjects: Array<{ key: string; contentType: string | undefined }> = [];
  const waitUntilPromises: Promise<unknown>[] = [];
  const upload = intent.uploads.find((candidate) => candidate.kind === "ingredients_label") ?? intent.uploads[0];
  const env = {
    ...authEnv(),
    UPLOAD_SIGNING_SECRET: "test-secret",
    DB: db.database,
    PRODUCT_ARTIFACTS: {
      put: async (key: string, _body: ReadableStream, options?: { httpMetadata?: { contentType?: string } }) => {
        storedObjects.push({ key, contentType: options?.httpMetadata?.contentType });
      }
    },
    INGESTION_QUEUE: {
      send: async (message: unknown) => {
        queuedMessages.push(message);
      }
    }
  } as unknown as Env;

  const response = await handleApiRequest(new Request(upload.url, {
    method: "PUT",
    headers: { "content-type": "image/jpeg" },
    body: new Blob(["label-photo"])
  }), env, {
    waitUntil(promise: Promise<unknown>) {
      waitUntilPromises.push(promise);
    }
  });

  assert.equal(response.status, 200);
  const body = await response.json() as { status?: string; readyForReview?: boolean };
  await Promise.all(waitUntilPromises);

  assert.equal(body.status, "needs_review");
  assert.equal(body.readyForReview, true);
  assert.deepEqual(queuedMessages, [intent.queueMessage]);
  assert.deepEqual(storedObjects, [{ key: upload.objectKey, contentType: "image/jpeg" }]);
  assert.ok(db.runs.some((run) => run.sql.includes("UPDATE contributions") && run.values.includes("needs_review")));
});

test("already reviewed contribution uploads do not enqueue duplicate ingestion", async () => {
  const intent = await buildContributionIntent({
    gtin: "000000000999",
    userId: "user-123",
    profileId: "profile-low-sugar",
    baseUrl: "https://optiyou.test",
    now: new Date(),
    signingSecret: "test-secret"
  });
  const db = createFakeD1({
    contributionStatusTransitionChanges: 0,
    contributionProduct: {
      contributionId: intent.contribution.id,
      productId: intent.product.id,
      gtin: intent.product.gtin,
      status: "needs_review"
    },
    contributionUploads: intent.uploads.map((upload) => ({
      kind: upload.kind,
      r2Key: upload.objectKey,
      status: "uploaded"
    }))
  });

  const receipt = await markUploadReceived({ DB: db.database } as unknown as Env, intent.contribution.id, intent.uploads[0].objectKey);

  assert.equal(receipt.status, "needs_review");
  assert.equal(receipt.readyForReview, true);
  assert.equal(receipt.queueMessage, undefined);
});

test("admin review queue shows upload progress and records contribution decisions", async () => {
  const db = createFakeD1({
    reviewQueue: [{
      contributionId: "contrib-review",
      productId: "prod-review",
      gtin: "000000000999",
      status: "needs_review",
      uploadsReceived: 3,
      totalUploads: 3,
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:05:00.000Z"
    }],
    contributionProduct: {
      contributionId: "contrib-review",
      productId: "prod-review",
      gtin: "000000000999"
    },
    contributionUploads: [
      { kind: "front_package", r2Key: "contributions/prod-review/contrib-review/front_package.jpg", status: "uploaded" },
      { kind: "nutrition_label", r2Key: "contributions/prod-review/contrib-review/nutrition_label.jpg", status: "uploaded" },
      { kind: "ingredients_label", r2Key: "contributions/prod-review/contrib-review/ingredients_label.jpg", status: "uploaded" }
    ]
  });
  const env = {
    ...authEnv(),
    ADMIN_API_TOKEN: "admin-secret",
    DB: db.database
  } as unknown as Env;

  const queueResponse = await handleApiRequest(new Request("https://optiyou.test/v1/admin/review-queue", {
    headers: { "x-optiyou-admin-token": "admin-secret" }
  }), env, noopCtx());
  assert.equal(queueResponse.status, 200);
  const queueBody = await queueResponse.json() as {
    queue: Array<{
      id: string;
      gtin: string;
      uploadsReceived: number;
      totalUploads: number;
      uploads: Array<{ kind: string; status: string; r2Key: string }>;
    }>;
  };

  assert.equal(queueBody.queue[0].id, "contrib-review");
  assert.equal(queueBody.queue[0].gtin, "000000000999");
  assert.equal(queueBody.queue[0].uploadsReceived, 3);
  assert.equal(queueBody.queue[0].totalUploads, 3);
  assert.deepEqual(
    queueBody.queue[0].uploads.map((upload) => upload.kind),
    ["front_package", "nutrition_label", "ingredients_label"]
  );

  const decisionResponse = await handleApiRequest(new Request("https://optiyou.test/v1/admin/contributions/contrib-review", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "x-optiyou-admin-token": "admin-secret"
    },
    body: JSON.stringify({ status: "approved", notes: "Readable label photos." })
  }), env, noopCtx());
  assert.equal(decisionResponse.status, 200);
  const decisionBody = await decisionResponse.json() as { review: { id: string; status: string } };

  assert.deepEqual(decisionBody.review, { id: "contrib-review", status: "approved" });
  assert.ok(db.runs.some((run) => run.sql.includes("UPDATE contributions") && run.values[0] === "approved"));
  assert.ok(db.runs.some((run) => run.sql.includes("INSERT INTO correction_reviews") && run.values.includes("Readable label photos.")));
  assert.ok(db.runs.some((run) => run.sql.includes("INSERT INTO audit_log") && run.values.includes("contrib-review")));
});

test("admin page renders API data without innerHTML interpolation", async () => {
  const source = await readFile(new URL("../admin/index.html", import.meta.url), "utf8");

  assert.doesNotMatch(source, /innerHTML\s*=/);
  assert.match(source, /textContent/);
  assert.match(source, /uploadsReceived/);
  assert.match(source, /\/v1\/admin\/contributions\//);
});

function productCard(): ProductCard {
  return buildProductCard({
    product: cereal,
    profile: lowSugarProfile,
    alternatives: [betterCereal],
    explanation: {
      summary: "Better option available for your low-sugar profile.",
      claimMap: [
        { claim: "High added sugar", source: "score_reason", ref: "NUTRI_ADDED_SUGAR_HIGH" }
      ]
    }
  });
}

function authEnv(): Env {
  return {
    AUTH_JWT_SECRET: "test-secret",
    AUTH_JWT_ISSUER: "optiyou-test",
    AUTH_JWT_AUDIENCE: "optiyou-ios",
    AUTH_SESSION_TTL_SECONDS: "3600",
    ENVIRONMENT: "production"
  } as unknown as Env;
}

async function signJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const header = base64UrlEncodeString(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncodeString(JSON.stringify(payload));
  const unsigned = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(unsigned));

  return `${unsigned}.${Buffer.from(signature).toString("base64url")}`;
}

function base64UrlEncodeString(value: string): string {
  return Buffer.from(value).toString("base64url");
}

async function createAppleTestKey(kid: string): Promise<{
  privateKey: CryptoKey;
  jwks: { keys: JsonWebKey[] };
}> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256"
    },
    true,
    ["sign", "verify"]
  );
  const publicKey = await crypto.subtle.exportKey("jwk", keyPair.publicKey);

  return {
    privateKey: keyPair.privateKey,
    jwks: {
      keys: [{
        ...publicKey,
        kid,
        alg: "RS256",
        use: "sig"
      }]
    }
  };
}

async function signAppleIdentityToken(
  payload: Record<string, unknown>,
  privateKey: CryptoKey,
  kid: string
): Promise<string> {
  const encoder = new TextEncoder();
  const header = base64UrlEncodeString(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }));
  const body = base64UrlEncodeString(JSON.stringify(payload));
  const unsigned = `${header}.${body}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    encoder.encode(unsigned)
  );

  return `${unsigned}.${Buffer.from(signature).toString("base64url")}`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createFakeKV(): KVNamespace {
  const entries = new Map<string, string>();

  return {
    async get(key: string) {
      return entries.get(key) ?? null;
    },
    async put(key: string, value: string) {
      entries.set(key, value);
    },
    async delete(key: string) {
      entries.delete(key);
    }
  } as unknown as KVNamespace;
}

function noopCtx() {
  return {
    waitUntil() {
    }
  };
}

interface FakeRun {
  sql: string;
  values: unknown[];
}

function createFakeD1(options: {
  productIdForGtin?: string;
  contributionProduct?: {
    contributionId: string;
    productId: string;
    gtin: string;
    status?: string;
  };
  contributionUploads?: Array<{
    kind: string;
    r2Key: string;
    status: string;
  }>;
  reviewQueue?: Array<{
    contributionId: string;
    productId: string;
    gtin: string;
    status: string;
    uploadsReceived: number;
    totalUploads: number;
    createdAt: string;
    updatedAt: string;
  }>;
  contributionStatusTransitionChanges?: number;
} = {}) {
  const runs: FakeRun[] = [];

  const database = {
    prepare(sql: string) {
      const all = async () => {
        if (sql.includes("FROM contributions c") && sql.includes("uploads_received") && options.reviewQueue) {
          return {
            results: options.reviewQueue.map((item) => ({
              id: item.contributionId,
              product_id: item.productId,
              gtin: item.gtin,
              status: item.status,
              uploads_received: item.uploadsReceived,
              total_uploads: item.totalUploads,
              created_at: item.createdAt,
              updated_at: item.updatedAt
            }))
          };
        }
        return { results: [] };
      };
      return {
        all,
        bind(...values: unknown[]) {
          return {
            sql,
            values,
            async run() {
              runs.push({ sql, values });
              if (sql.includes("UPDATE contributions") && sql.includes("status NOT IN")) {
                return {
                  success: true,
                  meta: {
                    changes: options.contributionStatusTransitionChanges ?? 1
                  }
                };
              }
              return { success: true };
            },
            async first() {
              if (sql.includes("FROM contributions c") && options.contributionProduct) {
                return {
                  contribution_id: options.contributionProduct.contributionId,
                  product_id: options.contributionProduct.productId,
                  gtin: options.contributionProduct.gtin,
                  status: options.contributionProduct.status ?? "needs_review"
                };
              }
              if (sql.includes("FROM products")) {
                return { id: options.productIdForGtin ?? values[0] };
              }
              return null;
            },
            async all() {
              if (sql.includes("FROM contributions c") && sql.includes("uploads_received") && options.reviewQueue) {
                return {
                  results: options.reviewQueue.map((item) => ({
                    id: item.contributionId,
                    product_id: item.productId,
                    gtin: item.gtin,
                    status: item.status,
                    uploads_received: item.uploadsReceived,
                    total_uploads: item.totalUploads,
                    created_at: item.createdAt,
                    updated_at: item.updatedAt
                  }))
                };
              }
              if (sql.includes("FROM contribution_uploads") && options.contributionUploads) {
                return {
                  results: options.contributionUploads.map((upload) => ({
                    kind: upload.kind,
                    r2_key: upload.r2Key,
                    status: upload.status,
                    uploaded_at: upload.status === "uploaded" ? "2026-05-25T00:00:00.000Z" : null
                  }))
                };
              }
              return { results: [] };
            }
          };
        }
      };
    },
    async batch(statements: Array<{ run(): Promise<unknown> }>) {
      for (const statement of statements) {
        await statement.run();
      }
      return [];
    }
  };

  return { database, runs };
}
