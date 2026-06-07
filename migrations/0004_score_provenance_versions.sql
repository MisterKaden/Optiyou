-- Provenance + algorithm versioning for scores, and source-published vs observed dates.
-- These let us answer "which normalization/flag/methodology version produced this score?" and
-- distinguish when the SOURCE published a record from when Optiyou observed/ingested it.

ALTER TABLE product_field_sources ADD COLUMN source_published_at TEXT;

ALTER TABLE scores ADD COLUMN grade_band TEXT;
ALTER TABLE scores ADD COLUMN normalization_version TEXT;
ALTER TABLE scores ADD COLUMN ingredient_flag_version TEXT;
