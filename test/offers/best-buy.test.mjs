import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { load as parseYaml } from 'js-yaml';

import {
  BEST_BUY_API_ORIGIN,
  BEST_BUY_CREDENTIAL_SECRET,
  bestBuyAvailabilityRequest,
  bestBuyMappingsFromCatalog,
  bestBuyOpenBoxRequest,
  bestBuyProductRequest,
  classifyBestBuyFailure,
  createBestBuyAdapter,
  normalizeBestBuyOpenBox,
  normalizeBestBuyPickup,
  normalizeBestBuyProduct,
} from '../../src/lib/offers/adapters/best-buy.mjs';
import { lookupOffers } from '../../src/lib/offers/runtime.mjs';
import { evaluateSourcePolicy } from '../../src/lib/offers/source-policy.mjs';

const root = new URL('../../', import.meta.url);
const catalog = JSON.parse(readFileSync(new URL('src/generated/publishing/products.v1.json', root), 'utf8'));
const policy = parseYaml(readFileSync(new URL('content/source-policies/best-buy.yaml', root), 'utf8'));
const fixtures = JSON.parse(readFileSync(new URL('test/offers/fixtures/best-buy-contract.json', root), 'utf8'));
const now = new Date('2026-07-22T18:00:00.000Z');
const mappings = bestBuyMappingsFromCatalog(catalog);
const mapping = mappings.get('netgear-nighthawk-rs100-us-black');

test('canonical catalog supplies five exact reviewed Best Buy SKU mappings', () => {
  assert.equal(mappings.size, 5);
  assert.equal(mapping.merchantProductId, '6612969');
  assert.equal(mapping.destinationId, 'netgear-nighthawk-rs100-best-buy-us');
  assert.equal(mapping.directUrl.includes('?'), false);
});

test('request specifications use only fixed provider routes and defer the secret to a redacting server transport', () => {
  for (const spec of [bestBuyProductRequest('6612969'), bestBuyOpenBoxRequest('6612969'), bestBuyAvailabilityRequest('6612969', '55423')]) {
    assert.equal(spec.origin, BEST_BUY_API_ORIGIN);
    assert.equal(spec.credentialSecretName, BEST_BUY_CREDENTIAL_SECRET);
    assert.equal(JSON.stringify(spec).includes('apiKey'), false);
    assert.match(spec.pathname, /^\/(?:v1|beta)\/products\//);
  }
  assert.throws(() => bestBuyAvailabilityRequest('6612969', '../x'));
  assert.throws(() => bestBuyProductRequest('../6612969'));
});

test('new and pickup offers retain exact identity while discarding store address fields', () => {
  const online = normalizeBestBuyProduct(fixtures.product, mapping, policy, now);
  assert.equal(online.condition, 'new');
  assert.deepEqual(online.fulfillment, ['shipping']);
  assert.equal(online.expiresAt, '2026-07-22T18:15:00.000Z');
  const pickup = normalizeBestBuyPickup(fixtures.product, fixtures.stores, mapping, policy, now);
  assert.equal(pickup.length, 2);
  assert.equal(pickup[0].storeId, '281');
  assert.equal(pickup[1].availabilityState, 'limited');
  assert.doesNotMatch(JSON.stringify(pickup), /address|postalCode|REMOVED/);
});

test('open-box condition stays distinct and unsupported conditions fail closed', () => {
  const offers = normalizeBestBuyOpenBox(fixtures.openBox, mapping, policy, now);
  assert.equal(offers.length, 2);
  assert.ok(offers.every((offer) => offer.condition === 'open-box'));
  assert.deepEqual(normalizeBestBuyOpenBox(fixtures.emptyOpenBox, mapping, policy, now), []);
  assert.throws(() => normalizeBestBuyOpenBox(fixtures.malformedOpenBox, mapping, policy, now), /unsupported open-box condition/);
});

test('near SKU, model, bundle, market, condition, and missing price all fail closed', () => {
  for (const [fixture, pattern] of [
    [fixtures.nearSku, /near-match SKU/],
    [fixtures.wrongModel, /model mismatch/],
    [fixtures.wrongBundle, /bundle mismatch/],
    [fixtures.wrongMarket, /market mismatch/],
    [fixtures.wrongCondition, /condition mismatch/],
    [fixtures.missingPrice, /no usable price/],
  ]) assert.throws(() => normalizeBestBuyProduct(fixture, mapping, policy, now), pattern);
  const unknown = normalizeBestBuyProduct(fixtures.unknownAvailability, mapping, policy, now);
  assert.equal(unknown.availabilityState, 'unknown');
  assert.deepEqual(unknown.fulfillment, []);
});

test('adapter contract resolves real canonical products without embedding credentials', async () => {
  const seen = [];
  const adapter = createBestBuyAdapter({
    catalog,
    policy,
    now: () => now,
    executeRequest: async (spec) => {
      seen.push(spec);
      if (spec.pathname.endsWith('/stores.json')) return fixtures.stores;
      if (spec.pathname.endsWith('/openBox')) return fixtures.openBox;
      return fixtures.product;
    },
  });
  const offers = await adapter.lookup({ productId: mapping.canonicalProductId, zip: '55423', condition: 'new', fulfillment: 'pickup' });
  assert.equal(offers.length, 2);
  assert.ok(seen.every((spec) => !Object.hasOwn(spec.query, 'apiKey')));
});

test('authentication, quota, provider, mapping, and malformed failures remain source-specific', async () => {
  assert.equal(classifyBestBuyFailure({ code: 'BEST_BUY_AUTHENTICATION_FAILED' }), 'authentication-failed');
  assert.equal(classifyBestBuyFailure({ code: 'BEST_BUY_QUOTA_EXCEEDED' }), 'quota-limited');
  assert.equal(classifyBestBuyFailure({ status: 503 }), 'provider-outage');
  assert.equal(classifyBestBuyFailure(new Error('Best Buy returned a model mismatch.')), 'mapping-error');
  assert.equal(classifyBestBuyFailure(new Error('Best Buy response has no usable price.')), 'malformed-response');
  for (const [error, expected] of [
    [Object.assign(new Error('redacted authentication failure'), { code: 'BEST_BUY_AUTHENTICATION_FAILED' }), 'authentication-failed'],
    [Object.assign(new Error('redacted quota failure'), { code: 'BEST_BUY_QUOTA_EXCEEDED' }), 'quota-limited'],
    [Object.assign(new Error('redacted provider failure'), { status: 503 }), 'provider-outage'],
  ]) {
    const adapter = createBestBuyAdapter({ catalog, policy, now: () => now, executeRequest: async () => { throw error; } });
    await assert.rejects(() => adapter.lookup({ productId: mapping.canonicalProductId, condition: 'new' }));
    assert.equal(await adapter.health(), expected);
  }
});

test('Handoff 3 exclusion retires Best Buy before transport, quota, or cost use', async () => {
  assert.equal(evaluateSourcePolicy(policy, { databaseEnabled: true, killSwitchEnabled: true }, now), 'retired');
  let adapterCalls = 0;
  const response = await lookupOffers({
    query: { productId: mapping.canonicalProductId },
    catalog: [{ productId: mapping.canonicalProductId, status: 'published' }],
    adapters: [{ sourceId: 'best-buy', health: async () => 'healthy', lookup: async () => { adapterCalls += 1; return []; } }],
    policies: new Map([['best-buy', policy]]),
    runtimeBySource: { 'best-buy': { databaseEnabled: true, killSwitchEnabled: true } },
    controlResolver: async () => { throw new Error('controls must not be touched'); },
    mappingResolver: async () => { throw new Error('mappings must not be touched'); },
    now,
    mode: 'approved-sources',
  });
  assert.equal(adapterCalls, 0);
  assert.deepEqual(response.coverage, [{ sourceId: 'best-buy', status: 'retired' }]);
});
