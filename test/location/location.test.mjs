import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { compileLocationProfiles, validateDatasetArtifact } from '../../src/lib/location/compiler.mjs';
import { locationProjectionStatements } from '../../src/lib/location/projection.mjs';
import { createLocationWorker } from '../../workers/location/src/index.mjs';

function manifest(datasetId, bytes, publisher, vintage, accepted) {
  return {
    schemaVersion: '1.0.0', datasetId, publisher, datasetName: `${publisher} fixture extract`, vintage,
    retrievedAt: '2026-07-22', sourceUrl: publisher.includes('Census') ? 'https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2025.html' : 'https://www.huduser.gov/portal/dataset/uspszip-api.html',
    publicUseBasis: 'Official public-data fixture used only to verify the governed import contract.',
    fileSha256: createHash('sha256').update(bytes).digest('hex'), importScriptVersion: '1.0.0',
    rowCounts: { input: accepted, accepted, rejected: 0 }, validationResults: ['Fixture rows validated against import schemas.'],
  };
}
const censusBytes = Buffer.from('{"fixture":"census"}');
const hudBytes = Buffer.from('{"fixture":"hud"}');
const censusManifest = manifest('census-zcta-fixture', censusBytes, 'U.S. Census Bureau', '2025', 1);
const hudManifest = manifest('hud-usps-fixture', hudBytes, 'HUD USER USPS Crosswalk', '2026-Q1', 3);
const metros = [{ schemaVersion: '1.0.0', metroSlug: 'chicago', displayName: 'Chicago', cbsaCodes: ['16980'], geographicScope: 'The profile covers the Chicago-Naperville-Elgin core based statistical area and does not imply that every address, retailer, or ZIP has identical coverage.', shoppingContext: ['Retailer and inventory coverage varies across the metropolitan area; a supported ZIP lookup narrows context but never proves that a store has stock.', 'ZIP codes are delivery constructs, while this page uses statistical ZCTA and weighted HUD crosswalk relationships for regional context.'], supportedRetailers: [], supportedCategories: [], censusVintage: '2025', hudVintage: '2026-Q1', lastStaticUpdate: '2026-07-22', indexStatus: 'draft-noindex' }];

test('dataset manifests bind exact artifacts and reject digest drift', () => {
  assert.equal(validateDatasetArtifact(censusManifest, censusBytes).vintage, '2025');
  assert.throws(() => validateDatasetArtifact(censusManifest, Buffer.from('changed')), /digest mismatch/);
});

test('location compiler preserves weighted ambiguity and labels ZCTA approximation', () => {
  const compiled = compileLocationProfiles({
    censusManifest, hudManifest,
    zctaRows: [{ zcta: '60614', latitude: 41.9227, longitude: -87.6543 }],
    countyRows: [{ zip: '60614', countyFips: '17031', res_ratio: 0.99 }, { zip: '60614', countyFips: '17043', res_ratio: 0.01 }],
    cbsaRows: [{ zip: '60614', cbsa: '16980', res_ratio: 1 }], metroProfiles: metros,
  });
  assert.equal(compiled.profiles[0].primaryCountyFips, '17031');
  assert.equal(compiled.profiles[0].ambiguity.county, true);
  assert.equal(compiled.profiles[0].ambiguity.zctaApproximation, true);
  assert.equal(compiled.profiles[0].metroSlug, 'chicago');
  const prepared = [];
  const db = { prepare(sql) { prepared.push(sql); return { bind(...values) { return { sql, values }; } }; } };
  const statements = locationProjectionStatements(db, compiled, '2026-07-22T18:00:00.000Z');
  assert.equal(statements.length, 9);
  assert.ok(prepared.every((sql) => !/60614|16980/.test(sql)));
  assert.ok(statements.some(({ values }) => values.includes('60614')));
  assert.equal(prepared.filter((sql) => /DELETE FROM (?:zip_location_crosswalk|location_profiles|metro_profiles)/.test(sql)).length, 3);
  assert.ok(prepared.every((sql) => !sql.includes(censusManifest.fileSha256)));
  const withoutMetros = locationProjectionStatements(db, { ...compiled, metroProfiles: [] }, '2026-07-22T18:00:00.000Z');
  const originalRelease = statements.find(({ sql }) => /INSERT INTO metro_profiles/.test(sql)).values.at(-1);
  const changedRelease = withoutMetros.find(({ sql }) => /INSERT INTO location_profiles/.test(sql)).values.at(-1);
  assert.notEqual(changedRelease, originalRelease);
});

test('location Worker creates only a hashed coarse expiring session and marks results noindex', async () => {
  const calls = [];
  const database = {
    prepare(sql) {
      return {
        bind(...values) { this.values = values; return this; },
        async first() {
          if (/INSERT INTO abuse_buckets/.test(sql)) return { requestCount: 1 };
          return { zip: '60614', zcta: '60614', latitude: 41.9227, longitude: -87.6543, primaryCountyFips: '17031', countyWeightsJson: '[{"countyFips":"17031","weight":1}]', cbsaWeightsJson: '[{"cbsa":"16980","weight":1,"metroSlug":"chicago"}]', primaryCbsa: '16980', metroSlug: 'chicago', censusVintage: '2025', hudVintage: '2026-Q1' };
        },
        async run() { calls.push({ sql, values: this.values }); return { success: true }; },
      };
    },
  };
  const token = '11111111-1111-4111-8111-111111111111';
  const worker = createLocationWorker({ now: () => new Date('2026-07-22T18:00:00.000Z'), randomUUID: () => token });
  const requestHeaders = { origin: 'https://howbiscuit.com', 'cf-connecting-ip': '203.0.113.9' };
  const environment = { DB: database, LOCATION_LOOKUP_ENABLED: 'true', ABUSE_HASH_KEY: 'fixture-abuse-key-that-is-at-least-32-bytes' };
  const response = await worker.fetch(new Request('https://location.invalid/api/v1/location/resolve?zip=60614', { headers: requestHeaders }), environment);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
  const body = await response.json();
  assert.equal(body.sessionToken, token);
  assert.equal(body.ambiguity.zctaApproximation, true);
  assert.notEqual(calls[0].values[0], token);
  assert.match(calls[0].values[0], /^[0-9a-f]{64}$/);
  assert.equal(calls[0].values[1], 'chicago');
  assert.equal(calls[0].values.some((value) => value === '60614'), false);
  assert.equal(calls.some(({ values }) => values.includes('203.0.113.9')), false);
  const invalid = await worker.fetch(new Request('https://location.invalid/api/v1/location/resolve?zip=60614&address=123+Main', { headers: requestHeaders }), environment);
  assert.equal(invalid.status, 400);
  const noOrigin = await worker.fetch(new Request('https://location.invalid/api/v1/location/resolve?zip=60614', { headers: { 'cf-connecting-ip': '203.0.113.9' } }), environment);
  assert.equal(noOrigin.status, 403);
  const noAbuseSecret = await worker.fetch(new Request('https://location.invalid/api/v1/location/resolve?zip=60614', { headers: requestHeaders }), { DB: database, LOCATION_LOOKUP_ENABLED: 'true' });
  assert.equal(noAbuseSecret.status, 503);
});
