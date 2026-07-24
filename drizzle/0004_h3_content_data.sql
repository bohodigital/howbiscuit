PRAGMA foreign_keys = ON;

CREATE TABLE dataset_releases (
  release_id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'validated', 'published', 'retired')),
  source_commit TEXT,
  created_at TEXT NOT NULL,
  validated_at TEXT
) STRICT;

CREATE TABLE content_dataset_manifests (
  dataset_id TEXT NOT NULL,
  release_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_count INTEGER NOT NULL CHECK (record_count >= 0),
  retrieved_at TEXT NOT NULL,
  content_digest TEXT NOT NULL,
  PRIMARY KEY (dataset_id, release_id),
  FOREIGN KEY (release_id) REFERENCES dataset_releases(release_id)
) STRICT;

CREATE TABLE geography_relationships (
  relationship_id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL,
  zip_code TEXT NOT NULL CHECK (length(zip_code) = 5),
  geography_type TEXT NOT NULL CHECK (geography_type IN ('county', 'cbsa')),
  geography_id TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL CHECK (length(state) = 2),
  residential_ratio REAL NOT NULL CHECK (residential_ratio BETWEEN 0 AND 1),
  source_id TEXT NOT NULL,
  FOREIGN KEY (release_id) REFERENCES dataset_releases(release_id)
) STRICT;

CREATE TABLE energy_observations (
  observation_id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL,
  series_id TEXT NOT NULL,
  geography_id TEXT NOT NULL,
  period TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'annual')),
  source_id TEXT NOT NULL,
  FOREIGN KEY (release_id) REFERENCES dataset_releases(release_id)
) STRICT;

CREATE TABLE food_identities (
  food_id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL,
  fdc_id INTEGER NOT NULL UNIQUE,
  description TEXT NOT NULL,
  data_type TEXT NOT NULL,
  publication_date TEXT,
  source_id TEXT NOT NULL,
  FOREIGN KEY (release_id) REFERENCES dataset_releases(release_id)
) STRICT;

CREATE TABLE food_nutrient_observations (
  observation_id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL,
  food_id TEXT NOT NULL,
  nutrient_id INTEGER NOT NULL,
  nutrient_name TEXT NOT NULL,
  amount REAL NOT NULL,
  unit TEXT NOT NULL,
  source_id TEXT NOT NULL,
  FOREIGN KEY (release_id) REFERENCES dataset_releases(release_id),
  FOREIGN KEY (food_id) REFERENCES food_identities(food_id)
) STRICT;

CREATE TABLE market_report_definitions (
  report_id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL,
  title TEXT NOT NULL,
  market_type TEXT NOT NULL,
  unit_basis TEXT NOT NULL,
  source_id TEXT NOT NULL,
  FOREIGN KEY (release_id) REFERENCES dataset_releases(release_id)
) STRICT;

CREATE TABLE market_report_observations (
  observation_id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL,
  report_id TEXT NOT NULL,
  report_date TEXT NOT NULL,
  commodity TEXT NOT NULL,
  geography TEXT NOT NULL,
  metric TEXT NOT NULL,
  value_min REAL,
  value_max REAL,
  unit_basis TEXT NOT NULL,
  source_id TEXT NOT NULL,
  FOREIGN KEY (release_id) REFERENCES dataset_releases(release_id),
  FOREIGN KEY (report_id) REFERENCES market_report_definitions(report_id)
) STRICT;

CREATE TABLE agricultural_statistics (
  statistic_id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL,
  commodity TEXT NOT NULL,
  statistic TEXT NOT NULL,
  geography TEXT NOT NULL,
  period TEXT NOT NULL,
  value REAL,
  unit TEXT NOT NULL,
  suppressed INTEGER NOT NULL DEFAULT 0 CHECK (suppressed IN (0, 1)),
  source_revision_at TEXT,
  source_id TEXT NOT NULL,
  FOREIGN KEY (release_id) REFERENCES dataset_releases(release_id),
  CHECK ((suppressed = 1 AND value IS NULL) OR (suppressed = 0 AND value IS NOT NULL))
) STRICT;

CREATE TABLE merchant_locations (
  location_id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  merchant_location_id TEXT NOT NULL,
  postal_code TEXT,
  source_id TEXT NOT NULL,
  UNIQUE (merchant_id, merchant_location_id),
  FOREIGN KEY (release_id) REFERENCES dataset_releases(release_id)
) STRICT;

CREATE TABLE merchant_product_mappings (
  mapping_id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL,
  canonical_product_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  merchant_product_id TEXT NOT NULL,
  match_confidence TEXT NOT NULL,
  identity_evidence TEXT NOT NULL,
  approved INTEGER NOT NULL CHECK (approved IN (0, 1)),
  source_id TEXT NOT NULL,
  FOREIGN KEY (release_id) REFERENCES dataset_releases(release_id)
) STRICT;

CREATE TABLE retailer_offer_observations (
  observation_id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL,
  mapping_id TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  price_amount REAL,
  currency TEXT,
  availability TEXT NOT NULL,
  source_id TEXT NOT NULL,
  FOREIGN KEY (release_id) REFERENCES dataset_releases(release_id),
  FOREIGN KEY (mapping_id) REFERENCES merchant_product_mappings(mapping_id),
  CHECK (expires_at > observed_at)
) STRICT;

CREATE TABLE research_packets (
  packet_id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL,
  title TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'validated', 'retired')),
  FOREIGN KEY (release_id) REFERENCES dataset_releases(release_id)
) STRICT;

CREATE TABLE research_packet_sources (
  packet_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  PRIMARY KEY (packet_id, source_id, record_id),
  FOREIGN KEY (packet_id) REFERENCES research_packets(packet_id)
) STRICT;

CREATE TABLE unresolved_mapping_candidates (
  candidate_id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  merchant_product_id TEXT NOT NULL,
  candidate_product_id TEXT,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (release_id) REFERENCES dataset_releases(release_id)
) STRICT;

CREATE INDEX geography_release_zip_idx ON geography_relationships(release_id, zip_code);
CREATE INDEX energy_release_series_period_idx ON energy_observations(release_id, series_id, period);
CREATE INDEX agricultural_release_commodity_period_idx ON agricultural_statistics(release_id, commodity, period);
CREATE INDEX packet_source_record_idx ON research_packet_sources(source_id, record_id);
