-- Cosmetics vertical. Products gain a `vertical` discriminator (food | cosmetic); cosmetic
-- score components live in their own table (cosmetics have hazard/sensitization/transparency axes,
-- not the food nutrition/ingredient/processing axes). Open Beauty Facts is ODbL → primary_source='off'.

ALTER TABLE products
  ADD COLUMN vertical TEXT NOT NULL DEFAULT 'food'
  CHECK (vertical IN ('food', 'cosmetic'));

ALTER TABLE product_versions ADD COLUMN cosmetic_use TEXT;          -- leave_on | rinse_off | unknown
ALTER TABLE product_versions ADD COLUMN has_undisclosed_fragrance INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS cosmetic_scores (
  product_version_id TEXT NOT NULL REFERENCES product_versions(id),
  methodology_version TEXT NOT NULL,
  opti_score INTEGER NOT NULL,
  hazard_score INTEGER NOT NULL,
  sensitization_score INTEGER NOT NULL,
  transparency_score INTEGER NOT NULL,
  environmental_score INTEGER NOT NULL,
  confidence_score INTEGER NOT NULL,
  safety_level TEXT NOT NULL,
  grade_band TEXT NOT NULL,
  reason_codes_json TEXT NOT NULL,
  advisories_json TEXT NOT NULL DEFAULT '[]',
  normalization_version TEXT,
  concern_version TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (product_version_id, methodology_version)
);

CREATE INDEX IF NOT EXISTS idx_products_vertical ON products(vertical);
