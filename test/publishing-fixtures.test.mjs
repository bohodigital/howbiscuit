import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { load as parseYaml } from 'js-yaml';

import { createPublishingContext } from '../scripts/publishing/article-compiler.mjs';
import { createProductSchemas } from '../scripts/publishing/product-records.mjs';

const templates = path.join(process.cwd(), 'docs', 'publishing', 'templates');
const readTemplate = (name) => parseYaml(readFileSync(path.join(templates, name), 'utf8'));

test('documented source, testing, media-rights, and link-preview templates satisfy their record schemas', async () => {
  const { editorial } = await createPublishingContext();
  assert.equal(editorial.schemas.source.safeParse(readTemplate('source.yaml')).success, true);
  assert.equal(editorial.schemas.testing.safeParse(readTemplate('testing.yaml')).success, true);
  const media = readTemplate('media-rights.yaml');
  assert.equal(editorial.schemas.mediaRights.safeParse(media).success, true);
  assert.equal(editorial.schemas.mediaRights.safeParse({ ...media, altText: '' }).success, false);
  assert.equal(editorial.schemas.linkPreview.safeParse(readTemplate('link-preview.yaml')).success, true);
});

test('documented product, exact variant, group, unpaid destination, and dated price fixtures satisfy schemas', () => {
  const schemas = createProductSchemas();
  assert.equal(schemas.product.safeParse(readTemplate('product.yaml')).success, true);
  assert.equal(schemas.productGroup.safeParse(readTemplate('product-group.yaml')).success, true);
  assert.equal(schemas.merchantDestination.safeParse(readTemplate('merchant-destination.yaml')).success, true);
  assert.equal(schemas.priceClaim.safeParse({
    schemaVersion: '1.0.0',
    id: 'example-price-2026-07-20',
    amount: 49.99,
    currency: 'USD',
    productId: 'example-product-black-one-liter',
    destinationId: 'example-product-unpaid-us',
    sourceId: null,
    observedDate: '2026-07-20',
    displayWording: 'Observed example price',
    context: 'Static documentation fixture; not a current offer or availability statement.',
    reviewDate: '2026-08-20',
    status: 'draft',
  }).success, true);
});
