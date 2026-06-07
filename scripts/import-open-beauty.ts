#!/usr/bin/env node
// Optiyou Open Beauty Facts importer (cosmetics vertical).
//
// Open Beauty Facts ships as a single large JSON / JSONL dump. Convert to NDJSON first, e.g.:
//   gunzip -c openbeautyfacts-products.jsonl.gz > beauty.ndjson
// (or `jq -c '.[]' openbeautyfacts.json > beauty.ndjson` if you have the array form)
//
// Usage:
//   node scripts/import-open-beauty.ts beauty.ndjson [--limit N] [--out dir] [--batch N]
//
// NOTE: Open Beauty Facts is ODbL (share-alike). Imported rows are tagged primary_source='off' so
// they stay isolatable from proprietary data and out of any redistributable bundle.

import { createReadStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";

import { scoreCosmeticProduct } from "../src/cosmetics/scoring.ts";
import { buildCosmeticStatements } from "../src/cosmetics/sql.ts";
import { normalizeOpenBeautyProduct, type OpenBeautyFactsProduct } from "../src/cosmetics/open-beauty-facts.ts";
import type { CosmeticProfile } from "../src/cosmetics/types.ts";

interface Args {
  input?: string;
  limit?: number;
  out: string;
  batch: number;
}

const EMPTY_PROFILE: CosmeticProfile = { id: "import", preferences: [], avoidedIngredients: [] };

function parseArgs(argv: string[]): Args {
  const args: Args = { out: ".import-out-cosmetics", batch: 500 };
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
    console.error("Usage: node scripts/import-open-beauty.ts <beauty.ndjson> [--limit N] [--out dir] [--batch N]");
    process.exit(1);
  }

  await rm(args.out, { recursive: true, force: true });
  await mkdir(args.out, { recursive: true });
  const observedAt = new Date().toISOString();

  const reader = createInterface({ input: createReadStream(args.input, "utf8"), crlfDelay: Infinity });
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
    let raw: OpenBeautyFactsProduct;
    try {
      raw = JSON.parse(trimmed) as OpenBeautyFactsProduct;
    } catch {
      continue;
    }
    processed++;

    const normalized = normalizeOpenBeautyProduct(raw, { observedAt });
    if (!normalized) {
      skippedNoGtin++;
      continue;
    }

    const score = scoreCosmeticProduct(normalized.product, EMPTY_PROFILE);
    buffer.push(...buildCosmeticStatements(normalized, score));
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
