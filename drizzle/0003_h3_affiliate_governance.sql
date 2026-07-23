PRAGMA foreign_keys = ON;

CREATE TABLE affiliate_program_eligibility (
  program_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'suspended', 'retired')),
  program_approval_evidence_id TEXT,
  api_eligibility_evidence_id TEXT,
  terms_review_evidence_id TEXT,
  public_activation_approved INTEGER NOT NULL CHECK (public_activation_approved IN (0, 1)),
  database_enabled INTEGER NOT NULL CHECK (database_enabled IN (0, 1)),
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES source_policies_runtime(source_id),
  FOREIGN KEY (merchant_id) REFERENCES merchants(merchant_id),
  CHECK (
    status <> 'approved'
    OR (
      program_approval_evidence_id IS NOT NULL
      AND api_eligibility_evidence_id IS NOT NULL
      AND terms_review_evidence_id IS NOT NULL
      AND reviewed_at IS NOT NULL
    )
  ),
  CHECK (public_activation_approved = 0 OR status = 'approved'),
  CHECK (database_enabled = 0 OR public_activation_approved = 1)
) STRICT;

CREATE TABLE affiliate_special_links (
  destination_id TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL UNIQUE,
  source_id TEXT NOT NULL,
  approved_url TEXT NOT NULL,
  approval_evidence_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('approved-disabled', 'approved-preview', 'approved-public', 'retired')),
  approved_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (relationship_id) REFERENCES affiliate_relationships(id),
  FOREIGN KEY (source_id) REFERENCES source_policies_runtime(source_id)
) STRICT;

CREATE INDEX affiliate_program_source_status_idx
  ON affiliate_program_eligibility(source_id, status, public_activation_approved, database_enabled);

CREATE UNIQUE INDEX affiliate_relationship_identity_idx
  ON affiliate_relationships(canonical_product_id, merchant_id, destination_id, program_id);

CREATE TRIGGER affiliate_relationships_validate_insert
BEFORE INSERT ON affiliate_relationships
WHEN
  NEW.relationship NOT IN ('affiliate-pending', 'affiliate-approved-disabled', 'affiliate-approved-preview', 'affiliate-approved-public', 'retired')
  OR NEW.program_id IS NULL
  OR trim(NEW.program_id) = ''
  OR (NEW.relationship = 'affiliate-approved-public' AND (NEW.public_activation_approved <> 1 OR NEW.enabled_at IS NULL))
  OR (NEW.public_activation_approved = 1 AND NEW.relationship <> 'affiliate-approved-public')
BEGIN
  SELECT RAISE(ABORT, 'invalid affiliate relationship governance');
END;

CREATE TRIGGER affiliate_relationships_validate_update
BEFORE UPDATE ON affiliate_relationships
WHEN
  NEW.relationship NOT IN ('affiliate-pending', 'affiliate-approved-disabled', 'affiliate-approved-preview', 'affiliate-approved-public', 'retired')
  OR NEW.program_id IS NULL
  OR trim(NEW.program_id) = ''
  OR (NEW.relationship = 'affiliate-approved-public' AND (NEW.public_activation_approved <> 1 OR NEW.enabled_at IS NULL))
  OR (NEW.public_activation_approved = 1 AND NEW.relationship <> 'affiliate-approved-public')
BEGIN
  SELECT RAISE(ABORT, 'invalid affiliate relationship governance');
END;
