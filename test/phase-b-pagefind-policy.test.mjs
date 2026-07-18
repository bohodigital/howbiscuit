import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PHASE_C_DOCUMENT_ROUTES,
  RETIRED_DOCUMENT_ROUTES,
  pagefindAttributesForPage,
  pagefindMetadataForRecord,
} from '../src/lib/public-content/pagefind-policy.mjs';

const publishable = {
  route: '/articles/example/',
  title: 'A real example guide',
  description: 'A sufficiently complete description for a real example guide in search.',
  categoryId: 'home',
  articleType: 'guide',
  searchEligible: true,
  draft: false,
  preview: false,
  thin: false,
  redirectState: null,
  retirementState: null,
};

test('eligible records receive complete Pagefind metadata', () => {
  assert.deepEqual(pagefindMetadataForRecord(publishable), {
    include: true,
    filters: { category: 'home', type: 'guide' },
    meta: {
      title: publishable.title,
      description: publishable.description,
      route: publishable.route,
    },
  });
  assert.deepEqual(pagefindAttributesForPage({ searchEligible: true }), { 'data-pagefind-body': '' });
});

test('draft, preview, thin, redirected, and retired records are excluded fail closed', () => {
  for (const exclusion of [
    { draft: true, searchEligible: false },
    { preview: true, searchEligible: false },
    { thin: true, searchEligible: false },
    { redirectState: { to: '/elsewhere/' }, searchEligible: false },
    { retirementState: { allowedStatuses: [404, 410] }, searchEligible: false },
  ]) {
    const record = { ...publishable, ...exclusion };
    assert.deepEqual(pagefindMetadataForRecord(record), { include: false });
    assert.deepEqual(pagefindAttributesForPage(record), { 'data-pagefind-ignore': 'all' });
  }
  assert.throws(() => pagefindMetadataForRecord({ ...publishable, draft: true }), /contradictory Pagefind eligibility/i);
});

test('the 16 active Phase C documents are unique and disjoint from retired sources', () => {
  assert.equal(PHASE_C_DOCUMENT_ROUTES.length, 16);
  assert.equal(new Set(PHASE_C_DOCUMENT_ROUTES).size, 16);
  assert.ok(RETIRED_DOCUMENT_ROUTES.every((route) => !PHASE_C_DOCUMENT_ROUTES.includes(route)));
});
