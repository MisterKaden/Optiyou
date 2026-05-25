import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { handleApiRequest } from "../src/http/api.ts";
import { HttpError } from "../src/http/responses.ts";
import { requireUser } from "../src/platform/auth.ts";
import { createContributionShell, loadProfile } from "../src/platform/repository.ts";
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

test("user auth rejects opaque bearer tokens and accepts signed JWTs", async () => {
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
    exp: Math.floor(Date.now() / 1000) + 600
  }, "test-secret");
  const validRequest = new Request("https://optiyou.test/v1/scan", {
    headers: { authorization: `Bearer ${token}` }
  });

  const user = await requireUser(validRequest, env);

  assert.equal(user.id, "user-123");
  assert.equal(user.email, "test@example.com");
});

test("cached scan responses still write scan history", async () => {
  const card = productCard();
  const db = createFakeD1();
  const waitUntilPromises: Promise<unknown>[] = [];
  const token = await signJwt({
    sub: "user-123",
    iss: "optiyou-test",
    aud: "optiyou-ios",
    exp: Math.floor(Date.now() / 1000) + 600
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

test("admin page renders API data without innerHTML interpolation", async () => {
  const source = await readFile(new URL("../admin/index.html", import.meta.url), "utf8");

  assert.doesNotMatch(source, /innerHTML\s*=/);
  assert.match(source, /textContent/);
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

interface FakeRun {
  sql: string;
  values: unknown[];
}

function createFakeD1(options: { productIdForGtin?: string } = {}) {
  const runs: FakeRun[] = [];

  const database = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            sql,
            values,
            async run() {
              runs.push({ sql, values });
              return { success: true };
            },
            async first() {
              if (sql.includes("FROM products")) {
                return { id: options.productIdForGtin ?? values[0] };
              }
              return null;
            },
            async all() {
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
