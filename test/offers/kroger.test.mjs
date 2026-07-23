import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { load as parseYaml } from 'js-yaml';

import {
  KROGER_API_ORIGIN,
  KROGER_CREDENTIAL_SECRETS,
  KROGER_SELECTED_STORE_ID,
  classifyKrogerFailure,
  createKrogerAdapter,
  krogerCoverageDisclosure,
  krogerLocationSearchRequest,
  krogerMappingsFromCatalog,
  krogerProductRequest,
  krogerTokenRequest,
  normalizeKrogerAisles,
  normalizeKrogerLocations,
  normalizeKrogerProduct,
  selectKrogerStore,
} from '../../src/lib/offers/adapters/kroger.mjs';
import { lookupOffers } from '../../src/lib/offers/runtime.mjs';
import { evaluateSourcePolicy } from '../../src/lib/offers/source-policy.mjs';

const root = new URL('../../', import.meta.url);
const catalog = JSON.parse(readFileSync(new URL('src/generated/publishing/products.v1.json', root), 'utf8'));
const policy = parseYaml(readFileSync(new URL('content/source-policies/kroger.yaml', root), 'utf8'));
const fixtures = JSON.parse(readFileSync(new URL('test/offers/fixtures/kroger-contract.json', root), 'utf8'));
const now = new Date('2026-07-22T19:30:00.000Z');
const mappings = krogerMappingsFromCatalog(catalog);
const cocaCola = mappings.get('coca-cola-original-12-pack-12-fl-oz-cans-us');
const kraft = mappings.get('kraft-original-mac-cheese-7-25-oz-box-us');
const stores = normalizeKrogerLocations(fixtures.locations);
const selectedStore = selectKrogerStore(stores, KROGER_SELECTED_STORE_ID, 'MARIANOS');

function clone(value) {
  return structuredClone(value);
}

function controls(overrides = {}) {
  return {
    usage: {
      monthlyCostUsd: 0,
      monthlyRequests: 0,
      dailyRequests: 0,
      currentSecondRequests: 0,
      projectedRequestCostUsd: 0,
      ...overrides.usage,
    },
    circuit: { consecutiveFailures: 0, circuitOpenUntil: null },
    reserve: async () => true,
    recordSuccess: async () => true,
    recordFailure: async () => true,
  };
}

test('canonical catalog supplies two exact reviewed Kroger product mappings', () => {
  assert.equal(mappings.size, 2);
  assert.equal(cocaCola.merchantProductId, '0004900002890');
  assert.equal(kraft.merchantProductId, '0002100065883');
  assert.equal(cocaCola.directUrl.includes('?'), false);
  assert.equal(cocaCola.matchConfidence, 'exact-retailer-sku');
});

test('request specifications use fixed Kroger endpoints and keep both OAuth secrets in the server transport', () => {
  for (const spec of [krogerTokenRequest(), krogerLocationSearchRequest('60614'), krogerProductRequest(cocaCola.merchantProductId, KROGER_SELECTED_STORE_ID)]) {
    assert.equal(spec.origin, KROGER_API_ORIGIN);
    assert.deepEqual(spec.credentialSecretNames, KROGER_CREDENTIAL_SECRETS);
    assert.match(spec.pathname, /^\/v1\/(?:connect\/oauth2\/token|locations|products\/\d{13})$/);
    assert.doesNotMatch(JSON.stringify(spec), /client-secret-value|bearer-value/);
  }
  assert.throws(() => krogerLocationSearchRequest('../x'));
  assert.throws(() => krogerLocationSearchRequest('60614', 51));
  assert.throws(() => krogerProductRequest('../x', KROGER_SELECTED_STORE_ID));
  assert.throws(() => krogerProductRequest(cocaCola.merchantProductId, '../x'));
});

test('store lookup discards address and coordinates and requires exact selected-store identity', () => {
  assert.equal(stores.length, 2);
  assert.equal(selectedStore.storeId, KROGER_SELECTED_STORE_ID);
  assert.equal(selectedStore.pickupSupported, true);
  assert.doesNotMatch(JSON.stringify(stores), /address|zipCode|latitude|longitude|REMOVED/);
  assert.equal(selectKrogerStore(stores, '53100999', 'MARIANOS'), null);
  assert.throws(() => selectKrogerStore(stores, KROGER_SELECTED_STORE_ID, 'KROGER'), /banner/);
  const disclosure = krogerCoverageDisclosure({ requestedZip: '60614', stores, selectedStore });
  assert.equal(disclosure.coverage, 'selected-store-only');
  assert.equal(disclosure.selectedStoreId, KROGER_SELECTED_STORE_ID);
  assert.match(disclosure.disclosure, /limited to selected store/);
});

test('selected store banner comparison tolerates official apostrophe typography only', () => {
  const stores = [{
    storeId: KROGER_SELECTED_STORE_ID,
    name: "Mariano's Bucktown",
    chain: "MARIANO'S",
    pickupSupported: true,
  }];
  assert.equal(selectKrogerStore(stores, KROGER_SELECTED_STORE_ID, 'MARIANOS')?.storeId, KROGER_SELECTED_STORE_ID);
  assert.throws(
    () => selectKrogerStore(stores, KROGER_SELECTED_STORE_ID, 'KROGER'),
    /banner does not match/,
  );
});

test('store-specific price, fulfillment, availability, and aisle output retain exact identity', () => {
  const offer = normalizeKrogerProduct(fixtures.cocaCola, cocaCola, selectedStore, policy, now);
  assert.equal(offer.storeId, KROGER_SELECTED_STORE_ID);
  assert.equal(offer.merchantProductId, cocaCola.merchantProductId);
  assert.equal(offer.price.amount, 9.99);
  assert.deepEqual(offer.fulfillment, ['pickup']);
  assert.equal(offer.pickupVerified, true);
  assert.equal(offer.availabilityState, 'limited');
  assert.equal(offer.expiresAt, '2026-07-22T19:35:00.000Z');
  assert.match(offer.displayRestrictions.join(' '), /Aisle: 5/);
  assert.doesNotMatch(JSON.stringify(offer), /bayNumber|side|numberOfFacings|REMOVED/);
  const kraftOffer = normalizeKrogerProduct(fixtures.kraft, kraft, selectedStore, policy, now);
  assert.deepEqual(kraftOffer.fulfillment, ['pickup', 'delivery']);
  assert.equal(kraftOffer.availabilityState, 'unknown');
});

test('near identifiers, brand, model, pack count, unit size, and malformed prices fail closed', () => {
  const cases = [];
  const wrongId = clone(fixtures.cocaCola); wrongId.data.productId = '0004900002891'; cases.push([wrongId, /near-match/]);
  const wrongUpc = clone(fixtures.cocaCola); wrongUpc.data.upc = '0004900002891'; cases.push([wrongUpc, /near-match/]);
  const wrongBrand = clone(fixtures.cocaCola); wrongBrand.data.brand = 'Other'; cases.push([wrongBrand, /brand mismatch/]);
  const wrongModel = clone(fixtures.cocaCola); wrongModel.data.description = 'Coca-Cola Zero Sugar Soda Cans'; cases.push([wrongModel, /model mismatch/]);
  const wrongPack = clone(fixtures.cocaCola); wrongPack.data.items[0].size = '6 pk / 12 fl oz'; cases.push([wrongPack, /pack-count mismatch/]);
  const wrongUnit = clone(fixtures.cocaCola); wrongUnit.data.items[0].size = '12 pk / 7.5 fl oz'; cases.push([wrongUnit, /unit-size mismatch/]);
  const missingPrice = clone(fixtures.cocaCola); missingPrice.data.items[0].price.regular = null; cases.push([missingPrice, /no usable price/]);
  const invalidPromo = clone(fixtures.cocaCola); invalidPromo.data.items[0].price.promo = 12.99; cases.push([invalidPromo, /invalid promotional price/]);
  for (const [fixture, pattern] of cases) assert.throws(() => normalizeKrogerProduct(fixture, cocaCola, selectedStore, policy, now), pattern);
  assert.throws(() => normalizeKrogerAisles([{ description: '<script>', number: '5' }]), /malformed/);
});

test('adapter selects one governed store and discloses when that store is not covered', async () => {
  const seen = [];
  const adapter = createKrogerAdapter({
    catalog,
    policy,
    now: () => now,
    executeRequest: async (spec) => {
      seen.push(spec);
      return spec.pathname === '/v1/locations' ? fixtures.locations : fixtures.cocaCola;
    },
  });
  const offers = await adapter.lookup({ productId: cocaCola.canonicalProductId, zip: '60614', radiusMiles: 10, condition: 'new', fulfillment: 'pickup' });
  assert.equal(offers.length, 1);
  assert.equal(offers[0].storeId, KROGER_SELECTED_STORE_ID);
  assert.equal(seen.length, 2);
  assert.equal((await adapter.coverage()).coverage, 'selected-store-only');

  let notCoveredCalls = 0;
  const notCovered = createKrogerAdapter({
    catalog,
    policy,
    executeRequest: async () => { notCoveredCalls += 1; return fixtures.locationsWithoutSelectedStore; },
  });
  assert.deepEqual(await notCovered.lookup({ productId: cocaCola.canonicalProductId, zip: '60614', condition: 'new' }), []);
  assert.equal(notCoveredCalls, 1);
  assert.equal((await notCovered.coverage()).coverage, 'selected-store-not-returned');

  let noZipCalls = 0;
  const noZip = createKrogerAdapter({ catalog, policy, executeRequest: async () => { noZipCalls += 1; } });
  assert.deepEqual(await noZip.lookup({ productId: cocaCola.canonicalProductId, condition: 'new' }), []);
  assert.equal(noZipCalls, 0);
  assert.equal((await noZip.coverage()).coverage, 'zip-required');
});

test('authentication, quota, provider, mapping, and malformed failures remain source-specific', async () => {
  assert.equal(classifyKrogerFailure({ code: 'KROGER_AUTHENTICATION_FAILED' }), 'authentication-failed');
  assert.equal(classifyKrogerFailure({ status: 429 }), 'quota-limited');
  assert.equal(classifyKrogerFailure({ status: 503 }), 'provider-outage');
  assert.equal(classifyKrogerFailure(new Error('Kroger returned a pack-count mismatch.')), 'mapping-error');
  assert.equal(classifyKrogerFailure(new Error('Kroger response has no usable price.')), 'malformed-response');
});

test('quota exhaustion is graceful and prevents store or product calls', async () => {
  const activePolicy = {
    ...policy,
    publicActivationApproved: true,
    review: { ...policy.review, comparisonStatus: 'approved' },
  };
  let adapterCalls = 0;
  const response = await lookupOffers({
    query: { productId: cocaCola.canonicalProductId, zip: '60614' },
    catalog: [{ productId: cocaCola.canonicalProductId, status: 'published' }],
    adapters: [{ sourceId: 'kroger', health: async () => 'healthy', lookup: async () => { adapterCalls += 1; return []; } }],
    policies: new Map([['kroger', activePolicy]]),
    runtimeBySource: { kroger: { databaseEnabled: true, killSwitchEnabled: true } },
    controlResolver: async () => controls({ usage: { dailyRequests: policy.limits.applicationDailyBudget } }),
    mappingResolver: async () => { throw new Error('mapping must not be touched'); },
    now,
    mode: 'approved-sources',
  });
  assert.equal(adapterCalls, 0);
  assert.deepEqual(response.coverage, [{ sourceId: 'kroger', status: 'quota-limited' }]);
  assert.deepEqual(response.offers, []);
});

test('current review state disables Kroger before controls, token exchange, or provider cost', async () => {
  assert.equal(evaluateSourcePolicy(policy, { databaseEnabled: true, killSwitchEnabled: true }, now), 'policy-disabled');
  let adapterCalls = 0;
  const response = await lookupOffers({
    query: { productId: cocaCola.canonicalProductId, zip: '60614' },
    catalog: [{ productId: cocaCola.canonicalProductId, status: 'published' }],
    adapters: [{ sourceId: 'kroger', health: async () => 'healthy', lookup: async () => { adapterCalls += 1; return []; } }],
    policies: new Map([['kroger', policy]]),
    runtimeBySource: { kroger: { databaseEnabled: true, killSwitchEnabled: true } },
    controlResolver: async () => { throw new Error('controls must not be touched'); },
    mappingResolver: async () => { throw new Error('mappings must not be touched'); },
    now,
    mode: 'approved-sources',
  });
  assert.equal(adapterCalls, 0);
  assert.deepEqual(response.coverage, [{ sourceId: 'kroger', status: 'policy-disabled' }]);
});
