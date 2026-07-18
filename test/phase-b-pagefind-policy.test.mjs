import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadTypeScriptModule } from '../scripts/lib/load-typescript-module.mjs';
import { createPublicSiteRegistry } from '../src/lib/public-content/model.mjs';
import {
  pagefindAttributesForPage,
  pagefindMetadataForRecord,
} from '../src/lib/public-content/pagefind-policy.mjs';
import { discoverTrackedPublicSources } from '../src/lib/public-content/source-adapter.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const taxonomy = await loadTypeScriptModule(path.join(root, 'src', 'config', 'public-taxonomy.ts'));
const publicRegistry = createPublicSiteRegistry({
  sources: discoverTrackedPublicSources(root, { taxonomy }),
  taxonomy,
});

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

test('the normalized registry owns active routes and stays disjoint from inactive route contracts', () => {
  const activeRoutes = publicRegistry.map(({ route }) => route);
  const inactiveRoutes = taxonomy.TARGET_ROUTE_CONTRACTS
    .filter(({ route, outcome }) => !route.includes('*') && ['redirect', 'terminal'].includes(outcome))
    .map(({ route }) => route);
  assert.equal(activeRoutes.length, 16);
  assert.equal(new Set(activeRoutes).size, activeRoutes.length);
  assert.ok(inactiveRoutes.every((route) => !activeRoutes.includes(route)));
});
