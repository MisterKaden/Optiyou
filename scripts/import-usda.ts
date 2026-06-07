#!/usr/bin/env node
// Optiyou USDA Branded Foods importer.
//
// Reads the USDA FoodData Central "Branded Foods" dataset as NDJSON (one JSON record per
// line), normalizes each record into the Optiyou schema, precomputes its deterministic
// score, and emits batched .sql files of INSERT OR IGNORE statements for `wrangler d1 execute`.
//
// The full USDA dump ships as a single large JSON object; convert it to NDJSON first so we
// can stream it without loading gigabytes into memory:
//
//   jq -c '.BrandedFoods[]' FoodData_Central_branded_food_json_*.json > branded.ndjson
//
// Usage:
//   node scripts/import-usda.ts branded.ndjson [--limit N] [--out dir] [--batch N]
//
// Then apply (local D1 first to verify, then remote):
//   for f in .import-out/*.sql; do npx wrangler d1 execute optiyou-core --local  --file="$f"; done
//   for f in .import-out/*.sql; do npx wrangler d1 execute optiyou-core --remote --file="$f"; done

import { createReadStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";

import { scoreFoodProduct } from "../src/scoring/food-scoring.ts";
import { buildProductStatements } from "../src/ingestion/sql.ts";
import { normalizeUsdaFood, type UsdaBrandedFood } from "../src/ingestion/usda.ts";
import type { PersonalizationProfile } from "../src/platform/types.ts";

interface Args {
  input?: string;
  limit?: number;
  out: string;
  batch: number;
}

const EMPTY_PROFILE: PersonalizationProfile = {
  id: "import",
  preferences: [],
  allergens: [],
  avoidedIngredients: []
};

function parseArgs(argv: string[]): Args {
  const args: Args = { out: ".import-out", batch: 500 };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--limit") {
      args.limit = Number(argv[++i]);
    } else if (token === "--out") {
      args.out = argv[++i];
    } else if (token === "--batch") {
      args.batch = Number(argv[++i]);
    } else if (!token.startsWith("--")) {
      args.input = token;
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error("Usage: node scripts/import-usda.ts <branded.ndjson> [--limit N] [--out dir] [--batch N]");
    console.error("Convert the USDA dump first:  jq -c '.BrandedFoods[]' FoodData_Central_branded_food_json_*.json > branded.ndjson");
    process.exit(1);
  }

  await rm(args.out, { recursive: true, force: true });
  await mkdir(args.out, { recursive: true });

  // Stamp every record in this run with a single ingestion timestamp (distinct from USDA's
  // publicationDate, which becomes sourcePublishedAt).
  const observedAt = new Date().toISOString();

  const reader = createInterface({
    input: createReadStream(args.input, "utf8"),
    crlfDelay: Infinity
  });

  let processed = 0;
  let written = 0;
  let skippedNoGtin = 0;
  let fileIndex = 0;
  let inBatch = 0;
  let buffer: string[] = [];

  const flush = async (): Promise<void> => {
    if (buffer.length === 0) {
      return;
    }
    fileIndex++;
    const file = path.join(args.out, `batch-${String(fileIndex).padStart(4, "0")}.sql`);
    await writeFile(file, `PRAGMA foreign_keys = ON;\n${buffer.join("\n")}\n`, "utf8");
    buffer = [];
    inBatch = 0;
  };

  for await (const line of reader) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    let raw: UsdaBrandedFood;
    try {
      raw = JSON.parse(trimmed) as UsdaBrandedFood;
    } catch {
      continue;
    }
    processed++;

    const normalized = normalizeUsdaFood(raw, { observedAt });
    if (!normalized) {
      skippedNoGtin++;
      continue;
    }

    const score = scoreFoodProduct(normalized.product, EMPTY_PROFILE);
    buffer.push(...buildProductStatements(normalized, score));
    written++;
    inBatch++;

    if (inBatch >= args.batch) {
      await flush();
    }
    if (args.limit && written >= args.limit) {
      break;
    }
  }

  await flush();

  console.log(`Processed:          ${processed}`);
  console.log(`Written:            ${written}`);
  console.log(`Skipped (no GTIN):  ${skippedNoGtin}`);
  console.log(`SQL batches:        ${fileIndex} in ${args.out}/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
