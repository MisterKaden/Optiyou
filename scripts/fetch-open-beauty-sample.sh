#!/usr/bin/env bash
# Fetch a small REAL sample of skincare products from Open Beauty Facts (free, no key) and emit NDJSON
# for scripts/import-open-beauty.ts. Open Beauty Facts asks for an identifying User-Agent and limits
# heavy use — this pulls one page, for staging/validation only (not bulk ingestion).
#
# Usage: bash scripts/fetch-open-beauty-sample.sh [category] [page_size] > beauty-sample.ndjson
set -euo pipefail

CATEGORY="${1:-en:moisturizers}"
PAGE_SIZE="${2:-30}"
UA="Optiyou/0.1 (kaden@winten.ai)"
BASE="https://world.openbeautyfacts.org/api/v2/search"
FIELDS="code,product_name,brands,ingredients_text,categories_tags,last_modified_t"

curl -sS --max-time 30 -A "$UA" \
  "$BASE?categories_tags=$CATEGORY&fields=$FIELDS&page_size=$PAGE_SIZE&sort_by=unique_scans_n" \
  | jq -c '.products[] | select(.code != null and .ingredients_text != null and .ingredients_text != "")'
