import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { getPublicSiteData } from '../src/lib/public-content/site-registry.mjs';
import { resolvePublicNavigationState } from '../src/lib/public-content/public-navigation.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { navigation, registry } = getPublicSiteData(root);

test('Phase C navigation exposes five real category routes and All Guides', () => {
  assert.deepEqual(navigation.categories.map(({ label, href }) => [label, href]), [
    ['Home Tech', '/home-tech/'],
    ['Home & Apartment', '/home/'],
    ['Kitchen', '/kitchen/'],
    ['Shop Smarter', '/shop/'],
    ['Tools', '/tools/'],
  ]);
  assert.deepEqual(navigation.allGuides, { label: 'All Guides', href: '/articles/' });
  const guideLinks = navigation.categories.flatMap(({ guideLinks }) => guideLinks);
  assert.ok(guideLinks.length > 0);
  assert.ok(guideLinks.every(({ href }) => registry.some(({ route }) => route === href)));
});

test('one-guide topics remain category filters and zero-guide topics stay hidden', () => {
  const home = navigation.categories.find(({ id }) => id === 'home');
  const kitchen = navigation.categories.find(({ id }) => id === 'kitchen');
  const homeTech = navigation.categories.find(({ id }) => id === 'home-tech');
  assert.deepEqual(home.topicLabels, [{
    id: 'heating-cooling', label: 'Heating & Cooling', mode: 'filter', count: 1,
    href: '/home/#topic-heating-cooling',
  }]);
  assert.deepEqual(kitchen.topicLabels, [{
    id: 'food-science', label: 'Food Science', mode: 'filter', count: 1,
    href: '/kitchen/#topic-food-science',
  }]);
  assert.deepEqual(homeTech.topicLabels, []);
});

test('primary navigation exposes one truthful current category or section', () => {
  const state = (currentPath, overrides = {}) => resolvePublicNavigationState({
    currentPath,
    navigation: overrides.navigation ?? navigation,
    registry: overrides.registry ?? registry,
  });
  assert.deepEqual(state('/').home, 'page');
  assert.equal(state('/articles/').allGuides, 'page');
  assert.equal(state('/home/').categories.home, 'page');
  assert.equal(state('/articles/why-salt-melts-ice/').categories.home, 'true');
  assert.equal(state('/articles/how-does-baking-powder-work/').categories.kitchen, 'true');
  assert.equal(state('/articles/why-are-some-answers-better-than-others/').allGuides, 'true');
  assert.ok(Object.values(state('/about/').categories).every((value) => value === undefined));

  const homeTech = navigation.categories.find(({ id }) => id === 'home-tech');
  const standaloneNavigation = {
    ...navigation,
    categories: navigation.categories.map((category) => category.id === 'home-tech' ? {
      ...category,
      topicLabels: [{ id: 'tvs-streaming', label: 'TVs & Streaming', mode: 'standalone', count: 3, href: '/home-tech/tvs-streaming/' }],
    } : category),
  };
  assert.ok(homeTech);
  assert.equal(state('/home-tech/tvs-streaming/', { navigation: standaloneNavigation }).categories['home-tech'], 'true');
  assert.throws(() => state('articles/'), /root-relative current path/);
});
