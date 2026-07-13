import assert from 'node:assert/strict';
import test from 'node:test';

import {
  handleTaxRateRequest,
  normalizeZiptaxAddressResponse,
  normalizeZiptaxPostalResponse,
} from '../src/lib/tax-data-gateway.mjs';

const addressPayload = {
  metadata: { response: { code: 100, name: 'RESPONSE_CODE_SUCCESS' } },
  baseRates: [
    { jurType: 'US_STATE_SALES_TAX', jurName: 'NY', rate: 0.04 },
    { jurType: 'US_STATE_USE_TAX', jurName: 'NY', rate: 0.04 },
    { jurType: 'US_COUNTY_SALES_TAX', jurName: 'NEW YORK', rate: 0 },
    { jurType: 'US_CITY_SALES_TAX', jurName: 'NEW YORK', rate: 0.045 },
    { jurType: 'US_SPECIAL_DISTRICT_SALES_TAX', jurName: 'MCTD', rate: 0.00375 },
  ],
  taxSummaries: [
    { taxType: 'SALES_TAX', rate: 0.08875 },
    { taxType: 'USE_TAX', rate: 0.08875 },
  ],
  addressDetail: {
    normalizedAddress: '20 W 34th St, New York, NY 10001-3002, United States',
  },
};

const postalPayload = {
  results: [
    {
      geoCity: 'Centennial',
      geoCounty: 'Arapahoe',
      geoState: 'CO',
      geoPostalCode: '80112',
      rateState: 0.029,
      rateCounty: 0.0025,
      rateCity: 0.025,
      rateAdditional: 0.011,
      taxSales: 0.0675,
    },
    {
      geoCity: 'Greenwood Village',
      geoCounty: 'Arapahoe',
      geoState: 'CO',
      geoPostalCode: '80112',
      rateState: 0.029,
      rateCounty: 0.0025,
      rateCity: 0.03,
      rateAdditional: 0.011,
      taxSales: 0.0725,
    },
  ],
};

const exactRequest = (product = 'general') => new Request('https://howbiscuit.com/api/tax-rates', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ postalCode: '10001', address: '20 W 34th St', product }),
});

const memoryCache = () => {
  const values = new Map();
  return {
    default: {
      async match(request) {
        const response = values.get(request.url);
        return response?.clone() ?? null;
      },
      async put(request, response) {
        values.set(request.url, response.clone());
      },
    },
  };
};

test('normalizes exact address rates without duplicating use tax', () => {
  const result = normalizeZiptaxAddressResponse(addressPayload);
  assert.equal(result.exact, true);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].state, 'NY');
  assert.equal(result.candidates[0].city, 'New York');
  assert.equal(result.candidates[0].postalCode, '10001');
  assert.equal(result.candidates[0].totalRate, 8.875);
  assert.deepEqual(result.candidates[0].components.map(({ id, rate }) => [id, rate]), [
    ['state', 4],
    ['city', 4.5],
    ['district', 0.375],
  ]);
});

test('uses product rate rules so the displayed total equals the calculated components', () => {
  const productPayload = structuredClone(addressPayload);
  productPayload.baseRates[0].jurTaxCode = '36';
  productPayload.baseRates[3].jurTaxCode = '51000';
  productPayload.baseRates[4].jurTaxCode = 'MCTD';
  productPayload.productDetail = {
    id: '40030',
    rateRules: [
      { jurTaxCode: '36', effectiveTaxRate: 0, percentTaxable: 0 },
      { jurTaxCode: '51000', effectiveTaxRate: 0, percentTaxable: 0 },
      { jurTaxCode: 'MCTD', effectiveTaxRate: 0, percentTaxable: 0 },
    ],
  };
  const result = normalizeZiptaxAddressResponse(productPayload);
  const componentTotal = result.candidates[0].components.reduce((sum, item) => sum + item.rate, 0);
  assert.equal(componentTotal, 0);
  assert.equal(result.candidates[0].totalRate, componentTotal);
});

test('keeps every jurisdiction returned for an ambiguous ZIP code', () => {
  const result = normalizeZiptaxPostalResponse(postalPayload);
  assert.equal(result.exact, false);
  assert.equal(result.ambiguous, true);
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(result.candidates.map(({ city, totalRate }) => [city, totalRate]), [
    ['Centennial', 6.75],
    ['Greenwood Village', 7.25],
  ]);
});

test('rejects an invalid ZIP before calling a provider', async () => {
  let called = false;
  const response = await handleTaxRateRequest(
    new Request('https://howbiscuit.com/api/tax-rates?postalCode=abc'),
    {},
    {},
    { fetch: async () => { called = true; } },
  );
  assert.equal(response.status, 400);
  assert.equal(called, false);
  assert.match((await response.json()).error, /five-digit/i);
});

test('rejects unknown product codes before they can create cache variants', async () => {
  const response = await handleTaxRateRequest(
    new Request('https://howbiscuit.com/api/tax-rates?postalCode=10001&product=made-up'),
    {},
    {},
    { fetch: async () => { throw new Error('should not fetch'); } },
  );
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'Choose a supported product type.');
});

test('falls back to a state base rate when no provider key is configured', async () => {
  const response = await handleTaxRateRequest(
    new Request('https://howbiscuit.com/api/tax-rates?postalCode=10001'),
    {},
    {},
    {
      fetch: async () => new Response(JSON.stringify({
        places: [{
          'place name': 'New York City',
          'state abbreviation': 'NY',
          state: 'New York',
        }],
      }), { status: 200 }),
    },
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.provider, 'public-data');
  assert.equal(body.exact, false);
  assert.equal(body.candidates[0].components[0].rate, 4);
  assert.match(body.warnings[0], /local/i);
});

test('sends a configured key only in the provider request header', async () => {
  let providerRequest;
  const response = await handleTaxRateRequest(
    new Request('https://howbiscuit.com/api/tax-rates?postalCode=80112'),
    { TAX_ALLOW_PAID_FALLBACK: 'true', ZIPTAX_API_KEY: 'server-only-secret' },
    {},
    {
      fetch: async (request) => {
        providerRequest = request;
        return new Response(JSON.stringify(postalPayload), { status: 200 });
      },
    },
  );
  const body = await response.json();
  assert.equal(providerRequest.headers.get('X-API-Key'), 'server-only-secret');
  assert.equal(new URL(providerRequest.url).searchParams.get('postalcode'), '80112');
  assert.equal(new URL(providerRequest.url).searchParams.has('postalCode'), false);
  assert.doesNotMatch(JSON.stringify(body), /server-only-secret/);
  assert.equal(body.provider, 'ziptax');
});

test('uses privacy-safe cache rules for exact and ZIP-only lookups', async () => {
  const providerFetch = async (request) => new Response(
    JSON.stringify(new URL(request.url).searchParams.has('address') ? addressPayload : postalPayload),
    { status: 200 },
  );
  const exact = await handleTaxRateRequest(
    exactRequest(),
    { TAX_ALLOW_PAID_FALLBACK: 'true', ZIPTAX_API_KEY: 'secret' },
    {},
    { fetch: providerFetch },
  );
  const postal = await handleTaxRateRequest(
    new Request('https://howbiscuit.com/api/tax-rates?postalCode=80112'),
    { TAX_ALLOW_PAID_FALLBACK: 'true', ZIPTAX_API_KEY: 'secret' },
    {},
    { fetch: providerFetch },
  );
  assert.equal(exact.headers.get('Cache-Control'), 'no-store');
  assert.match(postal.headers.get('Cache-Control'), /s-maxage=86400/);
});

test('returns a sanitized provider failure', async () => {
  const response = await handleTaxRateRequest(
    new Request('https://howbiscuit.com/api/tax-rates?postalCode=10001'),
    { TAX_ALLOW_PAID_FALLBACK: 'true', ZIPTAX_API_KEY: 'never-print-this' },
    {},
    { fetch: async () => new Response('provider account details', { status: 403 }) },
  );
  const body = await response.json();
  assert.equal(response.status, 502);
  assert.equal(body.error, 'The local tax-rate service is temporarily unavailable.');
  assert.doesNotMatch(JSON.stringify(body), /provider account|never-print/i);
});

test('does not retry provider quota failures or expose application-level errors', async () => {
  let calls = 0;
  const quota = await handleTaxRateRequest(
    new Request('https://howbiscuit.com/api/tax-rates?postalCode=10001'),
    { TAX_ALLOW_PAID_FALLBACK: 'true', ZIPTAX_API_KEY: 'secret' },
    {},
    {
      fetch: async () => {
        calls += 1;
        return new Response(JSON.stringify({ metadata: { response: { code: 108, message: 'quota detail' } } }), { status: 429 });
      },
    },
  );
  assert.equal(quota.status, 502);
  assert.equal(calls, 1);
  assert.doesNotMatch(JSON.stringify(await quota.json()), /quota detail/);

  const applicationError = await handleTaxRateRequest(
    exactRequest('groceries'),
    { TAX_ALLOW_PAID_FALLBACK: 'true', ZIPTAX_API_KEY: 'secret', ZIPTAX_PRODUCT_RULES: 'true' },
    {},
    {
      fetch: async () => new Response(JSON.stringify({
        metadata: { response: { code: 113, message: 'missing product entitlement' } },
      }), { status: 200 }),
    },
  );
  assert.equal(applicationError.status, 502);
  assert.doesNotMatch(JSON.stringify(await applicationError.json()), /entitlement/);
});

test('adds supported product codes only to exact address requests when enabled', async () => {
  const urls = [];
  const run = (product, address = '') => handleTaxRateRequest(
    address
      ? exactRequest(product)
      : new Request(`https://howbiscuit.com/api/tax-rates?postalCode=10001&product=${product}`),
    { TAX_ALLOW_PAID_FALLBACK: 'true', ZIPTAX_API_KEY: 'secret', ZIPTAX_PRODUCT_RULES: 'true' },
    {},
    {
      fetch: async (request) => {
        urls.push(request.url);
        return new Response(JSON.stringify(address ? addressPayload : postalPayload), { status: 200 });
      },
    },
  );
  await run('groceries', '20 W 34th St');
  await run('alcohol', '20 W 34th St');
  await run('groceries');
  await run('cannabis', '20 W 34th St');
  assert.match(urls[0], /taxabilityCode=40030/);
  assert.match(urls[1], /taxabilityCode=90300/);
  assert.doesNotMatch(urls[2], /taxabilityCode=/);
  assert.doesNotMatch(urls[3], /taxabilityCode=/);
  assert.match(decodeURIComponent(urls[0]), /address=20\+W\+34th\+St\+10001/);
});

test('canonicalizes ZIP cache keys so arbitrary query parameters cannot bypass the cache', async () => {
  const caches = memoryCache();
  const pending = [];
  let providerCalls = 0;
  const options = {
    caches,
    fetch: async () => {
      providerCalls += 1;
      return new Response(JSON.stringify(postalPayload), { status: 200 });
    },
  };
  const context = { waitUntil(promise) { pending.push(promise); } };
  const first = await handleTaxRateRequest(
    new Request('https://howbiscuit.com/api/tax-rates?postalCode=80112&nonce=one'),
    { TAX_ALLOW_PAID_FALLBACK: 'true', ZIPTAX_API_KEY: 'secret' },
    context,
    options,
  );
  await Promise.all(pending);
  const second = await handleTaxRateRequest(
    new Request('https://howbiscuit.com/api/tax-rates?nonce=two&postalCode=80112'),
    { TAX_ALLOW_PAID_FALLBACK: 'true', ZIPTAX_API_KEY: 'secret' },
    context,
    options,
  );
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(providerCalls, 1);
});

test('keeps product-specific public-data lookups in separate cache entries', async () => {
  const caches = memoryCache();
  const pending = [];
  let locationCalls = 0;
  const options = {
    caches,
    fetch: async () => {
      locationCalls += 1;
      return new Response(JSON.stringify({
        places: [{ 'place name': 'New York City', 'state abbreviation': 'NY' }],
      }), { status: 200 });
    },
  };
  const context = { waitUntil(promise) { pending.push(promise); } };
  const general = await handleTaxRateRequest(
    new Request('https://howbiscuit.com/api/tax-rates?postalCode=10001&product=general'),
    {},
    context,
    options,
  );
  await Promise.all(pending.splice(0));
  const groceries = await handleTaxRateRequest(
    new Request('https://howbiscuit.com/api/tax-rates?postalCode=10001&product=groceries'),
    {},
    context,
    options,
  );
  await Promise.all(pending);
  assert.equal(general.status, 200);
  assert.equal(groceries.status, 200);
  assert.equal(locationCalls, 2);
  assert.equal((await general.json()).candidates[0].totalRate, 4);
  assert.equal((await groceries.json()).candidates[0].totalRate, 0);
});

test('rate-limits repeated exact lookups without exposing the address in the public URL', async () => {
  const caches = memoryCache();
  let providerCalls = 0;
  const request = () => new Request('https://howbiscuit.com/api/tax-rates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
    body: JSON.stringify({ postalCode: '10001', address: '20 W 34th St', product: 'general' }),
  });
  let response;
  for (let index = 0; index < 13; index += 1) {
    response = await handleTaxRateRequest(
      request(),
      { TAX_ALLOW_PAID_FALLBACK: 'true', ZIPTAX_API_KEY: 'secret' },
      {},
      {
        caches,
        fetch: async () => {
          providerCalls += 1;
          return new Response(JSON.stringify(addressPayload), { status: 200 });
        },
      },
    );
  }
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '60');
  assert.equal(providerCalls, 12);
  assert.doesNotMatch(request().url, /20|34th|10001/);
});
