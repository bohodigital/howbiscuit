PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tax_sources (
  source_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  authority TEXT NOT NULL,
  cadence TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  last_checked_at TEXT,
  last_success_at TEXT,
  published_at TEXT,
  record_count INTEGER NOT NULL DEFAULT 0,
  checksum TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS tax_source_revisions (
  revision_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  published_at TEXT,
  effective_from TEXT,
  effective_to TEXT,
  checksum TEXT NOT NULL,
  archive_key TEXT,
  imported_at TEXT NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (source_id) REFERENCES tax_sources(source_id)
);

CREATE TABLE IF NOT EXISTS tax_locations (
  location_id TEXT PRIMARY KEY,
  state_code TEXT NOT NULL,
  postal_low TEXT NOT NULL,
  postal_high TEXT NOT NULL,
  plus4_low TEXT,
  plus4_high TEXT,
  record_type TEXT NOT NULL,
  city_name TEXT,
  county_name TEXT,
  state_fips TEXT,
  county_fips TEXT,
  place_fips TEXT,
  confidence TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_revision TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES tax_sources(source_id)
);

CREATE INDEX IF NOT EXISTS tax_locations_postal_idx
  ON tax_locations(postal_low, postal_high, effective_from, effective_to);
CREATE INDEX IF NOT EXISTS tax_locations_state_idx
  ON tax_locations(state_code, effective_from, effective_to);

CREATE TABLE IF NOT EXISTS tax_components (
  component_id TEXT PRIMARY KEY,
  location_id TEXT,
  state_code TEXT NOT NULL,
  product_code TEXT NOT NULL,
  jurisdiction_type TEXT NOT NULL,
  jurisdiction_code TEXT,
  jurisdiction_name TEXT NOT NULL,
  rate_percent REAL,
  unit_amount REAL,
  unit_basis TEXT,
  included_in_price INTEGER NOT NULL DEFAULT 0,
  effective_from TEXT NOT NULL,
  effective_to TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_revision TEXT NOT NULL,
  citation TEXT,
  FOREIGN KEY (location_id) REFERENCES tax_locations(location_id),
  FOREIGN KEY (source_id) REFERENCES tax_sources(source_id),
  CHECK (rate_percent IS NOT NULL OR unit_amount IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS tax_components_location_product_idx
  ON tax_components(location_id, state_code, product_code, effective_from, effective_to);

CREATE TABLE IF NOT EXISTS tax_product_rules (
  rule_id TEXT PRIMARY KEY,
  state_code TEXT NOT NULL,
  product_code TEXT NOT NULL,
  rule_label TEXT NOT NULL,
  rule_value TEXT NOT NULL,
  rule_basis TEXT,
  effective_from TEXT NOT NULL,
  effective_to TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_revision TEXT NOT NULL,
  citation TEXT,
  FOREIGN KEY (source_id) REFERENCES tax_sources(source_id)
);

CREATE INDEX IF NOT EXISTS tax_product_rules_lookup_idx
  ON tax_product_rules(state_code, product_code, effective_from, effective_to);

CREATE TABLE IF NOT EXISTS tax_ingestion_runs (
  run_id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  source_count INTEGER NOT NULL DEFAULT 0,
  record_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS tax_review_queue (
  review_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  state_code TEXT,
  product_code TEXT,
  reason TEXT NOT NULL,
  source_url TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  resolved_at TEXT,
  FOREIGN KEY (source_id) REFERENCES tax_sources(source_id)
);

CREATE INDEX IF NOT EXISTS tax_review_queue_status_idx
  ON tax_review_queue(status, source_id, state_code, product_code);
