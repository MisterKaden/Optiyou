-- Optiyou Cloudflare-first product intelligence schema.
-- Scope: U.S./Canada packaged food MVP.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  preferences_json TEXT NOT NULL DEFAULT '[]',
  allergens_json TEXT NOT NULL DEFAULT '[]',
  avoided_ingredients_json TEXT NOT NULL DEFAULT '[]',
  household_mode INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,
  provider_original_transaction_id TEXT,
  tier TEXT NOT NULL,
  status TEXT NOT NULL,
  current_period_end TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  gtin TEXT NOT NULL UNIQUE,
  market TEXT NOT NULL CHECK (market = 'US_CA'),
  category TEXT NOT NULL,
  current_version_id TEXT,
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  brand_confirmation TEXT NOT NULL DEFAULT 'none',
  user_contribution_count INTEGER NOT NULL DEFAULT 0,
  conflict_flags_json TEXT NOT NULL DEFAULT '[]',
  first_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS product_versions (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  version_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  image_r2_key TEXT,
  source_summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'provisional',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(product_id, version_number)
);

CREATE TABLE IF NOT EXISTS product_field_sources (
  id TEXT PRIMARY KEY,
  product_version_id TEXT NOT NULL REFERENCES product_versions(id),
  field_path TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  last_seen_at TEXT NOT NULL,
  user_contribution_count INTEGER NOT NULL DEFAULT 0,
  brand_confirmation TEXT NOT NULL DEFAULT 'none',
  conflict_flags_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS nutrition_facts (
  product_version_id TEXT PRIMARY KEY REFERENCES product_versions(id),
  calories REAL NOT NULL,
  added_sugar_grams REAL NOT NULL,
  protein_grams REAL NOT NULL,
  fiber_grams REAL NOT NULL,
  sodium_milligrams REAL NOT NULL,
  source_id TEXT REFERENCES product_field_sources(id)
);

CREATE TABLE IF NOT EXISTS ingredients (
  id TEXT PRIMARY KEY,
  product_version_id TEXT NOT NULL REFERENCES product_versions(id),
  position INTEGER NOT NULL,
  display_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  function TEXT,
  flags_json TEXT NOT NULL DEFAULT '[]',
  source_id TEXT REFERENCES product_field_sources(id),
  UNIQUE(product_version_id, position)
);

CREATE TABLE IF NOT EXISTS product_allergens (
  product_version_id TEXT NOT NULL REFERENCES product_versions(id),
  allergen TEXT NOT NULL,
  source_id TEXT REFERENCES product_field_sources(id),
  PRIMARY KEY(product_version_id, allergen)
);

CREATE TABLE IF NOT EXISTS scores (
  product_version_id TEXT NOT NULL REFERENCES product_versions(id),
  methodology_version TEXT NOT NULL,
  opti_score INTEGER NOT NULL,
  nutrition_score INTEGER NOT NULL,
  ingredient_score INTEGER NOT NULL,
  processing_score INTEGER NOT NULL,
  confidence_score INTEGER NOT NULL,
  reason_codes_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY(product_version_id, methodology_version)
);

CREATE TABLE IF NOT EXISTS scan_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  profile_id TEXT REFERENCES profiles(id),
  product_id TEXT REFERENCES products(id),
  gtin TEXT NOT NULL,
  scan_source TEXT NOT NULL,
  result_status TEXT NOT NULL,
  opti_score INTEGER,
  opti_fit INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS contributions (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  profile_id TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS contribution_uploads (
  id TEXT PRIMARY KEY,
  contribution_id TEXT NOT NULL REFERENCES contributions(id),
  kind TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_upload',
  uploaded_at TEXT,
  UNIQUE(contribution_id, kind)
);

CREATE TABLE IF NOT EXISTS ai_artifacts (
  id TEXT PRIMARY KEY,
  product_version_id TEXT REFERENCES product_versions(id),
  contribution_id TEXT REFERENCES contributions(id),
  artifact_type TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  model TEXT NOT NULL,
  gateway_request_id TEXT,
  confidence REAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS evidence_documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  scope TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'approved',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS alternatives (
  product_id TEXT NOT NULL REFERENCES products(id),
  alternative_product_id TEXT NOT NULL REFERENCES products(id),
  methodology_version TEXT NOT NULL,
  reason_codes_json TEXT NOT NULL,
  paid_placement INTEGER NOT NULL DEFAULT 0 CHECK (paid_placement = 0),
  refreshed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY(product_id, alternative_product_id, methodology_version)
);

CREATE TABLE IF NOT EXISTS correction_reviews (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  contribution_id TEXT REFERENCES contributions(id),
  status TEXT NOT NULL,
  reviewer_user_id TEXT REFERENCES users(id),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_products_gtin ON products(gtin);
CREATE INDEX IF NOT EXISTS idx_product_versions_product ON product_versions(product_id);
CREATE INDEX IF NOT EXISTS idx_field_sources_version ON product_field_sources(product_version_id);
CREATE INDEX IF NOT EXISTS idx_scan_history_user_created ON scan_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contributions_status ON contributions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id, created_at DESC);
