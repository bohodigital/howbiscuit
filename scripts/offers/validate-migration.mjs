#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const database = new DatabaseSync(':memory:');
database.exec(readFileSync(path.join(root, 'drizzle', '0001_h3_offer_foundation.sql'), 'utf8'));
const baseline = database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get();
if (baseline.count !== 19) throw new Error(`Expected 19 Handoff 3A runtime tables, found ${baseline.count}.`);
database.exec(readFileSync(path.join(root, 'drizzle', '0002_h3_location_events.sql'), 'utf8'));
const locationCount = database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get();
if (locationCount.count !== 22) throw new Error(`Expected 22 Handoff 3B runtime tables, found ${locationCount.count}.`);
database.exec(readFileSync(path.join(root, 'drizzle', '0003_h3_affiliate_governance.sql'), 'utf8'));
const { count } = database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get();
if (count !== 24) throw new Error(`Expected 24 Handoff 3 runtime tables, found ${count}.`);
database.exec(readFileSync(path.join(root, 'drizzle', '0004_h3_content_data.sql'), 'utf8'));
const { contentCount } = database.prepare("SELECT count(*) AS contentCount FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get();
if (contentCount !== 39) throw new Error(`Expected 39 Handoff 3 content-data tables, found ${contentCount}.`);
const { triggerCount } = database.prepare("SELECT count(*) AS triggerCount FROM sqlite_master WHERE type='trigger' AND name LIKE 'outbound_link_events_session_%'").get();
if (triggerCount !== 2) throw new Error(`Expected 2 outbound-event session triggers, found ${triggerCount}.`);
database.exec(`
  INSERT INTO merchants (merchant_id, display_name, status) VALUES ('fixture-merchant', 'Fixture merchant', 'active');
  INSERT INTO catalog_product_projection (product_id, catalog_schema_version, identity_digest, display_name, brand, model, exact_variant, product_type, status, release_member, source_commit, synced_at)
    VALUES ('fixture-product', '1.0.0', 'fixture-identity-digest', 'Fixture product', 'Fixture', 'F-1', 'Exact fixture variant', 'fixture', 'published', 1, '0000000000000000000000000000000000000000', '2026-07-22T18:00:00.000Z');
  INSERT INTO source_policies_runtime (source_id, adapter_id, policy_digest, review_due_at, terms_expires_at, comparison_status, public_activation_approved, enabled, state, synced_at)
    VALUES ('fixture-affiliate', 'fixture-affiliate-v1', 'digest', '2026-08-22', '2026-08-22', 'approved', 1, 1, 'healthy', '2026-07-22T18:00:00.000Z');
  INSERT INTO affiliate_program_eligibility (program_id, source_id, merchant_id, status, program_approval_evidence_id, api_eligibility_evidence_id, terms_review_evidence_id, public_activation_approved, database_enabled, reviewed_at, created_at, updated_at)
    VALUES ('fixture-program', 'fixture-affiliate', 'fixture-merchant', 'approved', 'program-proof', 'api-proof', 'terms-proof', 1, 1, '2026-07-22T18:00:00.000Z', '2026-07-22T18:00:00.000Z', '2026-07-22T18:00:00.000Z');
  INSERT INTO affiliate_relationships (id, canonical_product_id, merchant_id, destination_id, relationship, program_id, disclosure_policy_id, public_activation_approved, enabled_at)
    VALUES ('fixture-relationship', 'fixture-product', 'fixture-merchant', 'fixture-destination', 'affiliate-approved-public', 'fixture-program', 'fixture-disclosure', 1, '2026-07-22T18:00:00.000Z');
  INSERT INTO affiliate_special_links (destination_id, relationship_id, source_id, approved_url, approval_evidence_id, status, approved_at, updated_at)
    VALUES ('fixture-destination', 'fixture-relationship', 'fixture-affiliate', 'https://merchant.invalid/product?affiliate=approved', 'link-proof', 'approved-public', '2026-07-22T18:00:00.000Z', '2026-07-22T18:00:00.000Z');
  INSERT INTO lookup_sessions (session_token_digest, coarse_metro_slug, created_at, expires_at)
    VALUES ('session', 'chicago', '2026-07-22T18:00:00.000Z', '2026-07-22T19:00:00.000Z');
  INSERT INTO outbound_link_events (event_id, occurred_at, page_id, merchant_id, destination_id, relationship, session_token_digest, expires_at, idempotency_key)
    VALUES ('event-1', '2026-07-22T18:01:00.000Z', 'page', 'fixture-merchant', 'destination', 'unpaid', 'session', '2026-10-20T18:01:00.000Z', 'idempotency-1');
  INSERT OR IGNORE INTO outbound_link_events (event_id, occurred_at, page_id, merchant_id, destination_id, relationship, session_token_digest, expires_at, idempotency_key)
    VALUES ('event-replay', '2026-07-22T18:01:00.000Z', 'page', 'fixture-merchant', 'destination', 'unpaid', 'session', '2026-10-20T18:01:00.000Z', 'idempotency-1');
`);
const replayCount = database.prepare("SELECT event_count AS eventCount FROM lookup_sessions WHERE session_token_digest='session'").get();
if (replayCount.eventCount !== 1) throw new Error(`Idempotent replay consumed the session budget; found ${replayCount.eventCount}.`);
let invalidProgramRejected = false;
try {
  database.exec("INSERT INTO affiliate_program_eligibility (program_id, source_id, merchant_id, status, public_activation_approved, database_enabled, created_at, updated_at) VALUES ('invalid-program', 'fixture-affiliate', 'fixture-merchant', 'approved', 1, 1, '2026-07-22T18:00:00.000Z', '2026-07-22T18:00:00.000Z')");
} catch {
  invalidProgramRejected = true;
}
if (!invalidProgramRejected) throw new Error('Affiliate eligibility accepted approval without evidence.');
let invalidRelationshipRejected = false;
try {
  database.exec("INSERT INTO affiliate_relationships (id, canonical_product_id, merchant_id, destination_id, relationship, program_id, disclosure_policy_id, public_activation_approved) VALUES ('invalid-relationship', 'fixture-product', 'fixture-merchant', 'invalid-destination', 'affiliate-approved-public', 'fixture-program', 'fixture-disclosure', 1)");
} catch {
  invalidRelationshipRejected = true;
}
if (!invalidRelationshipRejected) throw new Error('Affiliate relationship accepted public activation without an enablement time.');
database.close();
process.stdout.write(`D1 migration check passed: ${contentCount} runtime tables.\n`);
