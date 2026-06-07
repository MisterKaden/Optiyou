-- Source provenance for product versions.
-- Tags every version with the data source that produced it so that Open Food Facts
-- data (ODbL, share-alike) stays isolatable from USDA (public domain), brand, and user
-- data, and so merge precedence (brand > usda > off > user) is visible at the row level.

ALTER TABLE product_versions
  ADD COLUMN primary_source TEXT NOT NULL DEFAULT 'unknown'
  CHECK (primary_source IN ('brand', 'usda', 'off', 'user', 'ai', 'unknown'));

CREATE INDEX IF NOT EXISTS idx_product_versions_primary_source
  ON product_versions(primary_source);
