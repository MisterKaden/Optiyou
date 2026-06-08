#!/usr/bin/env bash
# Build the premium "offline mode" catalog bundle: a compact, read-only SQLite a phone can carry so
# scans work with no network. CRITICAL (ODbL): it includes ONLY primary_source != 'off' rows — i.e.
# USDA (CC0) + brand + user data — so the redistributable bundle never contains Open Food Facts /
# Open Beauty Facts data (which is share-alike). This is why we tag primary_source on every version.
#
# Production use: export prod D1 first, then run this against the export:
#   npx wrangler d1 export optiyou-core --remote --output optiyou-core.sql
#   sqlite3 catalog.db < optiyou-core.sql
#   bash scripts/build-offline-bundle.sh catalog.db optiyou-offline.sqlite
set -euo pipefail

SRC="${1:?usage: build-offline-bundle.sh <source.sqlite> [out.sqlite]}"
OUT="${2:-optiyou-offline.sqlite}"
rm -f "$OUT"

sqlite3 "$OUT" <<SQL
ATTACH DATABASE '$SRC' AS src;

-- Only ODbL-clean food versions (exclude 'off' = Open Food/Beauty Facts, and 'unknown').
CREATE TABLE product_versions AS
  SELECT * FROM src.product_versions
  WHERE primary_source IN ('usda', 'brand', 'user');

CREATE TABLE products AS
  SELECT * FROM src.products
  WHERE current_version_id IN (SELECT id FROM product_versions);

CREATE TABLE nutrition_facts AS
  SELECT * FROM src.nutrition_facts
  WHERE product_version_id IN (SELECT id FROM product_versions);

CREATE TABLE ingredients AS
  SELECT * FROM src.ingredients
  WHERE product_version_id IN (SELECT id FROM product_versions);

CREATE TABLE product_allergens AS
  SELECT * FROM src.product_allergens
  WHERE product_version_id IN (SELECT id FROM product_versions);

CREATE TABLE scores AS
  SELECT * FROM src.scores
  WHERE product_version_id IN (SELECT id FROM product_versions);

CREATE INDEX idx_offline_products_gtin ON products(gtin);
CREATE INDEX idx_offline_versions_product ON product_versions(product_id);

-- Provenance stamp so the app can show "offline catalog, generated <date>" and verify licensing.
CREATE TABLE offline_meta (key TEXT PRIMARY KEY, value TEXT);
INSERT INTO offline_meta (key, value) VALUES
  ('bundle_version', 'offline-v1'),
  ('license', 'USDA CC0 + Optiyou-owned data only (no ODbL/off sources)'),
  ('product_count', (SELECT COUNT(*) FROM products));

DETACH DATABASE src;
SQL

COUNT=$(sqlite3 "$OUT" "SELECT COUNT(*) FROM products;")
OFF_LEAK=$(sqlite3 "$OUT" "SELECT COUNT(*) FROM product_versions WHERE primary_source = 'off';")
echo "Offline bundle: $OUT ($(du -h "$OUT" | cut -f1))"
echo "  products: $COUNT"
echo "  ODbL leak check (off rows, must be 0): $OFF_LEAK"
[ "$OFF_LEAK" = "0" ] || { echo "ERROR: ODbL 'off' data leaked into the offline bundle"; exit 1; }
