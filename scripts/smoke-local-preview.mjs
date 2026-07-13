import assert from 'node:assert/strict';

const base = process.argv[2] ?? 'http://127.0.0.1:4322';
const page = await fetch(`${base}/tools/cost-estimators/sales-tax/`);
const html = await page.text();
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)/g)].map((match) => match[1]);
const assetStatuses = [];

for (const source of scripts) {
  const asset = await fetch(new URL(source, base));
  assetStatuses.push([source, asset.status]);
  assert.equal(asset.status, 200, `Script failed to load: ${source}`);
}

const api = await fetch(`${base}/api/tax-rates?postalCode=10001`);
const result = await api.json();
const exactApi = await fetch(`${base}/api/tax-rates`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ postalCode: '10001', address: '20 W 34th St', product: 'general' }),
});
const exactResult = await exactApi.json();
const cigarettesApi = await fetch(`${base}/api/tax-rates?postalCode=10001&product=cigarettes`);
const cigarettesResult = await cigarettesApi.json();
const coverageApi = await fetch(`${base}/api/tax-data/coverage`);
const coverage = await coverageApi.json();
const locateApi = await fetch(`${base}/api/tax-data/locate`);
const locate = await locateApi.json();
const invalid = await fetch(`${base}/api/tax-rates?postalCode=nope`);

assert.equal(page.status, 200);
assert.match(html, /Street address/);
assert.match(html, /Load local rates/);
assert.match(html, /Use my area/);
assert.equal((html.match(/fefef93c-b1d6-4d04-95d3-064af3d38a41/g) ?? []).length, 1);
assert.equal((html.match(/G-NG0NQMVFEH/g) ?? []).length, 2);
assert.equal(api.status, 200);
assert.equal(result.provider, 'public-data');
assert.equal(result.candidates[0].state, 'NY');
assert.equal(exactApi.status, 200);
assert.equal(exactResult.provider, 'public-data');
assert.equal(cigarettesApi.status, 200);
assert.equal(cigarettesResult.candidates[0].unitTaxes[0].amount, 5.35);
assert.equal(coverageApi.status, 200);
assert.equal(coverage.jurisdictionCount, 51);
assert.deepEqual(coverage.accountRequirements.required, []);
assert.equal(locateApi.status, 200);
assert.equal(locate.status, 'unavailable');
assert.equal(locateApi.headers.get('cache-control'), 'private, no-store');
assert.equal(invalid.status, 400);

console.log(JSON.stringify({
  page: page.status,
  scripts: assetStatuses,
  api: api.status,
  exactApi: exactApi.status,
  cigarettesApi: cigarettesApi.status,
  coverageApi: coverageApi.status,
  locateApi: locateApi.status,
  provider: result.provider,
  city: result.candidates[0].city,
  stateRate: result.candidates[0].totalRate,
  invalidZip: invalid.status,
  trackers: { umami: 1, googleAnalyticsTagOccurrences: 2 },
}, null, 2));
