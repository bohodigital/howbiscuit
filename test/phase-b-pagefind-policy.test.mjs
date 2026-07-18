import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isKnownThinCurrentRoute,
  KNOWN_THIN_CURRENT_ROUTES,
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

test('eligible records receive index-time Pagefind metadata', () => {
  assert.deepEqual(pagefindMetadataForRecord(publishable), {
    include: true,
    filters: { category: 'home', type: 'guide' },
    meta: {
      title: 'A real example guide',
      description: 'A sufficiently complete description for a real example guide in search.',
      route: '/articles/example/',
    },
  });
  assert.deepEqual(pagefindAttributesForPage({ searchEligible: true }), {
    'data-pagefind-body': '',
  });
});

test('draft, preview, thin, redirected, and retired records are excluded at index time', () => {
  const exclusions = [
    { draft: true, searchEligible: false },
    { preview: true, searchEligible: false },
    { thin: true, searchEligible: false },
    { redirectState: { to: '/elsewhere/' }, searchEligible: false },
    { retirementState: { allowedStatuses: [404, 410] }, searchEligible: false },
  ];
  for (const exclusion of exclusions) {
    const record = { ...publishable, ...exclusion };
    assert.deepEqual(pagefindMetadataForRecord(record), { include: false });
    assert.deepEqual(pagefindAttributesForPage(record), { 'data-pagefind-ignore': 'all' });
  }
});

test('an inconsistent eligibility claim is rejected instead of indexed', () => {
  assert.throws(
    () => pagefindMetadataForRecord({ ...publishable, draft: true }),
    /contradictory Pagefind eligibility/i,
  );
});

test('all five known thin legacy routes remain served but are excluded from Pagefind', () => {
  assert.deepEqual(KNOWN_THIN_CURRENT_ROUTES, [
    '/glossary/',
    '/home-tech/gaming-pcs/',
    '/home-tech/laptops/',
    '/home-tech/streaming-tvs/',
    '/science/',
  ]);
  for (const route of KNOWN_THIN_CURRENT_ROUTES) {
    assert.equal(isKnownThinCurrentRoute(route), true);
    assert.deepEqual(pagefindAttributesForPage({ route, searchEligible: true }), {
      'data-pagefind-ignore': 'all',
    });
  }
});
