PRAGMA foreign_keys = ON;

CREATE TABLE dataset_manifests (
  dataset_id TEXT PRIMARY KEY,
  publisher TEXT NOT NULL,
  dataset_name TEXT NOT NULL,
  vintage TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  source_url TEXT NOT NULL,
  public_use_basis TEXT NOT NULL,
  file_sha256 TEXT NOT NULL,
  import_script_version TEXT NOT NULL,
  row_counts_json TEXT NOT NULL,
  validation_results_json TEXT NOT NULL,
  imported_at TEXT NOT NULL
) STRICT;

ALTER TABLE metro_profiles ADD COLUMN dataset_release_id TEXT NOT NULL DEFAULT 'uninitialized';
ALTER TABLE location_profiles ADD COLUMN dataset_release_id TEXT NOT NULL DEFAULT 'uninitialized';
ALTER TABLE lookup_sessions ADD COLUMN event_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE abuse_buckets (
  bucket_digest TEXT PRIMARY KEY,
  bucket_day TEXT NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count > 0),
  expires_at TEXT NOT NULL
) STRICT;

CREATE TABLE zip_location_crosswalk (
  zip TEXT PRIMARY KEY CHECK (length(zip) = 5),
  zcta TEXT,
  centroid_latitude REAL,
  centroid_longitude REAL,
  primary_county_fips TEXT NOT NULL,
  county_weights_json TEXT NOT NULL,
  cbsa_weights_json TEXT NOT NULL,
  primary_cbsa TEXT,
  metro_slug TEXT,
  census_vintage TEXT NOT NULL,
  hud_vintage TEXT NOT NULL,
  dataset_release_id TEXT NOT NULL,
  FOREIGN KEY (zcta) REFERENCES location_profiles(zcta),
  FOREIGN KEY (metro_slug) REFERENCES metro_profiles(metro_slug)
) STRICT;

CREATE INDEX lookup_sessions_expiry_idx ON lookup_sessions(expires_at);
CREATE INDEX abuse_buckets_expiry_idx ON abuse_buckets(expires_at);

CREATE TRIGGER outbound_link_events_session_limit
BEFORE INSERT ON outbound_link_events
WHEN NEW.session_token_digest IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM lookup_sessions
  WHERE session_token_digest=NEW.session_token_digest
    AND expires_at>NEW.occurred_at
    AND event_count<10
)
BEGIN
  SELECT RAISE(ABORT, 'lookup session unavailable');
END;

CREATE TRIGGER outbound_link_events_session_count
AFTER INSERT ON outbound_link_events
WHEN NEW.session_token_digest IS NOT NULL
BEGIN
  UPDATE lookup_sessions SET event_count=event_count+1
  WHERE session_token_digest=NEW.session_token_digest;
END;
