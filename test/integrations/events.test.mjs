import assert from 'node:assert/strict';
import test from 'node:test';

import { createEventsWorker } from '../../workers/events/src/index.mjs';

test('outbound events are clicks, deduplicate, and retain no raw session or destination URL', async () => {
  const writes = [];
  const recordedKeys = new Set();
  const database = {
    prepare(sql) {
      return {
        bind(...values) { this.values = values; return this; },
        async first() {
          if (/SELECT event_id/.test(sql)) return recordedKeys.has(this.values[0]) ? { eventId: 'recorded' } : null;
          return /SELECT coarse_metro_slug/.test(sql) ? { metroSlug: 'chicago' } : null;
        },
        async run() { writes.push({ sql, values: this.values }); recordedKeys.add(this.values.at(-1)); return { success: true }; },
      };
    },
  };
  const payload = { eventId: '22222222-2222-4222-8222-222222222222', eventType: 'outbound-shopping-click', pageId: 'article-example', canonicalProductId: null, merchantId: 'example-retailer', destinationId: 'example-destination', relationship: 'unpaid', metroSlug: 'chicago', sessionToken: '11111111-1111-4111-8111-111111111111' };
  const worker = createEventsWorker({ now: () => new Date('2026-07-22T18:25:00.000Z'), randomUUID: () => '33333333-3333-4333-8333-333333333333' });
  const request = () => new Request('https://events.invalid/api/v1/events/outbound', { method: 'POST', body: JSON.stringify(payload), headers: { 'content-type': 'application/json' } });
  const first = await worker.fetch(request(), { DB: database, EVENTS_ENABLED: 'true' });
  const second = await worker.fetch(request(), { DB: database, EVENTS_ENABLED: 'true' });
  assert.equal(first.status, 202);
  const firstBody = await first.json();
  const secondBody = await second.json();
  assert.deepEqual({ recorded: firstBody.recorded, classification: firstBody.classification }, { recorded: true, classification: 'outbound-click' });
  assert.equal(secondBody.idempotencyKey, firstBody.idempotencyKey);
  assert.equal(writes[0].sql.includes('INSERT OR IGNORE'), true);
  assert.equal(writes[0].values.includes(payload.sessionToken), false);
  assert.equal(writes[0].values.some((value) => typeof value === 'string' && value.startsWith('http')), false);
  assert.equal(writes.length, 1);
  assert.match(writes[0].sql, /INSERT OR IGNORE/);
  const forbidden = await worker.fetch(new Request('https://events.invalid/api/v1/events/outbound', { method: 'POST', body: JSON.stringify({ ...payload, conversion: 'sale' }), headers: { 'content-type': 'application/json' } }), { DB: database, EVENTS_ENABLED: 'true' });
  assert.equal(forbidden.status, 400);
  const preflight = await worker.fetch(new Request('https://events.invalid/api/v1/events/outbound', { method: 'OPTIONS', headers: { origin: 'https://howbiscuit.com', 'access-control-request-method': 'POST' } }), { DB: database, EVENTS_ENABLED: 'true' });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-methods'), 'POST, OPTIONS');

  const cleanup = [];
  const cleanupDatabase = {
    prepare(sql) { return { bind(...values) { return { sql, values }; } }; },
    async batch(statements) { cleanup.push(...statements); return []; },
  };
  await worker.scheduled({}, { DB: cleanupDatabase });
  assert.equal(cleanup.length, 4);
  assert.ok(cleanup.some(({ sql }) => /DELETE FROM outbound_link_events/.test(sql)));
  assert.ok(cleanup.some(({ sql }) => /manual_offer_reviews/.test(sql)));
});

test('outbound events fail closed when the lookup-session event budget is exhausted', async () => {
  const database = { prepare() { return { bind() { return this; }, async first() { return null; } }; } };
  const payload = { eventId: '22222222-2222-4222-8222-222222222222', eventType: 'outbound-shopping-click', pageId: 'article-example', canonicalProductId: null, merchantId: 'example-retailer', destinationId: 'example-destination', relationship: 'unpaid', metroSlug: 'chicago', sessionToken: '11111111-1111-4111-8111-111111111111' };
  const response = await createEventsWorker().fetch(new Request('https://events.invalid/api/v1/events/outbound', { method: 'POST', body: JSON.stringify(payload), headers: { 'content-type': 'application/json' } }), { DB: database, EVENTS_ENABLED: 'true' });
  assert.equal(response.status, 400);
});
