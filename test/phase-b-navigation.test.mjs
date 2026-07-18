import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadTypeScriptModule } from '../scripts/lib/load-typescript-module.mjs';
import { buildPublicNavigation } from '../src/lib/public-content/public-navigation.mjs';
import { createPublicContentRegistry } from '../src/lib/public-content/model.mjs';
import { discoverTrackedArticleSources } from '../src/lib/public-content/source-adapter.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const taxonomy = await loadTypeScriptModule(path.join(root, 'src', 'config', 'public-taxonomy.ts'));
const registry = createPublicContentRegistry({
  sources: discoverTrackedArticleSources(root),
  taxonomy,
});

test('Phase B navigation exposes the exact controls without activating target routes', () => {
  const navigation = buildPublicNavigation({ taxonomy, registry });

  assert.deepEqual(navigation.categories.map(({ label }) => label), [
    'Home Tech',
    'Home & Apartment',
    'Kitchen',
    'Shop Smarter',
    'Tools',
  ]);
  assert.equal(navigation.allGuides.label, 'All Guides');
  assert.equal(navigation.allGuides.href, '/articles/');
  assert.ok(navigation.categories.every(({ href }) => href === null));

  const targetRoutes = new Set([
    ...taxonomy.PUBLIC_CATEGORIES.map(({ route }) => route),
    ...taxonomy.PUBLIC_CATEGORIES.flatMap(({ topics }) => topics.map(({ route }) => route)),
  ]);
  const links = navigation.categories.flatMap(({ guideLinks }) => guideLinks);
  assert.ok(links.length > 0, 'real published guide links should be available');
  assert.ok(links.every(({ href }) => registry.some(({ route }) => route === href)));
  assert.ok(links.every(({ href }) => !targetRoutes.has(href)));
  assert.ok(links.every(({ title }) => !/coming soon|placeholder|preview/i.test(title)));
});

test('topic visibility is derived from the accepted threshold and never creates a dead link', () => {
  const navigation = buildPublicNavigation({ taxonomy, registry });
  const home = navigation.categories.find(({ id }) => id === 'home');
  const kitchen = navigation.categories.find(({ id }) => id === 'kitchen');
  const homeTech = navigation.categories.find(({ id }) => id === 'home-tech');

  assert.deepEqual(home.topicLabels, [{ id: 'heating-cooling', label: 'Heating & Cooling', mode: 'filter' }]);
  assert.deepEqual(kitchen.topicLabels, [{ id: 'food-science', label: 'Food Science', mode: 'filter' }]);
  assert.deepEqual(homeTech.topicLabels, []);
  assert.ok(navigation.categories.flatMap(({ topicLabels }) => topicLabels).every(({ href }) => href === undefined));
});
