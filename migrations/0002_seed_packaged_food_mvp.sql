INSERT OR IGNORE INTO users (id, email) VALUES ('seed-user', 'seed@optiyou.co');

INSERT OR IGNORE INTO profiles (
  id, user_id, name, preferences_json, allergens_json, avoided_ingredients_json
) VALUES (
  'seed-low-sugar',
  'seed-user',
  'Low sugar default',
  '["low_sugar","high_protein","avoid_synthetic_dyes"]',
  '[]',
  '[]'
);

INSERT OR IGNORE INTO products (
  id, gtin, market, category, current_version_id, verification_status, brand_confirmation,
  user_contribution_count, conflict_flags_json, last_seen_at
) VALUES
  ('prod-heritage-oats', '006178200001', 'US_CA', 'cereal', 'ver-heritage-oats-1', 'verified', 'none', 12, '[]', '2026-05-25T00:00:00.000Z'),
  ('prod-cocoa-crunch', '006178200002', 'US_CA', 'cereal', 'ver-cocoa-crunch-1', 'unverified', 'none', 4, '[]', '2026-05-25T00:00:00.000Z');

INSERT OR IGNORE INTO product_versions (
  id, product_id, version_number, name, brand, image_r2_key, source_summary, status, last_seen_at
) VALUES
  ('ver-heritage-oats-1', 'prod-heritage-oats', 1, 'Heritage Oat Squares', 'Field & Spoon', 'products/prod-heritage-oats/front.jpg', 'verified_label', 'verified', '2026-05-25T00:00:00.000Z'),
  ('ver-cocoa-crunch-1', 'prod-cocoa-crunch', 1, 'Cocoa Crunch Cereal', 'Morning Bolt', 'products/prod-cocoa-crunch/front.jpg', 'open_product_database', 'provisional', '2026-05-25T00:00:00.000Z');

INSERT OR IGNORE INTO product_field_sources (
  id, product_version_id, field_path, source_type, source_ref, observed_at, confidence,
  verification_status, last_seen_at, user_contribution_count, brand_confirmation, conflict_flags_json
) VALUES
  ('src-heritage-oats-label', 'ver-heritage-oats-1', '$', 'verified_label', 'r2://products/prod-heritage-oats/label.jpg', '2026-05-25T00:00:00.000Z', 0.94, 'verified', '2026-05-25T00:00:00.000Z', 12, 'none', '[]'),
  ('src-cocoa-crunch-open', 'ver-cocoa-crunch-1', '$', 'open_product_database', 'open-food-import:006178200002', '2026-05-25T00:00:00.000Z', 0.82, 'unverified', '2026-05-25T00:00:00.000Z', 4, 'none', '[]');

INSERT OR IGNORE INTO nutrition_facts (
  product_version_id, calories, added_sugar_grams, protein_grams, fiber_grams, sodium_milligrams, source_id
) VALUES
  ('ver-heritage-oats-1', 180, 4, 6, 7, 115, 'src-heritage-oats-label'),
  ('ver-cocoa-crunch-1', 210, 15, 3, 2, 180, 'src-cocoa-crunch-open');

INSERT OR IGNORE INTO ingredients (
  id, product_version_id, position, display_name, normalized_name, function, flags_json, source_id
) VALUES
  ('ing-heritage-1', 'ver-heritage-oats-1', 1, 'whole grain oats', 'whole grain oats', 'base grain', '[]', 'src-heritage-oats-label'),
  ('ing-heritage-2', 'ver-heritage-oats-1', 2, 'brown rice', 'brown rice', 'base grain', '[]', 'src-heritage-oats-label'),
  ('ing-heritage-3', 'ver-heritage-oats-1', 3, 'date powder', 'date powder', 'sweetener', '["added_sugar"]', 'src-heritage-oats-label'),
  ('ing-cocoa-1', 'ver-cocoa-crunch-1', 1, 'corn flour', 'corn flour', 'base grain', '[]', 'src-cocoa-crunch-open'),
  ('ing-cocoa-2', 'ver-cocoa-crunch-1', 2, 'cane sugar', 'cane sugar', 'sweetener', '["added_sugar"]', 'src-cocoa-crunch-open'),
  ('ing-cocoa-3', 'ver-cocoa-crunch-1', 3, 'red 40', 'red 40', 'color', '["synthetic_dye"]', 'src-cocoa-crunch-open'),
  ('ing-cocoa-4', 'ver-cocoa-crunch-1', 4, 'natural flavor', 'natural flavor', 'flavor', '["ultra_processed_marker"]', 'src-cocoa-crunch-open');

INSERT OR IGNORE INTO scores (
  product_version_id, methodology_version, opti_score, nutrition_score, ingredient_score,
  processing_score, confidence_score, reason_codes_json
) VALUES
  ('ver-heritage-oats-1', 'food-us-ca-v1', 93, 96, 90, 72, 94, '["NUTRI_ADDED_SUGAR_LOW","NUTRI_FIBER_GOOD"]'),
  ('ver-cocoa-crunch-1', 'food-us-ca-v1', 46, 55, 72, 45, 82, '["NUTRI_ADDED_SUGAR_HIGH","ING_SYNTHETIC_DYE","ING_ULTRA_PROCESSED_MARKER","PROCESSING_HIGH"]');

INSERT OR IGNORE INTO alternatives (
  product_id, alternative_product_id, methodology_version, reason_codes_json, paid_placement
) VALUES (
  'prod-cocoa-crunch',
  'prod-heritage-oats',
  'food-us-ca-v1',
  '["ALT_LESS_ADDED_SUGAR","ALT_HIGHER_FIBER","ALT_NO_SYNTHETIC_DYE"]',
  0
);
