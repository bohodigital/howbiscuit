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
const invalid = await fetch(`${base}/api/tax-rates?postalCode=nope`);

assert.equal(page.status, 200);
assert.match(html, /Street address/);
assert.match(html, /Load local rates/);
assert.equal((html.match(/fefef93c-b1d6-4d04-95d3-064af3d38a41/g) ?? []).length, 1);
assert.equal((html.match(/G-NG0NQMVFEH/g) ?? []).length, 2);
assert.equal(api.status, 200);
assert.equal(result.provider, 'state-fallback');
assert.equal(result.candidates[0].state, 'NY');
assert.equal(exactApi.status, 200);
assert.equal(exactResult.provider, 'state-fallback');
assert.equal(invalid.status, 400);

console.log(JSON.stringify({
  page: page.status,
  scripts: assetStatuses,
  api: api.status,
  exactApi: exactApi.status,
  provider: result.provider,
  city: result.candidates[0].city,
  stateRate: result.candidates[0].totalRate,
  invalidZip: invalid.status,
  trackers: { umami: 1, googleAnalyticsTagOccurrences: 2 },
}, null, 2));
