import assert from 'node:assert/strict';
import test from 'node:test';

import {
  handleTaxCoverageRequest,
  handleTaxLocationRequest,
  lookupD1PublicRates,
  lookupFreeTaxRates,
  visitorLocationFromRequest,
} from '../src/lib/free-tax-data.mjs';
import { publicCoverageSummary } from '../src/lib/tax-source-registry.mjs';

const publicFetch = async (request) => {
  const url = new URL(request.url);
  if (url.hostname === 'api.zippopotam.us') {
    return new Response(JSON.stringify({
      places: [{ 'place name': 'New York City', 'state abbreviation': 'NY' }],
    }), { status: 200 });
  }
  if (url.pathname.endsWith('/ebcc-3d5i.json')) {
    return new Response(JSON.stringify([
      {
        locationabbr: 'NY',
        measuredesc: 'Cigarette',
        provisiondesc: 'Cigarette Tax ($ per pack)',
        provisionvalue: '5.35',
        effective_date: '9/1/2023',
        citation: 'N.Y. Tax Law § 471',
      },
      {
        locationabbr: 'NY',
        measuredesc: 'Cigarette',
        provisiondesc: 'Cigarette Tax ($ per pack)',
        provisionvalue: '4.35',
        effective_date: '7/1/2010',
      },
    ]), { status: 200 });
  }
  if (url.pathname.endsWith('/kwbr-syv2.json')) {
    return new Response(JSON.stringify([
      {
        locationabbr: 'NY',
        measuredesc: 'E-Cigarette',
        provisiondesc: 'Percent Value',
        provisionvalue: '20',
        datatype: 'Number',
        effective_date: '12/1/2019',
        citation: 'N.Y. Tax Law § 1181',
      },
    ]), { status: 200 });
  }
  return new Response('{}', { status: 404 });
};

const mockD1 = () => ({
  prepare(sql) {
    return {
      bind() {
        return {
          async all() {
            if (sql.includes('FROM tax_locations')) {
              return { results: [{
                location_id: 'nyc-10001',
                state_code: 'NY',
                city_name: 'New York',
                county_name: 'New York',
                record_type: 'Z',
                confidence: 'official-zip5',
                source_revision: 'NY-2026-Q3',
              }] };
            }
            if (sql.includes('FROM tax_components')) {
              return { results: [
                { component_id: 'state', jurisdiction_type: 'state', jurisdiction_name: 'New York State', rate_percent: 4, source_id: 'sst-rates' },
                { component_id: 'city', jurisdiction_type: 'city', jurisdiction_name: 'New York City', rate_percent: 4.5, source_id: 'state-tax-agencies' },
              ] };
            }
            return { results: [] };
          },
        };
      },
    };
  },
});

test('coverage registry includes every state and DC without a required data-provider key', () => {
  const coverage = publicCoverageSummary();
  assert.equal(coverage.jurisdictionCount, 51);
  assert.equal(coverage.sstFullMemberCount, 23);
  assert.deepEqual(coverage.accountRequirements.required, []);
  assert.ok(coverage.sources.every((source) => source.keyRequired === false));
});

test('D1 lookup returns versioned, itemized public rates', async () => {
  const candidates = await lookupD1PublicRates(mockD1(), '10001', 'general', '2026-07-13');
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].confidence, 'official-zip5');
  assert.equal(candidates[0].totalRate, 8.5);
  assert.deepEqual(candidates[0].components.map(({ id, rate }) => [id, rate]), [
    ['state', 4],
    ['city', 4.5],
  ]);
});

test('free cigarette lookup adds the current official state excise without an API key', async () => {
  const result = await lookupFreeTaxRates({
    postalCode: '10001',
    address: '',
    product: 'cigarettes',
    fetchImpl: publicFetch,
    now: Date.parse('2026-07-13T00:00:00Z'),
  });
  assert.equal(result.provider, 'public-data');
  assert.equal(result.candidates[0].unitTaxes[0].amount, 5.35);
  assert.equal(result.candidates[0].unitTaxes[0].unit, 'packs of 20');
  assert.equal(result.candidates[0].components.length, 0);
  assert.match(result.warnings[0], /local excise/i);
});

test('free vaping lookup exposes the official formula without pretending it is a retail percentage', async () => {
  const result = await lookupFreeTaxRates({
    postalCode: '10001',
    address: '',
    product: 'nicotine',
    fetchImpl: publicFetch,
    now: Date.parse('2026-07-13T00:00:00Z'),
  });
  assert.equal(result.candidates[0].components.length, 0);
  assert.equal(result.candidates[0].rules[0].label, 'Percent Value');
  assert.equal(result.candidates[0].rules[0].value, '20');
  assert.match(result.warnings[0], /not converted/i);
});

test('coverage endpoint reports when D1 has not been bound yet', async () => {
  const response = await handleTaxCoverageRequest(new Request('https://howbiscuit.com/api/tax-data/coverage'));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.runtime.database, 'not-bound');
  assert.equal(body.jurisdictionCount, 51);
});

test('visitor area uses Cloudflare request metadata without a third-party IP API', async () => {
  const request = new Request('https://howbiscuit.com/api/tax-data/locate');
  Object.defineProperty(request, 'cf', {
    value: { postalCode: '10001', regionCode: 'NY', city: 'New York' },
  });
  assert.deepEqual(visitorLocationFromRequest(request), {
    postalCode: '10001',
    state: 'NY',
    city: 'New York',
    approximate: true,
  });
  const response = await handleTaxLocationRequest(request);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal((await response.json()).location.postalCode, '10001');
});
