import assert from 'node:assert/strict';
import test from 'node:test';

import {
  allTaxLocationPages,
  metroTaxPages,
  stateTaxPages,
  taxLocationPagePath,
} from '../src/data/tax-location-pages.mjs';
import {
  buildCanonicalTaxCalculatorUrl,
  canonicalSalesTaxPath,
  parseTaxCalculatorQuery,
} from '../src/lib/calculators/tax-location-navigation.mjs';

const censusTop15 = [
  'New York City', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia',
  'San Antonio', 'San Diego', 'Dallas', 'Fort Worth', 'Jacksonville', 'Austin',
  'San Jose', 'Charlotte', 'Columbus',
];

test('location registry covers every state plus Washington, DC', () => {
  assert.equal(stateTaxPages.length, 51);
  assert.equal(new Set(stateTaxPages.map(({ stateCode }) => stateCode)).size, 51);
  assert.ok(stateTaxPages.some(({ stateCode, label }) => stateCode === 'DC' && label === 'District of Columbia'));
});

test('state and metro routes are unique and stay under the canonical calculator', () => {
  const slugs = allTaxLocationPages.map(({ slug }) => slug);
  assert.equal(new Set(slugs).size, slugs.length);
  allTaxLocationPages.forEach((page) => {
    const path = taxLocationPagePath(page);
    assert.match(path, /^\/tools\/cost-estimators\/sales-tax\/[a-z0-9-]+\/$/);
    assert.notEqual(path, canonicalSalesTaxPath);
    assert.notEqual(page.slug, 'locations');
  });
});

test('major-city pages cover the Census Bureau top 15 in rank order', () => {
  const ranked = metroTaxPages
    .filter(({ censusRank }) => censusRank)
    .sort((a, b) => a.censusRank - b.censusRank);
  assert.deepEqual(ranked.map(({ label }) => label), censusTop15);
  assert.deepEqual(ranked.map(({ censusRank }) => censusRank), Array.from({ length: 15 }, (_, index) => index + 1));
});

test('NYC uses the verified preset while other metro pages request local data', () => {
  const nyc = metroTaxPages.find(({ slug }) => slug === 'nyc');
  assert.equal(nyc?.presetId, 'nyc-general');
  assert.equal(nyc?.autoLookup, false);
  metroTaxPages.filter(({ slug }) => slug !== 'nyc').forEach((page) => {
    assert.match(page.postalCode, /^\d{5}$/);
    assert.equal(page.autoLookup, true);
    assert.equal(page.presetId, undefined);
  });
});

test('landing-page handoff preserves the preset but always targets the main calculator', () => {
  const url = buildCanonicalTaxCalculatorUrl({
    stateCode: 'CA',
    postalCode: '90012',
    presetId: 'custom',
    autoLookup: true,
    focus: 'amount',
  });
  assert.equal(
    url,
    '/tools/cost-estimators/sales-tax/?state=CA&postalCode=90012&preset=custom&lookup=1&focus=amount',
  );
  assert.ok(!url.includes('los-angeles'));
});

test('calculator query parser rejects unknown state, preset, ZIP, and focus values', () => {
  assert.deepEqual(
    parseTaxCalculatorQuery('?state=XX&postalCode=abc&preset=bad&lookup=1&focus=evil&action=bad', ['NY'], ['custom']),
    { stateCode: '', postalCode: '', presetId: '', autoLookup: true, focus: '', action: '' },
  );
});

test('landing-page buttons continue their intended action after the handoff', () => {
  const url = buildCanonicalTaxCalculatorUrl({
    stateCode: 'NY',
    postalCode: '10001',
    presetId: 'nyc-general',
    action: 'locate',
  });
  assert.equal(url, '/tools/cost-estimators/sales-tax/?state=NY&postalCode=10001&preset=nyc-general&action=locate');
  assert.equal(
    parseTaxCalculatorQuery(url.split('?')[1], ['NY'], ['nyc-general']).action,
    'locate',
  );
});
