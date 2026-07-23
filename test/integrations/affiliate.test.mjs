import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { load as parseYaml } from 'js-yaml';

import { AFFILIATE_PROGRAM_CONTRACTS } from '../../src/lib/affiliate/providers.mjs';
import { disclosureForRelationship, resolveAffiliateDestination } from '../../src/lib/affiliate/resolver.mjs';
import { affiliateProgramEligibilitySchema } from '../../src/lib/affiliate/schema.mjs';
import { evaluateSourcePolicy } from '../../src/lib/offers/source-policy.mjs';

const root = new URL('../../', import.meta.url);
const amazonPolicy = parseYaml(readFileSync(new URL('content/source-policies/amazon-creators.yaml', root), 'utf8'));
const ebayPolicy = parseYaml(readFileSync(new URL('content/source-policies/ebay-browse.yaml', root), 'utf8'));
const now = new Date('2026-07-22T20:00:00.000Z');
const unpaidDestination = {
  destinationId: 'fixture-router-amazon-us',
  canonicalProductId: 'fixture-router-us-black',
  merchantId: 'amazon',
  merchant: 'Amazon',
  exactUrl: 'https://www.amazon.com/dp/B000000001',
  capturedDate: '2026-07-22',
  relationship: 'unpaid',
};
const relationship = {
  id: 'fixture-router-amazon-affiliate',
  canonicalProductId: unpaidDestination.canonicalProductId,
  merchantId: unpaidDestination.merchantId,
  destinationId: unpaidDestination.destinationId,
  relationship: 'affiliate-approved-public',
  programId: 'amazon-associates-us',
  disclosurePolicyId: 'amazon-associates-us-disclosure',
  publicActivationApproved: true,
  enabledAt: '2026-07-22T19:00:00.000Z',
};
const program = {
  programId: relationship.programId,
  sourceId: 'amazon-creators',
  merchantId: 'amazon',
  status: 'approved',
  programApprovalEvidenceId: 'amazon-program-approval-proof',
  apiEligibilityEvidenceId: 'amazon-api-eligibility-proof',
  termsReviewEvidenceId: 'amazon-terms-review-proof',
  publicActivationApproved: true,
  databaseEnabled: true,
  reviewedAt: '2026-07-22T18:00:00.000Z',
};
const specialLink = {
  destinationId: relationship.destinationId,
  relationshipId: relationship.id,
  sourceId: program.sourceId,
  approvedUrl: 'https://www.amazon.com/dp/B000000001?tag=approved-20',
  approvalEvidenceId: 'amazon-special-link-approval-proof',
  status: 'approved-public',
  approvedAt: '2026-07-22T18:30:00.000Z',
};
const activeAmazonPolicy = {
  ...amazonPolicy,
  publicActivationApproved: true,
  review: { ...amazonPolicy.review, comparisonStatus: 'approved' },
};
const enabledEnvironment = { AFFILIATE_LINKS_ENABLED: 'true', AMAZON_ENABLED: 'true' };

function resolve(overrides = {}) {
  return resolveAffiliateDestination({
    unpaidDestination,
    relationship,
    program,
    specialLink,
    sourcePolicy: activeAmazonPolicy,
    environment: enabledEnvironment,
    databaseSourceState: { enabled: true },
    now,
    ...overrides,
  });
}

test('committed Amazon and eBay policies remain disabled until real provider eligibility and approval', () => {
  for (const policy of [amazonPolicy, ebayPolicy]) {
    assert.equal(policy.publicActivationApproved, false);
    assert.equal(policy.review.comparisonStatus, 'requires-review');
    assert.equal(policy.limits.paidMonthlyCeilingUsd, 0);
    assert.equal(evaluateSourcePolicy(policy, { databaseEnabled: true, killSwitchEnabled: true }, now), 'policy-disabled');
  }
  assert.equal(AFFILIATE_PROGRAM_CONTRACTS['amazon-associates-us'].implementationState, 'eligibility-not-proven');
  assert.equal(AFFILIATE_PROGRAM_CONTRACTS['ebay-partner-network-us'].implementationState, 'eligibility-not-proven');
});

test('affiliate relationship selects both an approved special link and its required disclosure automatically', () => {
  const result = resolve();
  assert.equal(result.affiliateActive, true);
  assert.equal(result.destination.exactUrl, specialLink.approvedUrl);
  assert.equal(result.destination.relationship, 'affiliate-approved-public');
  assert.equal(result.disclosure.state, 'affiliate');
  assert.match(result.disclosure.linkText, /Paid link/);
  assert.equal(result.disclosure.siteText, 'As an Amazon Associate I earn from qualifying purchases.');
});

test('global and provider kill switches instantly restore the existing unpaid destination without article changes', () => {
  const globalOff = resolve({ environment: { ...enabledEnvironment, AFFILIATE_LINKS_ENABLED: 'false' } });
  const providerOff = resolve({ environment: { ...enabledEnvironment, AMAZON_ENABLED: 'false' } });
  for (const result of [globalOff, providerOff]) {
    assert.equal(result.affiliateActive, false);
    assert.equal(result.destination.exactUrl, unpaidDestination.exactUrl);
    assert.equal(result.destination.relationship, 'unpaid');
    assert.equal(result.disclosure.state, 'no-paid-links');
  }
  assert.equal(globalOff.reason, 'global-disabled');
  assert.equal(providerOff.reason, 'source-disabled');
});

test('every missing approval, proof, or current source policy fails closed to unpaid', () => {
  const cases = [
    { program: { ...program, status: 'pending', programApprovalEvidenceId: null, apiEligibilityEvidenceId: null, termsReviewEvidenceId: null, reviewedAt: null, publicActivationApproved: false, databaseEnabled: false } },
    { relationship: { ...relationship, relationship: 'affiliate-approved-disabled', publicActivationApproved: false, enabledAt: null } },
    { specialLink: { ...specialLink, status: 'approved-disabled' } },
    { sourcePolicy: amazonPolicy },
    { databaseSourceState: { enabled: false } },
  ];
  for (const overrides of cases) {
    const result = resolve(overrides);
    assert.equal(result.affiliateActive, false);
    assert.equal(result.destination.exactUrl, unpaidDestination.exactUrl);
  }
});

test('identity mismatches, unapproved hosts, future activation, and incomplete approved evidence fail closed', () => {
  assert.equal(resolve({ relationship: { ...relationship, canonicalProductId: 'other-product' } }).reason, 'identity-mismatch');
  assert.equal(resolve({ specialLink: { ...specialLink, approvedUrl: 'https://evil.invalid/redirect?tag=approved-20' } }).reason, 'special-link-host-rejected');
  assert.equal(resolve({ relationship: { ...relationship, enabledAt: '2026-07-23T00:00:00.000Z' } }).reason, 'relationship-not-yet-enabled');
  assert.equal(resolve({ program: { ...program, reviewedAt: '2026-07-23T00:00:00.000Z' } }).reason, 'program-not-yet-reviewed');
  assert.equal(resolve({ specialLink: { ...specialLink, approvedAt: '2026-07-23T00:00:00.000Z' } }).reason, 'special-link-not-yet-approved');
  assert.equal(resolve({ program: { ...program, apiEligibilityEvidenceId: null } }).reason, 'governance-invalid');
  assert.equal(resolve({ sourcePolicy: { ...activeAmazonPolicy, killSwitch: { ...activeAmazonPolicy.killSwitch, environmentVariable: 'WRONG_SWITCH' } } }).reason, 'identity-mismatch');
  assert.equal(resolve({ sourcePolicy: { ...activeAmazonPolicy, publicActivationApproved: 'yes' } }).reason, 'governance-invalid');
  assert.throws(() => affiliateProgramEligibilitySchema.parse({ ...program, apiEligibilityEvidenceId: null }), /Approved programs require/);
});

test('unsupported paid relationships cannot silently reuse the no-paid-links disclosure', () => {
  assert.equal(disclosureForRelationship('unpaid').state, 'no-paid-links');
  assert.throws(() => disclosureForRelationship('affiliate-approved-preview'), /Unsupported public commercial relationship/);
});
