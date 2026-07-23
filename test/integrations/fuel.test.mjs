import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { load as parseYaml } from 'js-yaml';

import { compileEiaRegionalTrends, eiaImportSchema, renderEiaRegionalTrendSvg } from '../../src/lib/fuel/eia.mjs';
import { GOOGLE_PLACES_CREDENTIAL_SECRET, GOOGLE_PLACES_ORIGIN, classifyGoogleFuelFailure, googlePlaceFuelRequest, normalizeGoogleFuelResponse } from '../../src/lib/fuel/google-places.mjs';
import { evaluateSourcePolicy } from '../../src/lib/offers/source-policy.mjs';
import { createGasWorker } from '../../workers/gas/src/index.mjs';

const root = new URL('../../', import.meta.url);
const googlePolicy = parseYaml(readFileSync(new URL('content/source-policies/google-places-fuel.yaml', root), 'utf8'));
const eiaPolicy = parseYaml(readFileSync(new URL('content/source-policies/eia-weekly-gasoline.yaml', root), 'utf8'));
const googleFixture = JSON.parse(readFileSync(new URL('test/integrations/fixtures/google-fuel.json', root), 'utf8'));
const eiaFixture = JSON.parse(readFileSync(new URL('data/eia/weekly-regular-gasoline-2026-07-20.json', root), 'utf8'));
const generatedEia = JSON.parse(readFileSync(new URL('src/generated/fuel/eia-regional-trends.v1.json', root), 'utf8'));
const generatedSvg = readFileSync(new URL('src/generated/fuel/eia-regional-trends.v1.svg', root), 'utf8');
const now = new Date('2026-07-22T19:00:00.000Z');
const actionToken = 'a'.repeat(48);

function controls(usage = {}) {
  return {
    usage: { monthlyCostUsd: 0, monthlyRequests: 0, dailyRequests: 0, currentSecondRequests: 0, projectedRequestCostUsd: 0.01, ...usage },
    circuit: { consecutiveFailures: 0, circuitOpenUntil: null },
    reserve: async () => true,
    recordSuccess: async () => true,
    recordFailure: async () => true,
  };
}

function activeGooglePolicy(overrides = {}) {
  return {
    ...googlePolicy,
    publicActivationApproved: true,
    limits: { ...googlePolicy.limits, paidMonthlyCeilingUsd: 1, ...overrides.limits },
  };
}

function worker(activePolicy, overrides = {}) {
  let calls = 0;
  const instance = createGasWorker({
    googlePolicy: activePolicy,
    databaseState: () => ({ enabled: true }),
    executeGoogleRequest: async (spec) => { calls += 1; assert.equal(spec.origin, GOOGLE_PLACES_ORIGIN); return googleFixture; },
    controlResolver: async () => controls(overrides.usage),
    verifyActionToken: async (token) => token === actionToken,
    now: () => now,
    ...overrides.dependencies,
  });
  return { instance, calls: () => calls };
}

function request(method = 'POST', body = { placeId: googleFixture.id, actionToken }) {
  return new Request('https://fuel.invalid/api/v1/fuel/google-place', {
    method,
    headers: { origin: 'https://howbiscuit.com', 'content-type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
}

test('Google request uses one exact Place Details field mask and defers the API key to a redacting transport', () => {
  const spec = googlePlaceFuelRequest(googleFixture.id);
  assert.equal(spec.origin, GOOGLE_PLACES_ORIGIN);
  assert.equal(spec.pathname, `/v1/places/${googleFixture.id}`);
  assert.equal(spec.headers['X-Goog-FieldMask'], 'id,displayName,googleMapsUri,fuelOptions,attributions');
  assert.equal(spec.credentialSecretName, GOOGLE_PLACES_CREDENTIAL_SECRET);
  assert.equal(JSON.stringify(spec).includes('formattedAddress'), false);
  assert.throws(() => googlePlaceFuelRequest('../bad'));
});

test('Google fuel normalization is ephemeral, attributed, exact-place, and strips address and coordinates', () => {
  const result = normalizeGoogleFuelResponse(googleFixture, googleFixture.id, now);
  assert.equal(result.retention, 'ephemeral-response-only');
  assert.equal(result.attribution.provider, 'Google Maps');
  assert.equal(result.prices.length, 2);
  assert.equal(result.prices[0].price.amount, 3.899);
  assert.doesNotMatch(JSON.stringify(result), /formattedAddress|latitude|longitude|REMOVED/);
  assert.throws(() => normalizeGoogleFuelResponse({ ...googleFixture, id: 'ChIJOtherStation9' }, googleFixture.id, now), /place mismatch/);
  const stale = structuredClone(googleFixture);
  stale.fuelOptions.fuelPrices[0].updateTime = '2026-07-01T00:00:00Z';
  assert.equal(normalizeGoogleFuelResponse(stale, googleFixture.id, now).prices.length, 1);
});

test('ordinary GET, invalid action proof, and current production-disabled policy make zero Google calls', async () => {
  const active = worker(activeGooglePolicy());
  const getResponse = await active.instance.fetch(request('GET'), { GLOBAL_OFFERS_ENABLED: 'true', GOOGLE_FUEL_ENABLED: 'true' });
  assert.equal(getResponse.status, 405);
  const invalidAction = await active.instance.fetch(request('POST', { placeId: googleFixture.id, actionToken: 'x'.repeat(48) }), { GLOBAL_OFFERS_ENABLED: 'true', GOOGLE_FUEL_ENABLED: 'true' });
  assert.equal(invalidAction.status, 403);
  assert.equal(active.calls(), 0);

  const disabled = worker(googlePolicy);
  const disabledResponse = await disabled.instance.fetch(request(), { GLOBAL_OFFERS_ENABLED: 'true', GOOGLE_FUEL_ENABLED: 'true' });
  assert.equal(disabledResponse.status, 503);
  assert.equal(disabled.calls(), 0);
  assert.equal(evaluateSourcePolicy(googlePolicy, { databaseEnabled: true, killSwitchEnabled: true }, now), 'policy-disabled');
});

test('explicit action returns no-store attributed fuel data and one bounded provider call', async () => {
  const active = worker(activeGooglePolicy());
  const result = await active.instance.fetch(request(), { GLOBAL_OFFERS_ENABLED: 'true', GOOGLE_FUEL_ENABLED: 'true' });
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(result.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
  assert.equal(result.headers.get('access-control-allow-origin'), 'https://howbiscuit.com');
  const body = await result.json();
  assert.equal(body.attribution.provider, 'Google Maps');
  assert.equal(body.retention, 'ephemeral-response-only');
  assert.equal(active.calls(), 1);
});

test('paid budget exhaustion disables Google before action reservation or provider execution', async () => {
  let reserveCalls = 0;
  let providerCalls = 0;
  const active = createGasWorker({
    googlePolicy: activeGooglePolicy({ limits: { paidMonthlyCeilingUsd: 0.02 } }),
    databaseState: () => ({ enabled: true }),
    verifyActionToken: async () => true,
    controlResolver: async () => ({ ...controls({ monthlyCostUsd: 0.02, projectedRequestCostUsd: 0.01 }), reserve: async () => { reserveCalls += 1; return true; } }),
    executeGoogleRequest: async () => { providerCalls += 1; return googleFixture; },
    now: () => now,
  });
  const response = await active.fetch(request(), { GLOBAL_OFFERS_ENABLED: 'true', GOOGLE_FUEL_ENABLED: 'true' });
  assert.equal(response.status, 429);
  assert.equal((await response.json()).sourceStatus, 'budget-exhausted');
  assert.equal(reserveCalls, 0);
  assert.equal(providerCalls, 0);
});

test('Google failure classes preserve authentication, quota, provider, mapping, and malformed states', () => {
  assert.equal(classifyGoogleFuelFailure({ status: 401 }), 'authentication-failed');
  assert.equal(classifyGoogleFuelFailure({ code: 'GOOGLE_BUDGET_EXHAUSTED' }), 'budget-exhausted');
  assert.equal(classifyGoogleFuelFailure({ status: 429 }), 'quota-limited');
  assert.equal(classifyGoogleFuelFailure({ status: 503 }), 'provider-outage');
  assert.equal(classifyGoogleFuelFailure(new Error('Google Places returned a place mismatch.')), 'mapping-error');
  assert.equal(classifyGoogleFuelFailure(new Error('Google Places fuel response is malformed.')), 'malformed-response');
});

test('EIA import produces three aggregate series and an accessible chart without station claims', () => {
  assert.doesNotThrow(() => eiaImportSchema.parse(eiaFixture));
  const compiled = compileEiaRegionalTrends(eiaFixture);
  assert.deepEqual(compiled, generatedEia);
  assert.equal(compiled.series.length, 3);
  assert.equal(compiled.series.find((series) => series.seriesId === 'chicago').values.at(-1).value, 4.032);
  assert.match(compiled.disclosure, /not station prices/);
  assert.doesNotMatch(JSON.stringify(compiled), /"(?:stationId|placeId|address|availability)"\s*:/);
  const svg = renderEiaRegionalTrendSvg(eiaFixture);
  assert.equal(svg, generatedSvg);
  assert.match(svg, /role="img" aria-labelledby="eia-title eia-desc"/);
  assert.match(svg, /EIA aggregate benchmarks — not station prices/);
});

test('EIA importer rejects duplicate periods, missing aggregates, and station-like scope', () => {
  const duplicate = structuredClone(eiaFixture);
  duplicate.series[0].values[1].period = duplicate.series[0].values[0].period;
  assert.throws(() => compileEiaRegionalTrends(duplicate), /periods must increase/);
  const missing = structuredClone(eiaFixture);
  missing.series.pop();
  assert.throws(() => compileEiaRegionalTrends(missing));
  const station = structuredClone(eiaFixture);
  station.series[0].scope = 'station-price';
  assert.throws(() => compileEiaRegionalTrends(station));
  assert.equal(eiaPolicy.publicActivationApproved, false);
});
