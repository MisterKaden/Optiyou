-- Ingredient Intelligence graph (the 4th database / the moat). Populated by ATLAS (AI drafts,
-- autonomous publish with guardrails + audit); read by the scoring engines to replace the v0 keyword
-- seeds with evidence-tiered, dose-aware concern classifications. Spans both verticals.

CREATE TABLE IF NOT EXISTS evidence_sources (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,        -- meta_analysis | rct | cohort | mechanistic | animal | invitro | regulatory | review
  publisher TEXT,
  title TEXT NOT NULL,
  identifier TEXT,                  -- DOI | PMID | URL
  publication_year INTEGER,
  evidence_level TEXT,              -- A | B | C | D
  verified INTEGER NOT NULL DEFAULT 0,
  retrieved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS ingredient_knowledge (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL CHECK (domain IN ('food', 'cosmetic', 'both')),
  aliases_json TEXT NOT NULL DEFAULT '[]',
  e_number TEXT,
  cas_number TEXT,
  functional_class TEXT,
  nova_signal INTEGER,              -- 1..4 ultra-processing signal (food) | NULL
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- One row per ATLAS Evidence Card.
CREATE TABLE IF NOT EXISTS ingredient_evidence (
  id TEXT PRIMARY KEY,
  ingredient_id TEXT NOT NULL REFERENCES ingredient_knowledge(id),
  domain TEXT NOT NULL CHECK (domain IN ('food', 'cosmetic')),
  concern_level TEXT NOT NULL CHECK (concern_level IN ('beneficial', 'neutral', 'caution', 'avoid')),
  evidence_tier TEXT NOT NULL CHECK (evidence_tier IN ('A', 'B', 'C', 'D')),
  evidence_status TEXT NOT NULL,    -- consensus | strong_contextual | emerging | contested | weak_mechanistic | regulatory_action
  effect_direction TEXT NOT NULL CHECK (effect_direction IN ('positive', 'negative', 'neutral')),
  reason_code TEXT,
  magnitude_band TEXT NOT NULL CHECK (magnitude_band IN ('none', 'small', 'moderate', 'large')),
  dose_context TEXT,
  contested INTEGER NOT NULL DEFAULT 0,
  advisory TEXT,                    -- inform-don't-punish note (does NOT move the score)
  source_ids_json TEXT NOT NULL DEFAULT '[]',
  needs_human_verification INTEGER NOT NULL DEFAULT 1,
  review_status TEXT NOT NULL DEFAULT 'draft' CHECK (review_status IN ('draft', 'approved', 'rejected')),
  confidence REAL,
  reviewer_id TEXT,
  approved_at TEXT,
  methodology_version TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_ingredient_knowledge_name ON ingredient_knowledge(canonical_name);
CREATE INDEX IF NOT EXISTS idx_ingredient_evidence_ingredient ON ingredient_evidence(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_ingredient_evidence_review ON ingredient_evidence(review_status, domain);
