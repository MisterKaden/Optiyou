#!/usr/bin/env bash
# Fetch real branded foods from USDA FoodData Central (CC0) as NDJSON for scripts/import-usda.ts.
# Uses the search API (per-100g foodNutrients; the importer scales by serving size). Set FDC_API_KEY
# for higher limits; DEMO_KEY works for small pulls. Only foods with a GTIN + ingredients are emitted.
#
# Usage: bash scripts/fetch-usda-sample.sh "<query>" [page_size] >> foods.ndjson
set -euo pipefail

KEY="${FDC_API_KEY:-DEMO_KEY}"
QUERY="${1:?usage: fetch-usda-sample.sh <query> [page_size]}"
PAGE_SIZE="${2:-50}"
ENC=$(printf '%s' "$QUERY" | jq -sRr @uri)

curl -sS --max-time 60 \
  "https://api.nal.usda.gov/fdc/v1/foods/search?api_key=$KEY&dataType=Branded&pageSize=$PAGE_SIZE&query=$ENC" \
  | jq -c '.foods[] | select(.gtinUpc != null and .gtinUpc != "" and .ingredients != null and .ingredients != "")'
