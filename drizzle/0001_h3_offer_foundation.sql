PRAGMA foreign_keys = ON;

CREATE TABLE catalog_product_projection (
  product_id TEXT PRIMARY KEY,
  catalog_schema_version TEXT NOT NULL,
  identity_digest TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  exact_variant TEXT NOT NULL,
  product_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'retired')),
  release_member INTEGER NOT NULL CHECK (release_member IN (0, 1)),
  source_commit TEXT NOT NULL,
  synced_at TEXT NOT NULL
) STRICT;

CREATE TABLE merchants (
  merchant_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('disabled', 'active', 'retired'))
) STRICT;

CREATE TABLE merchant_products (
  id TEXT PRIMARY KEY,
  canonical_product_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  merchant_product_id TEXT NOT NULL,
  merchant_variant_id TEXT,
  match_confidence TEXT NOT NULL,
  match_evidence_json TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('candidate', 'active', 'rejected', 'retired')),
  created_at TEXT NOT NULL,
  UNIQUE (merchant_id, merchant_product_id),
  FOREIGN KEY (canonical_product_id) REFERENCES catalog_product_projection(product_id),
  FOREIGN KEY (merchant_id) REFERENCES merchants(merchant_id)
) STRICT;

CREATE TABLE merchant_stores (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  merchant_store_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  location_profile_id TEXT,
  status TEXT NOT NULL,
  UNIQUE (merchant_id, merchant_store_id),
  FOREIGN KEY (merchant_id) REFERENCES merchants(merchant_id)
) STRICT;

CREATE TABLE source_policies_runtime (
  source_id TEXT PRIMARY KEY,
  adapter_id TEXT NOT NULL,
  policy_digest TEXT NOT NULL,
  review_due_at TEXT NOT NULL,
  terms_expires_at TEXT,
  comparison_status TEXT NOT NULL CHECK (comparison_status IN ('approved', 'requires-review', 'prohibited')),
  public_activation_approved INTEGER NOT NULL CHECK (public_activation_approved IN (0, 1)),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  state TEXT NOT NULL,
  synced_at TEXT NOT NULL
) STRICT;

CREATE TABLE source_policy_reviews (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  reviewed_by TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  decision TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES source_policies_runtime(source_id)
) STRICT;

CREATE TABLE offer_snapshots (
  offer_id TEXT PRIMARY KEY,
  canonical_product_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  normalized_offer_json TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  FOREIGN KEY (canonical_product_id) REFERENCES catalog_product_projection(product_id),
  FOREIGN KEY (merchant_id) REFERENCES merchants(merchant_id),
  FOREIGN KEY (source_id) REFERENCES source_policies_runtime(source_id)
) STRICT;

CREATE INDEX offer_snapshots_product_expiry_idx ON offer_snapshots(canonical_product_id, expires_at);

CREATE TABLE offer_refresh_jobs (
  id TEXT PRIMARY KEY,
  canonical_product_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  last_error_code TEXT,
  FOREIGN KEY (canonical_product_id) REFERENCES catalog_product_projection(product_id),
  FOREIGN KEY (source_id) REFERENCES source_policies_runtime(source_id)
) STRICT;

CREATE TABLE affiliate_relationships (
  id TEXT PRIMARY KEY,
  canonical_product_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  destination_id TEXT NOT NULL,
  relationship TEXT NOT NULL,
  program_id TEXT,
  disclosure_policy_id TEXT NOT NULL,
  public_activation_approved INTEGER NOT NULL CHECK (public_activation_approved IN (0, 1)),
  enabled_at TEXT,
  FOREIGN KEY (canonical_product_id) REFERENCES catalog_product_projection(product_id),
  FOREIGN KEY (merchant_id) REFERENCES merchants(merchant_id)
) STRICT;

CREATE TABLE metro_profiles (
  metro_slug TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  cbsa_code TEXT,
  dataset_vintage TEXT NOT NULL,
  status TEXT NOT NULL
) STRICT;

CREATE TABLE location_profiles (
  zcta TEXT PRIMARY KEY,
  centroid_latitude REAL NOT NULL,
  centroid_longitude REAL NOT NULL,
  primary_county_fips TEXT,
  county_weights_json TEXT NOT NULL,
  cbsa_weights_json TEXT NOT NULL,
  metro_slug TEXT,
  source_vintage TEXT NOT NULL,
  FOREIGN KEY (metro_slug) REFERENCES metro_profiles(metro_slug)
) STRICT;

CREATE TABLE lookup_sessions (
  session_token_digest TEXT PRIMARY KEY,
  coarse_metro_slug TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
) STRICT;

CREATE TABLE outbound_link_events (
  event_id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  page_id TEXT NOT NULL,
  canonical_product_id TEXT,
  merchant_id TEXT NOT NULL,
  destination_id TEXT NOT NULL,
  relationship TEXT NOT NULL,
  metro_slug TEXT,
  session_token_digest TEXT,
  expires_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  FOREIGN KEY (canonical_product_id) REFERENCES catalog_product_projection(product_id),
  FOREIGN KEY (merchant_id) REFERENCES merchants(merchant_id),
  FOREIGN KEY (session_token_digest) REFERENCES lookup_sessions(session_token_digest) ON DELETE SET NULL
) STRICT;

CREATE INDEX outbound_link_events_expiry_idx ON outbound_link_events(expires_at);

CREATE TABLE adapter_health (
  source_id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  circuit_open_until TEXT,
  checked_at TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES source_policies_runtime(source_id)
) STRICT;

CREATE TABLE source_failures (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  error_code TEXT NOT NULL,
  retryable INTEGER NOT NULL CHECK (retryable IN (0, 1)),
  bounded_detail TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  FOREIGN KEY (source_id) REFERENCES source_policies_runtime(source_id)
) STRICT;

CREATE TABLE quota_buckets (
  source_id TEXT NOT NULL,
  bucket_kind TEXT NOT NULL,
  bucket_start TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  cost_microusd INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (source_id, bucket_kind, bucket_start),
  FOREIGN KEY (source_id) REFERENCES source_policies_runtime(source_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE manual_offer_reviews (
  offer_id TEXT PRIMARY KEY,
  canonical_product_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  normalized_offer_json TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL,
  FOREIGN KEY (canonical_product_id) REFERENCES catalog_product_projection(product_id),
  FOREIGN KEY (source_id) REFERENCES source_policies_runtime(source_id)
) STRICT;

CREATE TABLE data_corrections (
  id TEXT PRIMARY KEY,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT
) STRICT;

CREATE TABLE runtime_release_markers (
  component TEXT PRIMARY KEY,
  source_commit TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  catalog_identity_digest TEXT,
  released_at TEXT NOT NULL
) STRICT;
