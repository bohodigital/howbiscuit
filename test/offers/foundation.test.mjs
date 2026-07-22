import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { load as parseYaml } from 'js-yaml';

import { createFixtureAdapter } from '../../src/lib/offers/adapter.mjs';
import { buildCatalogProjection, projectionStatements } from '../../src/lib/offers/catalog-projection.mjs';
import { catalogReleaseHealth } from '../../src/lib/offers/catalog-store.mjs';
import { circuitState, quotaState, requestFingerprint } from '../../src/lib/offers/quota.mjs';
import { enforceOfferPolicy, lookupOffers } from '../../src/lib/offers/runtime.mjs';
import { isOfferCurrent, normalizedOfferSchema, suppressExpiredOffers } from '../../src/lib/offers/schema.mjs';
import { evaluateSourcePolicy, sourcePolicySchema, sourceRuntimeFromEnvironment } from '../../src/lib/offers/source-policy.mjs';
import { createOfferWorker } from '../../workers/offers/src/index.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const policy = sourcePolicySchema.parse(parseYaml(readFileSync(path.join(directory, 'fixtures', 'fixture-source.yaml'), 'utf8')));
const canonicalProduct = {
  id: 'fixture-router-us-black',
  displayName: 'Fixture Router',
  brand: 'Fixture',
  model: 'FR-1',
  exactVariant: 'US power adapter, black, router only',
  productType: 'router',
  variantAttributes: { region: 'US', color: 'Black', bundle: 'Router only' },
  status: 'published',
};
const projection = buildCatalogProjection({ schemaVersion: '1.0.0', products: [canonicalProduct] }, {
  sourceCommit: '7'.repeat(40),
  syncedAt: '2026-07-22T00:00:00.000Z',
});
const offer = {
  schemaVersion: '1.0.0',
  offerId: 'fixture-store:sku-1:store-1:new',
  canonicalProductId: canonicalProduct.id,
  merchantId: 'fixture-store',
  merchantProductId: 'sku-1',
  storeId: 'store-1',
  price: { amount: 159.99, currency: 'USD' },
  condition: 'new',
  quantity: 1,
  bundle: 'router-only',
  fulfillment: ['pickup', 'shipping'],
  pickupVerified: true,
  shippingCost: null,
  membershipRequired: null,
  couponRequired: false,
  subscriptionRequired: false,
  tradeInRequired: false,
  financingRequired: null,
  observedAt: '2026-07-22T18:15:00.000Z',
  expiresAt: '2026-07-22T19:15:00.000Z',
  sourceId: 'fixture-store',
  sourceMethod: 'fixture',
  matchConfidence: 'exact-retailer-sku',
  relationship: 'unpaid',
  displayRestrictions: [],
  availabilityState: 'available',
};
const activeMapping = {
  canonicalProductId: canonicalProduct.id,
  matchConfidence: 'exact-retailer-sku',
  matchEvidenceJson: JSON.stringify({ retailerSku: 'sku-1', reviewed: true, evidenceIds: ['fixture-sku-record'] }),
  reviewedBy: 'fixture-reviewer',
  reviewedAt: '2026-07-21T18:15:00.000Z',
  status: 'active',
};
function controls(overrides = {}) {
  return {
    usage: { monthlyCostUsd: 0, monthlyRequests: 0, dailyRequests: 0, currentSecondRequests: 0, projectedRequestCostUsd: 0, ...overrides.usage },
    circuit: { consecutiveFailures: 0, circuitOpenUntil: null, ...overrides.circuit },
    reserve: overrides.reserve || (async () => true),
    recordSuccess: overrides.recordSuccess || (async () => true),
    recordFailure: overrides.recordFailure || (async () => true),
  };
}

test('catalog projection preserves exact Handoff 2 identity and rejects duplicates', () => {
  assert.equal(projection.rows[0].productId, canonicalProduct.id);
  assert.equal(projection.rows[0].sourceCommit, '7'.repeat(40));
  assert.match(projection.rows[0].identityDigest, /^[0-9a-f]{64}$/);
  assert.throws(() => buildCatalogProjection({ schemaVersion: '1.0.0', products: [canonicalProduct, { ...canonicalProduct, id: 'duplicate-id' }] }, { sourceCommit: '7'.repeat(40) }), /Duplicate canonical identity digest/);
});

test('projection uses parameterized D1 statements and records a release marker', () => {
  const calls = [];
  const db = { prepare(sql) { calls.push(sql); return { bind(...values) { return { sql, values }; } }; } };
  const statements = projectionStatements(db, projection);
  assert.equal(statements.length, 3);
  assert.match(calls[0], /VALUES \(\?1, \?2, \?3/);
  assert.match(calls.at(-1), /runtime_release_markers/);
});

test('catalog release health verifies the full release-member digest and commit', async () => {
  const rows = projection.rows.map(({ syncedAt: _syncedAt, releaseMember: _releaseMember, ...row }) => row);
  const database = {
    prepare(sql) {
      return {
        async first() { return { sourceCommit: projection.sourceCommit, schemaVersion: projection.schemaVersion, catalogIdentityDigest: projection.catalogIdentityDigest }; },
        async all() { return { results: sql.includes('release_member=1') ? rows : [] }; },
      };
    },
  };
  assert.equal((await catalogReleaseHealth(database, projection.sourceCommit)).ready, true);
  rows[0] = { ...rows[0], identityDigest: '0'.repeat(64) };
  assert.equal((await catalogReleaseHealth(database, projection.sourceCommit)).reason, 'projection-digest-mismatch');
});

test('source policy fails closed on activation, terms, credentials, budgets, and kill switches', () => {
  const now = new Date('2026-07-22T20:00:00.000Z');
  assert.equal(evaluateSourcePolicy(policy, { databaseEnabled: true, killSwitchEnabled: true }, now), 'healthy');
  assert.equal(evaluateSourcePolicy({ ...policy, publicActivationApproved: false }, { databaseEnabled: true, killSwitchEnabled: true }, now), 'policy-disabled');
  assert.equal(evaluateSourcePolicy(policy, { databaseEnabled: true, killSwitchEnabled: false }, now), 'disabled');
  assert.equal(evaluateSourcePolicy(policy, { databaseEnabled: true, killSwitchEnabled: true, authenticationFailed: true }, now), 'authentication-failed');
  assert.equal(evaluateSourcePolicy(policy, { databaseEnabled: true, killSwitchEnabled: true, budgetExhausted: true }, now), 'budget-exhausted');
  assert.equal(evaluateSourcePolicy(policy, { databaseEnabled: true, killSwitchEnabled: true }, new Date('2100-01-01T00:00:00.000Z')), 'terms-review-required');
  assert.equal(evaluateSourcePolicy({ ...policy, review: { ...policy.review, comparisonStatus: 'requires-review' } }, { databaseEnabled: true, killSwitchEnabled: true }, now), 'policy-disabled');
  assert.equal(evaluateSourcePolicy({ ...policy, legalBasis: { ...policy.legalBasis, termsExpiresAt: '2026-07-21' } }, { databaseEnabled: true, killSwitchEnabled: true }, now), 'terms-review-required');
  assert.equal(evaluateSourcePolicy(policy, { killSwitchEnabled: true }, now), 'policy-disabled');
  assert.equal(sourceRuntimeFromEnvironment(policy, {}, { enabled: true }).killSwitchEnabled, false);
  assert.equal(sourceRuntimeFromEnvironment(policy, { FIXTURE_STORE_ENABLED: 'true' }, { enabled: true }).killSwitchEnabled, true);
});

test('normalized offers preserve unknown values and suppress hard-expired data', () => {
  const parsed = normalizedOfferSchema.parse(offer);
  assert.equal(parsed.shippingCost, null);
  assert.equal(parsed.membershipRequired, null);
  assert.equal(isOfferCurrent(parsed, new Date('2026-07-22T19:14:59.000Z')), true);
  assert.deepEqual(suppressExpiredOffers([parsed], new Date(parsed.expiresAt)), []);
  assert.throws(() => normalizedOfferSchema.parse({ ...offer, matchConfidence: 'probable' }), /Public offers require exact/);
  assert.throws(() => normalizedOfferSchema.parse({ ...offer, storeId: null }), /Pickup offers require/);
  const clipped = enforceOfferPolicy(
    { ...offer, expiresAt: '2026-07-30T00:00:00.000Z' },
    { ...policy, refresh: { ...policy.refresh, hardExpirySeconds: 3600 } },
    new Date('2026-07-22T18:30:00.000Z'),
  );
  assert.equal(clipped.expiresAt, '2026-07-22T19:15:00.000Z');
  assert.equal(enforceOfferPolicy(
    { ...offer, observedAt: '2026-07-23T18:15:00.000Z', expiresAt: '2026-07-23T19:15:00.000Z' }, policy,
    new Date('2026-07-22T18:30:00.000Z'),
  ), null);
});

test('fixture adapter serves exact current products and rejects unknown products', async () => {
  const adapter = createFixtureAdapter({ sourceId: 'fixture-store', offers: [offer] });
  const result = await lookupOffers({
    query: { productId: canonicalProduct.id, zip: '60614', condition: 'new', fulfillment: 'pickup' },
    catalog: projection.rows,
    adapters: [adapter],
    policies: new Map([['fixture-store', policy]]),
    runtimeBySource: { 'fixture-store': { databaseEnabled: true, killSwitchEnabled: true } },
    controlResolver: async () => controls(),
    mappingResolver: async () => activeMapping,
    now: new Date('2026-07-22T18:30:00.000Z'),
  });
  assert.equal(result.offers.length, 1);
  assert.equal(result.coverage[0].status, 'healthy');
  const untrustedAdapter = {
    sourceId: 'fixture-store',
    async health() { return 'healthy'; },
    async lookup() {
      return [
        { ...offer, canonicalProductId: 'different-product' },
        { ...offer, offerId: 'fixture-store:sku-2:store-1:new', matchConfidence: 'exact-gtin' },
      ];
    },
  };
  const rejected = await lookupOffers({
    query: { productId: canonicalProduct.id },
    catalog: projection.rows,
    adapters: [untrustedAdapter],
    policies: new Map([['fixture-store', policy]]),
    runtimeBySource: { 'fixture-store': { databaseEnabled: true, killSwitchEnabled: true } },
    controlResolver: async () => controls(),
    mappingResolver: async () => activeMapping,
    now: new Date('2026-07-22T18:30:00.000Z'),
  });
  assert.deepEqual(rejected.offers, []);
  const forgedExact = await lookupOffers({
    query: { productId: canonicalProduct.id }, catalog: projection.rows,
    adapters: [{ sourceId: 'fixture-store', async health() { return 'healthy'; }, async lookup() { return [offer]; } }],
    policies: new Map([['fixture-store', policy]]),
    runtimeBySource: { 'fixture-store': { databaseEnabled: true, killSwitchEnabled: true } },
    controlResolver: async () => controls(),
    mappingResolver: async () => ({ ...activeMapping, canonicalProductId: 'different-product' }),
    now: new Date('2026-07-22T18:30:00.000Z'),
  });
  assert.deepEqual(forgedExact.offers, []);
  await assert.rejects(() => lookupOffers({
    query: { productId: 'unknown-product' }, catalog: projection.rows, adapters: [], policies: new Map(),
    controlResolver: async () => controls(), mappingResolver: async () => activeMapping,
  }), /Unknown or unavailable/);
});

test('quota, budget, circuit, and deduplication primitives fail closed', async () => {
  assert.equal(quotaState(policy, { dailyRequests: 50, monthlyRequests: 10, monthlyCostUsd: 0, currentSecondRequests: 0, projectedRequestCostUsd: 0 }), 'quota-limited');
  assert.equal(quotaState(policy, { dailyRequests: 0, monthlyRequests: 500, monthlyCostUsd: 0, currentSecondRequests: 0, projectedRequestCostUsd: 0 }), 'budget-exhausted');
  assert.equal(quotaState(policy, { dailyRequests: 0, monthlyRequests: 0, monthlyCostUsd: 0, currentSecondRequests: 0, projectedRequestCostUsd: 0.01 }), 'budget-exhausted');
  assert.equal(circuitState({ consecutiveFailures: 3, circuitOpenUntil: null }, policy), 'open');
  assert.equal(quotaState(policy, { dailyRequests: 0, monthlyRequests: 0, monthlyCostUsd: 0, currentSecondRequests: 0 }), 'budget-exhausted');
  assert.equal(quotaState(policy, { dailyRequests: 0, monthlyRequests: 0, monthlyCostUsd: 0, currentSecondRequests: 0, projectedRequestCostUsd: -1 }), 'budget-exhausted');
  const fingerprint = await requestFingerprint({ sourceId: 'fixture-store', productId: canonicalProduct.id, zip: '60614' });
  assert.equal(fingerprint, await requestFingerprint({ sourceId: 'fixture-store', productId: canonicalProduct.id, zip: '60614' }));
  assert.match(fingerprint, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(fingerprint, /60614/);
});

test('Worker remains disabled by default, validates requests, and restricts CORS', async () => {
  const worker = createOfferWorker({
    catalog: projection.rows,
    adapters: [createFixtureAdapter({ sourceId: 'fixture-store', offers: [offer] })],
    policies: new Map([['fixture-store', policy]]),
    databaseStateBySource: () => ({ 'fixture-store': { enabled: true } }),
    controlResolver: async () => controls(),
    mappingResolver: async () => activeMapping,
    now: () => new Date('2026-07-22T18:30:00.000Z'),
  });
  const disabled = await worker.fetch(new Request(`https://offers.invalid/api/v1/offers?productId=${canonicalProduct.id}`), { GLOBAL_OFFERS_ENABLED: 'false' });
  assert.equal(disabled.status, 503);
  const forbidden = await worker.fetch(new Request(`https://offers.invalid/api/v1/offers?productId=${canonicalProduct.id}`, { headers: { origin: 'https://evil.invalid' } }), { GLOBAL_OFFERS_ENABLED: 'true' });
  assert.equal(forbidden.status, 403);
  const invalid = await worker.fetch(new Request('https://offers.invalid/api/v1/offers?productId=missing'), { GLOBAL_OFFERS_ENABLED: 'true' });
  assert.equal(invalid.status, 400);
  const sourceDisabled = await worker.fetch(new Request(`https://offers.invalid/api/v1/offers?productId=${canonicalProduct.id}`), { GLOBAL_OFFERS_ENABLED: 'true' });
  assert.equal((await sourceDisabled.json()).offers.length, 0);
  const active = await worker.fetch(new Request(`https://offers.invalid/api/v1/offers?productId=${canonicalProduct.id}&zip=60614&fulfillment=pickup`), { GLOBAL_OFFERS_ENABLED: 'true', FIXTURE_STORE_ENABLED: 'true' });
  assert.equal(active.status, 200);
  const body = await active.json();
  assert.equal(body.offers.length, 1);
  const boundedStatus = createOfferWorker({ sourceStatuses: async () => [{ sourceId: 'fixture-store', status: 'healthy', secret: 'must-not-leak' }] });
  const statusResponse = await boundedStatus.fetch(new Request('https://offers.invalid/api/v1/source-status'), {});
  assert.equal(statusResponse.status, 503);
  assert.deepEqual(await statusResponse.json(), { error: 'Source status unavailable.' });
});

test('offer execution enforces health, circuit, quota, and fixture-only mode before adapter calls', async () => {
  let calls = 0;
  const adapter = { sourceId: 'fixture-store', async health() { return 'healthy'; }, async lookup() { calls += 1; return [offer]; } };
  const base = {
    query: { productId: canonicalProduct.id }, catalog: projection.rows, adapters: [adapter],
    policies: new Map([['fixture-store', policy]]), runtimeBySource: { 'fixture-store': { databaseEnabled: true, killSwitchEnabled: true } },
    mappingResolver: async () => activeMapping, now: new Date('2026-07-22T18:30:00.000Z'),
  };
  const quotaLimited = await lookupOffers({ ...base, controlResolver: async () => controls({ usage: { dailyRequests: 50 } }) });
  assert.equal(quotaLimited.coverage[0].status, 'quota-limited');
  assert.equal(calls, 0);
  const circuitOpen = await lookupOffers({ ...base, controlResolver: async () => controls({ circuit: { consecutiveFailures: 3 } }) });
  assert.equal(circuitOpen.coverage[0].status, 'degraded');
  assert.equal(calls, 0);
  const externalPolicy = { ...policy, legalBasis: { ...policy.legalBasis, type: 'official-api', termsUrl: 'https://provider.invalid/terms', documentationUrl: 'https://provider.invalid/docs', termsExpiresAt: '2026-12-31' } };
  const fixtureOnly = await lookupOffers({ ...base, policies: new Map([['fixture-store', externalPolicy]]), controlResolver: async () => controls() });
  assert.equal(fixtureOnly.coverage[0].status, 'policy-disabled');
  assert.equal(calls, 0);

  let consecutiveFailures = 0;
  const failing = { sourceId: 'fixture-store', async health() { return 'healthy'; }, async lookup() { throw new Error('fixture outage'); } };
  const failureBase = { ...base, adapters: [failing], controlResolver: async () => controls({
    circuit: { consecutiveFailures },
    recordFailure: async () => { consecutiveFailures += 1; return true; },
  }) };
  await lookupOffers(failureBase);
  await lookupOffers(failureBase);
  await lookupOffers(failureBase);
  const opened = await lookupOffers(failureBase);
  assert.equal(consecutiveFailures, 3);
  assert.equal(opened.coverage[0].status, 'degraded');

  let latchCalls = 0;
  const failClosedSources = new Set();
  const persistenceFailure = {
    ...base,
    adapters: [{ sourceId: 'fixture-store', async health() { return 'healthy'; }, async lookup() { latchCalls += 1; throw new Error('outage'); } }],
    controlResolver: async () => controls({ recordFailure: async () => { throw new Error('D1 unavailable'); } }),
    failClosedSources,
  };
  await lookupOffers(persistenceFailure);
  const latched = await lookupOffers(persistenceFailure);
  assert.equal(latchCalls, 1);
  assert.equal(latched.coverage[0].status, 'degraded');
});

test('Worker rejects stale D1 projections that do not match the deployed catalog marker', async () => {
  const database = {
    prepare(sql) {
      return {
        bind() { return this; },
        async first() {
          return sql.includes('runtime_release_markers')
            ? { sourceCommit: 'b'.repeat(40), catalogIdentityDigest: 'c'.repeat(64), schemaVersion: '1.0.0' }
            : { productId: canonicalProduct.id, status: 'published', sourceCommit: 'a'.repeat(40) };
        },
      };
    },
  };
  const response = await createOfferWorker().fetch(
    new Request(`https://offers.invalid/api/v1/offers?productId=${canonicalProduct.id}`),
    { DB: database, GLOBAL_OFFERS_ENABLED: 'true', STATIC_CATALOG_COMMIT: 'a'.repeat(40) },
  );
  assert.equal(response.status, 400);
});
