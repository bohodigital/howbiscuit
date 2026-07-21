import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { dump as dumpYaml } from 'js-yaml';

import {
  createProductSchemas,
  createPublicProductCatalog,
  loadProductRecords,
  renderCommerceDirective,
  resolveArticleCommerce,
} from '../scripts/publishing/product-records.mjs';

const schemaVersion = '1.0.0';
const source = Object.freeze({ id: 'manufacturer-spec', status: 'active', recordDigest: 'a'.repeat(64) });
const editorial = Object.freeze({
  sources: new Map([[source.id, source]]),
  testing: new Map(),
  mediaRights: new Map(),
});

function validRecords() {
  return {
    products: [{
      schemaVersion,
      id: 'example-kettle-black-1l',
      displayName: 'Example Kettle',
      brand: 'Example',
      model: 'EK-100',
      exactVariant: 'Black, 1 liter, revision A',
      productType: 'electric-kettle',
      manufacturerIdentifiers: { gtin: null, upc: null, ean: null, mpn: 'EK-100-BLK-1L-A', asin: null, retailerSkus: [] },
      variantAttributes: { color: 'Black', capacity: '1 liter', revision: 'A' },
      description: 'A nonpublic fixture used to prove exact product identity and static shopping validation.',
      sourceIds: ['manufacturer-spec'],
      mediaIds: [],
      provenance: { state: 'researched', notes: 'Fixture assertions use a registered source and make no personal-use claim.' },
      status: 'published',
    }],
    productGroups: [{
      schemaVersion,
      id: 'example-kettles',
      title: 'Best documented example kettles',
      purpose: 'A nonpublic group used only to verify evidence-bound comparison behavior in automated tests.',
      memberProductIds: ['example-kettle-black-1l'],
      inclusionCriteria: ['The exact fixture variant has a canonical product record.'],
      exclusionCriteria: ['Unresolved, merged, or ambiguous variants are excluded.'],
      methodology: 'Compare every declared group member against the same documented identity and evidence checks.',
      evidenceBasis: 'The fixture uses a registered source solely to exercise recommendation-validation contracts.',
      testingIds: [],
      sourceIds: ['manufacturer-spec'],
      recommendationState: 'best',
      status: 'published',
      reviewDate: '2026-07-20',
      reviewHorizon: null,
    }],
    merchantDestinations: [{
      schemaVersion,
      id: 'example-kettle-unpaid-us',
      productId: 'example-kettle-black-1l',
      exactVariant: 'Black, 1 liter, revision A',
      merchant: 'Example Merchant',
      exactUrl: 'https://merchant.invalid/products/ek-100-black-1l',
      market: 'US',
      relationship: 'unpaid',
      capturedDate: '2026-07-20',
      verificationNotes: 'Nonpublic reserved-domain fixture; no affiliate parameter is present.',
      status: 'published',
    }],
    priceClaims: [{
      schemaVersion,
      id: 'example-kettle-price-2026-07-20',
      amount: 49.99,
      currency: 'USD',
      productId: 'example-kettle-black-1l',
      destinationId: 'example-kettle-unpaid-us',
      sourceId: null,
      observedDate: '2026-07-20',
      displayWording: 'Observed fixture price',
      context: 'Nonpublic dated test data that is never presented as a current offer or stock claim.',
      reviewDate: '2026-08-20',
      status: 'published',
    }],
    recommendationClaims: [{
      schemaVersion,
      id: 'example-kettle-ranking-2026-07-20',
      productGroupId: 'example-kettles',
      evaluatedProductIds: ['example-kettle-black-1l'],
      methodology: 'Evaluate the complete fixture group against the same canonical identity and evidence rules.',
      evidence: 'The registered fixture source provides enough nonpublic evidence to test the governance path.',
      testingIds: [],
      sourceIds: ['manufacturer-spec'],
      reviewDate: '2026-07-20',
      limitations: ['This is a validation fixture, not a real recommendation or production product.'],
      wording: 'Fixture-only recommendation wording supported by the declared method and source.',
      status: 'published',
    }],
  };
}

async function withRecords(mutator = () => {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'hb-products-'));
  try {
    const records = validRecords();
    mutator(records);
    const directories = {
      products: 'products',
      productGroups: 'product-groups',
      merchantDestinations: 'merchant-destinations',
      priceClaims: 'price-claims',
      recommendationClaims: 'recommendation-claims',
    };
    for (const [kind, directory] of Object.entries(directories)) {
      const target = path.join(root, 'content', directory);
      mkdirSync(target, { recursive: true });
      for (const record of records[kind]) writeFileSync(path.join(target, `${record.id}.yaml`), dumpYaml(record, { noRefs: true }), 'utf8');
    }
    return await loadProductRecords(root, editorial);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function articleGovernance() {
  return {
    productIds: ['example-kettle-black-1l'],
    productGroupIds: ['example-kettles'],
    destinationIds: ['example-kettle-unpaid-us'],
    priceClaims: ['example-kettle-price-2026-07-20'],
    recommendationClaims: ['example-kettle-ranking-2026-07-20'],
    sourceIds: ['manufacturer-spec'],
  };
}

test('canonical product records resolve exact variants and render truthful static commerce', async () => {
  const records = await withRecords();
  const publicCatalog = createPublicProductCatalog(records);
  assert.equal(publicCatalog.products.length, 1);
  assert.equal(publicCatalog.merchantDestinations[0].relationship, 'unpaid');
  assert.match(publicCatalog.priceClaims[0].renderedText, /as of 2026-07-20/);
  const resolved = resolveArticleCommerce(articleGovernance(), records, editorial, 'fixture article', 'This is our best documented fixture.');
  const productOutput = renderCommerceDirective('product', { product: 'example-kettle-black-1l', destination: 'example-kettle-unpaid-us' }, resolved);
  assert.match(productOutput, /Researched by How Biscuit/);
  assert.match(productOutput, /unpaid Example Merchant listing/);
  assert.match(productOutput, /receives no compensation/);
  assert.match(renderCommerceDirective('price', { claim: 'example-kettle-price-2026-07-20' }, resolved), /as of 2026-07-20/);
});

test('production catalog remains honestly empty when no verified records exist', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'hb-products-empty-'));
  try {
    const records = await loadProductRecords(root, editorial);
    const publicCatalog = createPublicProductCatalog(records);
    assert.deepEqual(publicCatalog.products, []);
    assert.deepEqual(publicCatalog.productGroups, []);
    assert.deepEqual(publicCatalog.merchantDestinations, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('exact variant mismatches fail closed', async () => {
  await assert.rejects(() => withRecords((records) => { records.merchantDestinations[0].exactVariant = 'White, 1 liter, revision A'; }), /exact variant does not match/);
});

test('unresolved product group members fail closed', async () => {
  await assert.rejects(() => withRecords((records) => { records.productGroups[0].memberProductIds = ['missing-product']; records.recommendationClaims[0].evaluatedProductIds = ['missing-product']; }), /unresolved record missing-product/);
});

test('publishable affiliate destinations and affiliate parameters are rejected', () => {
  const schemas = createProductSchemas();
  const destination = validRecords().merchantDestinations[0];
  assert.throws(() => schemas.merchantDestination.parse({ ...destination, relationship: 'future-affiliate' }), /Handoff 2 may publish only unpaid/);
  for (const query of ['tag=affiliate-20', 'affiliate_id=123', 'partnerId=abc', 'subid=click']) {
    assert.throws(() => schemas.merchantDestination.parse({ ...destination, exactUrl: `${destination.exactUrl}?${query}` }), /query parameters/);
  }
});

test('undated prices and live availability fields are rejected', () => {
  const schemas = createProductSchemas();
  const claim = validRecords().priceClaims[0];
  const { observedDate: _observedDate, ...undated } = claim;
  assert.throws(() => schemas.priceClaim.parse(undated));
  assert.throws(() => schemas.priceClaim.parse({ ...claim, liveAvailability: true }));
  assert.throws(() => schemas.priceClaim.parse({ ...claim, context: 'Currently available near you.' }), /cannot imply live or local availability/);
});

test('raw merchant URLs, raw prices, and unsupported rankings are rejected in article text', async () => {
  const records = await withRecords();
  const governance = articleGovernance();
  assert.throws(() => resolveArticleCommerce(governance, records, editorial, 'fixture article', 'Buy at https://merchant.invalid/products/ek-100-black-1l today.'), /merchant URLs must be represented by destination IDs/);
  assert.throws(() => resolveArticleCommerce({ ...governance, priceClaims: [] }, records, editorial, 'fixture article', 'It costs $49.99.'), /raw price text/);
  assert.throws(() => resolveArticleCommerce({ ...governance, recommendationClaims: [] }, records, editorial, 'fixture article', 'This is the best option.'), /unsupported ranking language/);
  assert.throws(() => resolveArticleCommerce(governance, records, editorial, 'fixture article', 'Buy at https://costco.com/kettles/sku123 today.'), /every raw URL must match/);
  assert.throws(() => resolveArticleCommerce({ ...governance, priceClaims: [] }, records, editorial, 'fixture article', 'It costs 49.99 USD.'), /raw price text/);
  assert.throws(() => resolveArticleCommerce({ ...governance, priceClaims: [] }, records, editorial, 'fixture article', 'It costs 49 dollars.'), /raw price text/);
  assert.throws(() => resolveArticleCommerce({ ...governance, priceClaims: [] }, records, editorial, 'fixture article', 'It costs 49.99 MXN.'), /raw price text/);
  assert.throws(() => resolveArticleCommerce({ ...governance, recommendationClaims: [] }, records, editorial, 'fixture article', 'This kettle is the best.'), /unsupported ranking language/);
  assert.throws(() => resolveArticleCommerce({ ...governance, recommendationClaims: [] }, records, editorial, 'fixture article', 'This electric kettle is the best.'), /unsupported ranking language/);
});

test('commerce claims fail closed even when authors omit every commerce ID', async () => {
  const records = await withRecords();
  const empty = { productIds: [], productGroupIds: [], destinationIds: [], priceClaims: [], recommendationClaims: [], sourceIds: [] };
  assert.throws(() => resolveArticleCommerce(empty, records, editorial, 'fixture article', 'Buy at https://merchant.invalid/products/ek-100-black-1l.'), /merchant URLs must be represented by destination IDs/);
  assert.throws(() => resolveArticleCommerce(empty, records, editorial, 'fixture article', 'It costs USD 49.99.'), /raw price text/);
  assert.throws(() => resolveArticleCommerce(empty, records, editorial, 'fixture article', 'Our best overall choice.'), /unsupported ranking language/);
  assert.throws(() => resolveArticleCommerce(empty, records, editorial, 'fixture article', 'Live price and local availability.'), /belongs to Handoff 3/);
});

test('canonical text cannot inject HTML or executable MDX and Markdown is escaped at the directive boundary', async () => {
  const schemas = createProductSchemas();
  const product = validRecords().products[0];
  assert.throws(() => schemas.product.parse({ ...product, displayName: '<script>alert(1)</script>' }), /single-line plain text/);
  assert.throws(() => schemas.product.parse({ ...product, description: 'A dangerous expression that is long enough to pass length checks {globalThis.process}.' }), /single-line plain text/);
  const records = await withRecords((fixture) => { fixture.products[0].displayName = '[Forged](not-a-link)'; });
  const resolved = resolveArticleCommerce(articleGovernance(), records, editorial, 'fixture article', 'A governed fixture group.');
  const output = renderCommerceDirective('product', { product: 'example-kettle-black-1l', destination: 'example-kettle-unpaid-us' }, resolved);
  assert.doesNotMatch(output, /\*\*\[Forged\]\(not-a-link\)/);
  assert.match(output, /\\\[Forged\\\]\\\(not-a-link\\\)/);
});

test('canonical identity and identifier formats fail closed', async () => {
  await assert.rejects(() => withRecords((records) => {
    const duplicate = structuredClone(records.products[0]);
    duplicate.id = 'same-kettle-second-authority';
    duplicate.manufacturerIdentifiers.mpn = 'EK-100-BLK-1L-SECOND';
    records.products.push(duplicate);
  }), /canonical identity duplicates/);
  const schemas = createProductSchemas();
  const product = validRecords().products[0];
  assert.throws(() => schemas.product.parse({ ...product, manufacturerIdentifiers: { ...product.manufacturerIdentifiers, upc: '1234' } }));
  assert.throws(() => schemas.product.parse({ ...product, manufacturerIdentifiers: { ...product.manufacturerIdentifiers, mpn: 'unknown' } }), /placeholders/);
});

test('publishable groups cannot expose draft or retired members', async () => {
  await assert.rejects(() => withRecords((records) => { records.products[0].status = 'draft'; }), /publishable groups require publishable members/);
});

test('listed-only provenance cannot render as tested or recommended', async () => {
  const records = await withRecords((fixture) => { fixture.products[0].provenance.state = 'listed-without-recommendation'; });
  const resolved = resolveArticleCommerce(articleGovernance(), records, editorial, 'fixture article', 'A governed fixture group.');
  const output = renderCommerceDirective('product', { product: 'example-kettle-black-1l', destination: 'example-kettle-unpaid-us' }, resolved);
  assert.match(output, /Listed for reference; not a recommendation/);
  assert.doesNotMatch(output, /Tested by How Biscuit/);
});

test('canonical product prose cannot contradict its declared provenance', async () => {
  await assert.rejects(() => withRecords((records) => {
    records.products[0].description = 'We personally used and recommend this product after extensive hands-on testing in our own kitchen.';
  }), /researched provenance cannot claim first-hand use or testing/);
  await assert.rejects(() => withRecords((records) => {
    records.products[0].provenance.state = 'listed-without-recommendation';
    records.products[0].description = 'How Biscuit recommends this product based on a registered source and its exact documented variant.';
  }), /cannot make a recommendation claim/);
  await assert.rejects(() => withRecords((records) => {
    records.products[0].description = 'Hands-on tested by How Biscuit, with notes recorded for this exact documented product variant.';
  }), /researched provenance cannot claim first-hand use or testing/);
  await assert.rejects(() => withRecords((records) => {
    records.products[0].provenance.state = 'listed-without-recommendation';
    records.products[0].description = 'Recommended by How Biscuit after reviewing this exact documented product variant and its source.';
  }), /cannot make a recommendation claim/);
});
