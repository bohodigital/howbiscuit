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
  createPublicSiteRegistry,
  isPublishableGuide,
  isPublishablePublicRecord,
  orderFeaturedContent,
  orderHomepageContent,
  orderLatestContent,
  selectRelatedContent,
  topicMigrationDestinationForRegistry,
  topicNavigationDestinationForRegistry,
  topicPublicationModeForRegistry,
  topicRedirectExpectationsForRegistry,
} from '../src/lib/public-content/model.mjs';
import { discoverTrackedPublicSources } from '../src/lib/public-content/source-adapter.mjs';
import { createPublicPageCatalog } from '../src/lib/public-content/site-registry.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const taxonomy = await loadTypeScriptModule(path.join(root, 'src/config/public-taxonomy.ts'));
const publicSources = discoverTrackedPublicSources(root, { taxonomy });
const sources = publicSources.filter(({ kind }) => kind === 'article');
const registry = createPublicContentRegistry({ sources, taxonomy });
const publicRegistry = createPublicSiteRegistry({ sources: publicSources, taxonomy });
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
  assert.deepEqual(taxonomy.PUBLIC_CATEGORIES.map(({ id, topics: categoryTopics }) => [
    id,
    categoryTopics.map(({ id: topicId }) => topicId),
  ]), [
    ['home-tech', ['wifi-routers', 'computers-laptops', 'smart-home', 'tvs-streaming', 'privacy-security', 'power-cooling-storage']],
    ['home', ['repairs-maintenance', 'apartment-comfort', 'heating-cooling', 'cleaning', 'tools-materials', 'utilities-energy']],
    ['kitchen', ['kitchen-appliances', 'cookware-tools', 'food-science', 'ingredient-substitutions', 'cheap-meals', 'troubleshooting-safety']],
    ['shop', ['product-comparisons', 'local-prices', 'used-refurbished', 'total-cost-ownership', 'deals-worth-considering', 'products-to-avoid', 'product-index']],
    ['tools', ['calculators', 'converters', 'price-checkers', 'checklists', 'decision-tools', 'templates']],
  ]);
  const topicRefs = topics.map(({ categoryId, id }) => `${categoryId}/${id}`);
  assert.equal(new Set(topicRefs).size, topics.length);
  for (const category of taxonomy.PUBLIC_CATEGORIES) {
    category.topics.forEach((topic, index) => {
      assert.equal(topic.categoryId, category.id);
      assert.equal(topic.route, `/${category.id}/${topic.id}/`);
      assert.equal(topic.order, index + 1);
    });
  }
  assert.ok(taxonomy.PUBLIC_CATEGORIES.every(({ implemented }) => implemented === true));
  assert.ok(topics.every(({ implemented, publicationPolicy }) => implemented === true && publicationPolicy === 'threshold-gated'));
  assert.deepEqual(taxonomy.ALL_GUIDES_TARGET, {
    route: '/articles/',
    label: 'All Guides',
    baselineLabels: ['All Articles', 'Articles'],
    implemented: true,
  });
  assert.deepEqual(taxonomy.TOPIC_REDIRECT_MIGRATIONS, [
    { from: '/home-tech/gaming-pcs/', topicRef: 'home-tech/gaming-pcs' },
    { from: '/home-tech/laptops/', topicRef: 'home-tech/laptops' },
    { from: '/home-tech/streaming-tvs/', topicRef: 'home-tech/streaming-tvs' },
    { from: '/home-tech/wifi-routers/', topicRef: 'home-tech/wifi-routers' },
    { from: '/home-tech/smart-home/', topicRef: 'home-tech/smart-home' },
    { from: '/home-tech/privacy-security/', topicRef: 'home-tech/privacy-security' },
  ]);
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

  const migrationRecord = readFileSync(
    path.join(root, 'docs/handoffs/HOWBISCUIT-HANDOFF1-CONTENT-ROUTES.md'),
    'utf8',
  );
  assert.match(
    migrationRecord,
    /\| Previous or requested route \| New route or terminal status \| Redirect code \| Canonical destination \| Sitemap \| Pagefind \| Reason \|/,
  );
  const documentedRoutes = new Set([
    ...taxonomy.TARGET_ROUTE_CONTRACTS.map(({ route }) => route),
    ...publicRegistry.map(({ route }) => route),
  ]);
  for (const route of documentedRoutes) {
    assert.ok(migrationRecord.includes(`| \`${route}\` |`), `The migration record is missing ${route}`);
  }
  assert.ok(migrationRecord.includes('| `https://www.howbiscuit.com/*` |'));
});

test('the deployed redirect artifact and Worker exactly match the direct Phase C matrix', async () => {
  const expected = [
    ['/make-do/', '/home/', '301'],
    ['/cook/', '/kitchen/', '301'],
    ['/buying-guides/', '/shop/', '301'],
    ['/research-writing/', '/editorial-policy/', '301'],
    ['/home-tech/gaming-pcs/', '/home-tech/', '301'],
    ['/home-tech/laptops/', '/home-tech/', '301'],
    ['/home-tech/streaming-tvs/', '/home-tech/', '301'],
    ['/home-tech/wifi-routers/', '/home-tech/', '301'],
    ['/home-tech/smart-home/', '/home-tech/', '301'],
    ['/home-tech/privacy-security/', '/home-tech/', '301'],
    ['/cooking/*', '/kitchen/', '301'],
    ['/make-do-lab/*', '/home/', '301'],
  ];
  const actual = readFileSync(path.join(root, 'public/_redirects'), 'utf8')
    .trim().split(/\r?\n/).filter(Boolean).map((line) => line.split(/\s+/));
  assert.deepEqual(actual, expected);
  const redirectSource = readFileSync(path.join(root, 'public/_redirects'), 'utf8');
  const rules = taxonomy.parseSitesRedirectRules(redirectSource);
  const exactTargets = new Map(actual.flatMap(([from, to]) => (
    from.startsWith('/') && !from.includes('*') ? [[from, to]] : []
  )));
  assert.deepEqual([...exactTargets].filter(([, to]) => exactTargets.has(to)), []);

  const workerSource = taxonomy.buildSitesWorkerSource(redirectSource);
  const workerModule = await import(`data:text/javascript;base64,${Buffer.from(workerSource).toString('base64')}`);
  const env = { ASSETS: { fetch: () => new Response('asset', { status: 200 }) } };
  async function assertSingleHop(requestUrl, expectedLocation) {
    const response = await workerModule.default.fetch(new Request(requestUrl), env);
    assert.equal(response.status, 301, requestUrl);
    assert.equal(response.headers.get('location'), expectedLocation, requestUrl);
    const follow = await workerModule.default.fetch(new Request(expectedLocation), env);
    assert.equal(follow.status, 200, `${requestUrl} must terminate after one redirect`);
    assert.equal(follow.headers.get('location'), null, `${requestUrl} must not redirect twice`);
  }
  for (const { from, to } of rules) {
    const sourcePath = from.replace('*', 'contract-probe/');
    await assertSingleHop(`https://howbiscuit.com${sourcePath}?ref=contract`, `https://howbiscuit.com${to}?ref=contract`);
    await assertSingleHop(`https://www.howbiscuit.com${sourcePath}?ref=contract`, `https://howbiscuit.com${to}?ref=contract`);
  }
  await assertSingleHop(
    'https://www.howbiscuit.com/articles/?ref=contract',
    'https://howbiscuit.com/articles/?ref=contract',
  );
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

test('one normalized public registry owns every document and eligibility decision', () => {
  assert.deepEqual(
    publicRegistry.filter(({ kind }) => kind !== 'topic').map(({ route }) => route),
    publicSources.map(({ route }) => route).sort(),
  );
  assert.ok(publicRegistry.every(({ searchEligible, sitemapEligible, llmsEligible }) => (
    searchEligible === true && sitemapEligible === true && llmsEligible === true
  )));
  assert.deepEqual(publicRegistry.map(({ kind }) => kind), [
    'home', 'trust', 'trust', 'guide-index', 'article', 'article', 'article', 'trust',
    'trust', 'trust', 'category', 'category', 'category', 'trust', 'category', 'category',
  ]);
  const privacy = publicRegistry.find(({ route }) => route === '/privacy/');
  assert.equal(privacy.updatedDate, null);
  assert.equal(privacy.publishedDate, null);
  assert.equal(privacy.provenance.eligibility, 'normalized-source-state');
});

test('runtime route eligibility fails closed for every nonpublishable state', () => {
  const record = publicRegistry.find(({ route }) => route === '/articles/why-salt-melts-ice/');
  assert.equal(isPublishablePublicRecord(record), true);
  for (const excluded of [
    { draft: true, searchEligible: false, sitemapEligible: false, llmsEligible: false },
    { preview: true, searchEligible: false, sitemapEligible: false, llmsEligible: false },
    { thin: true, searchEligible: false, sitemapEligible: false, llmsEligible: false },
    { redirectState: { to: '/home/' }, searchEligible: false, sitemapEligible: false, llmsEligible: false },
    { retirementState: { allowedStatuses: [404, 410] }, searchEligible: false, sitemapEligible: false, llmsEligible: false },
  ]) {
    assert.equal(isPublishablePublicRecord({ ...record, ...excluded }), false);
  }
  const draftRecord = {
    ...record,
    route: '/articles/draft-probe/',
    draft: true,
    searchEligible: false,
    sitemapEligible: false,
    llmsEligible: false,
  };
  const catalog = createPublicPageCatalog([
    { id: 'articles/why-salt-melts-ice.mdx', data: { kind: 'article' } },
    { id: 'articles/draft-probe.mdx', data: { kind: 'article' } },
  ], { publicRegistry: [record, draftRecord] });
  assert.deepEqual(catalog.map(({ route }) => route), ['/articles/why-salt-melts-ice/']);
  const routeSource = readFileSync(path.join(root, 'src/pages/[...slug].astro'), 'utf8');
  assert.match(routeSource, /return createPublicPageCatalog\(entries, siteData\)\.map/);
  assert.doesNotMatch(routeSource, /const pages[^=]*= entries\.map/);
});

test('current data exposes only two category filters and no standalone topic pages', () => {
  assert.equal(topicPublicationModeForRegistry({ registry, categoryId: 'home', topicId: 'heating-cooling', taxonomy }), 'filter');
  assert.equal(topicPublicationModeForRegistry({ registry, categoryId: 'kitchen', topicId: 'food-science', taxonomy }), 'filter');
  assert.equal(topicPublicationModeForRegistry({ registry, categoryId: 'home-tech', topicId: 'wifi-routers', taxonomy }), 'hidden');
  assert.throws(() => topicPublicationModeForRegistry({ registry, categoryId: 'home-tech', topicId: 'not-real', taxonomy }), /Unknown topic/);
  assert.equal(topicMigrationDestinationForRegistry({
    legacyRef: 'home-tech/streaming-tvs', registry, taxonomy,
  }), '/home-tech/');
  const template = registry.find(({ articleType }) => articleType === 'guide');
  const withThreeGuides = (categoryId, topicId) => [0, 1, 2].reduce((items, index) => ([...items, {
    ...template,
    route: `/articles/${categoryId}-${topicId}-threshold-${index}/`,
    slug: `${categoryId}-${topicId}-threshold-${index}`,
    categoryId,
    topicId,
  }]), registry);
  const withThreeStreamingGuides = withThreeGuides('home-tech', 'tvs-streaming');
  assert.equal(topicMigrationDestinationForRegistry({
    legacyRef: 'home-tech/streaming-tvs', registry: withThreeStreamingGuides, taxonomy,
  }), '/home-tech/tvs-streaming/');
  assert.equal(topicNavigationDestinationForRegistry({
    registry,
    categoryId: 'home',
    topicId: 'heating-cooling',
    taxonomy,
  }), '/home/#topic-heating-cooling');
  assert.equal(topicNavigationDestinationForRegistry({
    registry: withThreeStreamingGuides,
    categoryId: 'home-tech',
    topicId: 'tvs-streaming',
    taxonomy,
  }), '/home-tech/tvs-streaming/');

  assert.deepEqual(
    topicRedirectExpectationsForRegistry({ registry, taxonomy }).map(({ from, destination }) => [from, destination]),
    taxonomy.TOPIC_REDIRECT_MIGRATIONS.map(({ from }) => [from, '/home-tech/']),
  );
  for (const migration of taxonomy.TOPIC_REDIRECT_MIGRATIONS) {
    const target = taxonomy.targetTopicFor(migration.topicRef);
    assert.ok(target, migration.topicRef);
    const category = taxonomy.PUBLIC_CATEGORIES.find(({ id }) => id === target.categoryId);
    const topic = category.topics.find(({ id }) => id === target.topicId);
    const thresholdRegistry = withThreeGuides(target.categoryId, target.topicId);
    const expectation = topicRedirectExpectationsForRegistry({ registry: thresholdRegistry, taxonomy })
      .find(({ from }) => from === migration.from);
    assert.equal(expectation.destination, migration.from === topic.route ? null : topic.route, migration.from);
  }

  const routeSource = readFileSync(path.join(root, 'src/pages/[...slug].astro'), 'utf8');
  const topicBranchStart = routeSource.indexOf(') : page.topic && topicView ? (');
  assert.ok(topicBranchStart >= 0, 'The standalone topic branch is missing.');
  const topicBranch = routeSource.slice(topicBranchStart);
  assert.match(topicBranch, /<h2 id="topic-guides-title">Guides<\/h2>/);
  assert.ok(topicBranch.indexOf('<h2 id="topic-guides-title">') < topicBranch.indexOf('<GuideCard'));
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
  const guideRegistry = registry.filter(isPublishableGuide);
  assert.deepEqual(orderLatestContent(guideRegistry).map(({ slug }) => slug), [
    'why-salt-melts-ice',
    'how-does-baking-powder-work',
  ]);
  assert.deepEqual(orderHomepageContent(guideRegistry).map(({ slug }) => slug), [
    'why-salt-melts-ice',
    'how-does-baking-powder-work',
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
  assert.throws(() => createPublicContentRegistry({ sources: [{
    ...source,
    sourceNotes: { ...source.sourceNotes, items: [{ ...source.sourceNotes.items[0], href: '//user:password@example.test/path' }] },
  }], taxonomy }), /credential-free HTTP\(S\)/i);
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
  assert.doesNotMatch(
    readFileSync(path.join(root, 'src/config/public-taxonomy.ts'), 'utf8'),
    /BASELINE_LEGACY_NAVIGATION|OBSERVED_ROUTE_CONTRACTS|resolveObservedRoute/,
  );
  assert.doesNotMatch(
    readFileSync(path.join(root, 'src/lib/public-content/source-adapter.mjs'), 'utf8'),
    /legacyDivision|legacySubtopic|data\.division|data\.subtopic/,
  );
  assert.doesNotMatch(
    readFileSync(path.join(root, 'src/lib/public-content/model.mjs'), 'utf8'),
    /\blegacy:\s*Object\.freeze/,
  );
});
