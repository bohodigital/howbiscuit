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
const { count } = database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get();
if (count !== 22) throw new Error(`Expected 22 Handoff 3 runtime tables, found ${count}.`);
const { triggerCount } = database.prepare("SELECT count(*) AS triggerCount FROM sqlite_master WHERE type='trigger' AND name LIKE 'outbound_link_events_session_%'").get();
if (triggerCount !== 2) throw new Error(`Expected 2 outbound-event session triggers, found ${triggerCount}.`);
database.exec(`
  INSERT INTO merchants (merchant_id, display_name, status) VALUES ('fixture-merchant', 'Fixture merchant', 'active');
  INSERT INTO lookup_sessions (session_token_digest, coarse_metro_slug, created_at, expires_at)
    VALUES ('session', 'chicago', '2026-07-22T18:00:00.000Z', '2026-07-22T19:00:00.000Z');
  INSERT INTO outbound_link_events (event_id, occurred_at, page_id, merchant_id, destination_id, relationship, session_token_digest, expires_at, idempotency_key)
    VALUES ('event-1', '2026-07-22T18:01:00.000Z', 'page', 'fixture-merchant', 'destination', 'unpaid', 'session', '2026-10-20T18:01:00.000Z', 'idempotency-1');
  INSERT OR IGNORE INTO outbound_link_events (event_id, occurred_at, page_id, merchant_id, destination_id, relationship, session_token_digest, expires_at, idempotency_key)
    VALUES ('event-replay', '2026-07-22T18:01:00.000Z', 'page', 'fixture-merchant', 'destination', 'unpaid', 'session', '2026-10-20T18:01:00.000Z', 'idempotency-1');
`);
const replayCount = database.prepare("SELECT event_count AS eventCount FROM lookup_sessions WHERE session_token_digest='session'").get();
if (replayCount.eventCount !== 1) throw new Error(`Idempotent replay consumed the session budget; found ${replayCount.eventCount}.`);
database.close();
process.stdout.write(`D1 migration check passed: ${count} runtime tables.\n`);
