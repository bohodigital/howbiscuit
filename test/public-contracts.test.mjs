import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadTypeScriptModule } from '../scripts/lib/load-typescript-module.mjs';
import {
  assertValidPriceBadgeProps,
  assertValidProductEvidence,
  createPublicContentRegistry,
  isPublishableGuide,
  orderFeaturedContent,
  orderHomepageContent,
  orderLatestContent,
  selectRelatedContent,
  topicPublicationModeForRegistry,
} from '../src/lib/public-content/model.mjs';
import { discoverTrackedArticleSources } from '../src/lib/public-content/source-adapter.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const taxonomy = await loadTypeScriptModule(path.join(root, 'src/config/public-taxonomy.ts'));
const sources = discoverTrackedArticleSources(root);
const registry = createPublicContentRegistry({ sources, taxonomy });
const bySlug = Object.fromEntries(registry.map((record) => [record.slug, record]));

test('Phase C taxonomy activates exactly five categories and 31 threshold-gated topics', () => {
  assert.deepEqual(taxonomy.PUBLIC_CATEGORIES.map(({ id, label, route }) => [id, label, route]), [
    ['home-tech', 'Home Tech', '/home-tech/'],
    ['home', 'Home & Apartment', '/home/'],
    ['kitchen', 'Kitchen', '/kitchen/'],
    ['shop', 'Shop Smarter', '/shop/'],
    ['tools', 'Tools', '/tools/'],
  ]);
  const topics = taxonomy.PUBLIC_CATEGORIES.flatMap(({ topics }) => topics);
  assert.equal(topics.length, 31);
  assert.ok(taxonomy.PUBLIC_CATEGORIES.every(({ implemented }) => implemented === true));
  assert.ok(topics.every(({ implemented, publicationPolicy }) => implemented === true && publicationPolicy === 'threshold-gated'));
  assert.deepEqual(taxonomy.ALL_GUIDES_TARGET, {
    route: '/articles/',
    label: 'All Guides',
    baselineLabels: ['All Articles', 'Articles'],
    implemented: true,
  });
});

test('topic thresholds remain contiguous and fail closed', () => {
  assert.deepEqual(taxonomy.TOPIC_PUBLICATION_THRESHOLDS, {
    hiddenMaximum: 0, filterMinimum: 1, filterMaximum: 2, standaloneMinimum: 3,
  });
  assert.equal(taxonomy.topicPublicationMode(0), 'hidden');
  assert.equal(taxonomy.topicPublicationMode(1), 'filter');
  assert.equal(taxonomy.topicPublicationMode(2), 'filter');
  assert.equal(taxonomy.topicPublicationMode(3), 'standalone');
  assert.throws(() => taxonomy.topicPublicationMode(-1), /non-negative integer/);
  assert.throws(() => taxonomy.topicPublicationMode(2, { hiddenMaximum: 0, filterMinimum: 2, filterMaximum: 3, standaloneMinimum: 4 }), /contiguous/);
});

test('route migration resolves directly to real Phase C destinations', () => {
  const expected = new Map([
    ['/make-do/', '/home/'],
    ['/cook/', '/kitchen/'],
    ['/buying-guides/', '/shop/'],
    ['/research-writing/', '/editorial-policy/'],
    ['/home-tech/gaming-pcs/', '/home-tech/'],
    ['/home-tech/laptops/', '/home-tech/'],
    ['/home-tech/streaming-tvs/', '/home-tech/'],
    ['/cooking/baking/', '/kitchen/'],
    ['/make-do-lab/cleaning/', '/home/'],
  ]);
  for (const [from, to] of expected) {
    const result = taxonomy.resolveTargetRoute(from);
    assert.equal(result.outcome, 'redirect', from);
    assert.equal(result.canonicalRoute, to, from);
    assert.equal(result.implemented, true, from);
    assert.equal(result.redirectChain.length, 1, from);
  }
  for (const route of ['/science/', '/glossary/', '/math/']) {
    const result = taxonomy.resolveTargetRoute(route);
    assert.equal(result.outcome, 'terminal');
    assert.deepEqual(result.allowedStatuses, [404, 410]);
    assert.equal(result.implemented, true);
  }
  assert.deepEqual(taxonomy.findTargetRedirectChains(), []);
});

test('compatibility lookups are active but do not invent editorial categories', () => {
  assert.deepEqual(taxonomy.targetCategoryFor('make-do'), { categoryId: 'home', implemented: true });
  assert.deepEqual(taxonomy.targetCategoryFor('cook'), { categoryId: 'kitchen', implemented: true });
  assert.deepEqual(taxonomy.targetCategoryFor('buying-guides'), { categoryId: 'shop', implemented: true });
  assert.equal(taxonomy.targetCategoryFor('research-writing'), null);
  assert.deepEqual(taxonomy.targetTopicFor('home-tech/gaming-pcs'), {
    categoryId: 'home-tech', topicId: 'computers-laptops', implemented: true,
  });
});

test('registry discovers exactly three source-owned, publishable records', () => {
  assert.deepEqual(registry.map(({ route }) => route), [
    '/articles/how-does-baking-powder-work/',
    '/articles/why-are-some-answers-better-than-others/',
    '/articles/why-salt-melts-ice/',
  ]);
  assert.deepEqual(registry.map(({ categoryId, topicId, articleType }) => [categoryId, topicId, articleType]), [
    ['kitchen', 'food-science', 'guide'],
    [null, null, 'editorial-standard'],
    ['home', 'heating-cooling', 'guide'],
  ]);
  for (const record of registry) {
    assert.equal(record.searchEligible, true);
    assert.equal(record.feedEligible, true);
    assert.equal(record.sitemapEligible, true);
    assert.equal(record.llmsEligible, true);
    assert.equal(record.provenance.categoryId, 'canonical-source-metadata');
    assert.equal(record.sourceNotes.state, 'structured');
    assert.ok(record.sourceNotes.items.length > 0);
    assert.equal(record.disclosure.state, 'no-paid-links');
  }
  assert.equal(isPublishableGuide(bySlug['why-salt-melts-ice']), true);
  assert.equal(isPublishableGuide(bySlug['why-are-some-answers-better-than-others']), false);
});

test('current data exposes only two category filters and no standalone topic pages', () => {
  assert.equal(topicPublicationModeForRegistry({ registry, categoryId: 'home', topicId: 'heating-cooling', taxonomy }), 'filter');
  assert.equal(topicPublicationModeForRegistry({ registry, categoryId: 'kitchen', topicId: 'food-science', taxonomy }), 'filter');
  assert.equal(topicPublicationModeForRegistry({ registry, categoryId: 'home-tech', topicId: 'wifi-routers', taxonomy }), 'hidden');
  assert.throws(() => topicPublicationModeForRegistry({ registry, categoryId: 'home-tech', topicId: 'not-real', taxonomy }), /Unknown topic/);
});

test('homepage, latest, featured, and related ordering are deterministic', () => {
  assert.deepEqual(orderLatestContent(registry).map(({ slug }) => slug), [
    'why-salt-melts-ice',
    'how-does-baking-powder-work',
    'why-are-some-answers-better-than-others',
  ]);
  assert.deepEqual(orderFeaturedContent(registry).map(({ slug }) => slug), ['why-salt-melts-ice']);
  assert.deepEqual(orderHomepageContent(registry).map(({ slug }) => slug), [
    'why-salt-melts-ice',
    'how-does-baking-powder-work',
    'why-are-some-answers-better-than-others',
  ]);
  assert.deepEqual(selectRelatedContent(bySlug['why-salt-melts-ice'], registry, 3).map(({ slug }) => slug), [
    'how-does-baking-powder-work',
    'why-are-some-answers-better-than-others',
  ]);
});

test('normalizer rejects unclassified, unsafe, or contradictory records', () => {
  const source = sources.find(({ route }) => route === '/articles/why-salt-melts-ice/');
  assert.throws(() => createPublicContentRegistry({ sources: [{ ...source, topicId: 'not-real' }], taxonomy }), /unknown topic/i);
  assert.throws(() => createPublicContentRegistry({ sources: [{ ...source, answerSummary: '' }], taxonomy }), /direct answer summary/i);
  assert.throws(() => createPublicContentRegistry({ sources: [{ ...source, evidence: 'Theoretical' }], taxonomy }), /unsupported evidence label/i);
  assert.throws(() => createPublicContentRegistry({ sources: [{ ...source, draft: true, featured: true }], taxonomy }), /featured content cannot be draft/i);
  assert.throws(() => createPublicContentRegistry({ sources: [{ ...source, disclosure: { state: 'affiliate' } }], taxonomy }), /unsupported disclosure state/i);
});

test('price and product evidence states stay strict for later shopping phases', () => {
  assert.deepEqual(assertValidPriceBadgeProps({ state: 'observed', observedAt: '2026-07-18' }), { state: 'observed', observedAt: '2026-07-18' });
  assert.throws(() => assertValidPriceBadgeProps({ state: 'observed' }), /observation date/);
  assert.throws(() => assertValidPriceBadgeProps({ state: 'estimate', observedAt: '2026-07-18' }), /must not claim/);
  assert.doesNotThrow(() => assertValidProductEvidence({
    name: 'Example', description: 'A real product description', priceState: 'unavailable',
  }));
  assert.throws(() => assertValidProductEvidence({
    name: 'Example', description: 'A real product description', priceState: 'observed', price: '$10',
  }), /require price, observedAt, and source evidence/);
});

test('legacy adapters are absent from the source tree', () => {
  assert.equal(existsSync(path.join(root, 'src/data/site-taxonomy.mjs')), false);
  assert.equal(existsSync(path.join(root, 'src/lib/public-content/classification-manifest.mjs')), false);
  assert.doesNotMatch(readFileSync(path.join(root, 'astro.config.mjs'), 'utf8'), /starlight|sitemap\(/i);
});
