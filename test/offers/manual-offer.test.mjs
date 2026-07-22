import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { load as parseYaml } from 'js-yaml';

import { manualOfferStatements, reviewManualOffer } from '../../src/lib/offers/manual-offer.mjs';
import { sourcePolicySchema } from '../../src/lib/offers/source-policy.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const fixturePolicy = sourcePolicySchema.parse(parseYaml(readFileSync(path.join(directory, 'fixtures', 'fixture-source.yaml'), 'utf8')));
const policy = sourcePolicySchema.parse({
  ...fixturePolicy,
  sourceId: 'manual-retailer',
  adapterId: 'manual-retailer-v1',
  scope: { merchantIds: ['manual-retailer'] },
  legalBasis: { type: 'reviewed-manual', termsUrl: 'https://retailer.invalid/terms', documentationUrl: 'https://retailer.invalid/product-pages', termsExpiresAt: '2026-12-31', accountApprovalRequired: false },
  killSwitch: { ...fixturePolicy.killSwitch, environmentVariable: 'MANUAL_RETAILER_ENABLED' },
});
const input = {
  schemaVersion: '1.0.0', offerId: 'manual-retailer-sku-1-2026-07-22', canonicalProductId: 'fixture-router-us-black', merchantId: 'manual-retailer', merchantProductId: 'sku-1',
  price: { amount: 129.99, currency: 'USD' }, condition: 'new', quantity: 1, bundle: 'router-only', fulfillment: ['shipping'],
  observedAt: '2026-07-22T18:00:00.000Z', expiresAt: '2026-07-22T19:00:00.000Z', reviewerId: 'editor-one', sourcePolicyId: 'manual-retailer', evidenceId: 'manual-evidence-2026-07-22',
  displayAllowed: true, archiveAllowed: false, pickupVerified: null, storeId: null, availabilityState: 'unknown',
};
const authorities = {
  canonicalProducts: [{ productId: input.canonicalProductId, status: 'published' }],
  policies: new Map([[policy.sourceId, policy]]),
  runtimeBySource: { [policy.sourceId]: { databaseEnabled: true, killSwitchEnabled: true } },
  mappingResolver: () => ({ canonicalProductId: input.canonicalProductId, status: 'active', matchConfidence: 'exact-retailer-sku', reviewedBy: 'mapping-reviewer', reviewedAt: '2026-07-21T18:00:00.000Z', matchEvidenceJson: JSON.stringify({ reviewed: true, evidenceIds: ['sku-evidence'], retailerSku: 'sku-1' }) }),
  now: new Date('2026-07-22T18:30:00.000Z'),
};

test('reviewed manual offers require product, policy, evidence, mapping, and automatic expiration', () => {
  const reviewed = reviewManualOffer(input, authorities);
  assert.equal(reviewed.offer.sourceMethod, 'reviewed-manual');
  assert.equal(reviewed.review.status, 'approved-expiring');
  assert.equal(reviewed.offer.availabilityState, 'unknown');
  assert.throws(() => reviewManualOffer({ ...input, expiresAt: '2026-07-23T20:00:00.000Z' }, authorities), /storage retention|hard expiration/);
  assert.throws(() => reviewManualOffer({ ...input, availabilityState: 'available', observedAt: '2026-07-22T18:25:00.000Z', expiresAt: '2026-07-22T18:35:00.000Z' }, authorities), /remain unknown/);
  assert.throws(() => reviewManualOffer({ ...input, merchantId: 'other-retailer' }, authorities), /not authorized for merchant/);
  assert.throws(() => reviewManualOffer(input, { ...authorities, policies: new Map([[policy.sourceId, { ...policy, storage: { ...policy.storage, price: { allowed: true, maximumSeconds: 300 } } }]]) }), /storage retention/);
  assert.throws(() => reviewManualOffer(input, { ...authorities, policies: new Map([[policy.sourceId, { ...policy, storage: { ...policy.storage, productIdentifier: { allowed: true, maximumSeconds: 300 } } }]]) }), /storage retention/);
  assert.throws(() => reviewManualOffer({ ...input, storeId: 'store-1' }, { ...authorities, policies: new Map([[policy.sourceId, { ...policy, storage: { ...policy.storage, storeIdentifier: { allowed: false, maximumSeconds: 0 } } }]]) }), /prohibits store identifier/);
  assert.throws(() => reviewManualOffer(input, { ...authorities, canonicalProducts: [] }), /unknown or unavailable/);
  const sql = [];
  const db = { prepare(statement) { sql.push(statement); return { bind(...values) { return { statement, values }; } }; } };
  const statements = manualOfferStatements(db, reviewed);
  assert.equal(statements.length, 2);
  assert.ok(sql.every((statement) => !statement.includes(input.offerId)));
  assert.ok(statements.every(({ values }) => values.includes(input.offerId)));
  assert.ok(sql[0].includes('canonical_product_id=excluded.canonical_product_id'));
  assert.ok(sql[0].includes('source_id=excluded.source_id'));
  assert.ok(sql[1].includes('merchant_id=excluded.merchant_id'));
});
