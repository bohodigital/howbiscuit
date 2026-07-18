import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadTypeScriptModule } from '../scripts/lib/load-typescript-module.mjs';
import {
  createPublicContentRegistry,
  isPublishableGuide,
  orderFeaturedContent,
  orderLatestContent,
  selectRelatedContent,
  topicPublicationModeForRegistry,
} from '../src/lib/public-content/model.mjs';
import { discoverTrackedArticleSources } from '../src/lib/public-content/source-adapter.mjs';
import { ACCEPTED_PHASE_A_DOCUMENT_ROUTES } from '../src/lib/search/pagefind-policy.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const taxonomy = await loadTypeScriptModule(path.join(root, 'src', 'config', 'public-taxonomy.ts'));
const sources = discoverTrackedArticleSources(root);
const registry = createPublicContentRegistry({
  sources,
  taxonomy,
});

const expectedTopics = {
  'home-tech': [
    'wifi-routers',
    'computers-laptops',
    'smart-home',
    'tvs-streaming',
    'privacy-security',
    'power-cooling-storage',
  ],
  home: [
    'repairs-maintenance',
    'apartment-comfort',
    'heating-cooling',
    'cleaning',
    'tools-materials',
    'utilities-energy',
  ],
  kitchen: [
    'kitchen-appliances',
    'cookware-tools',
    'food-science',
    'ingredient-substitutions',
    'cheap-meals',
    'troubleshooting-safety',
  ],
  shop: [
    'product-comparisons',
    'local-prices',
    'used-refurbished',
    'total-cost-ownership',
    'deals-worth-considering',
    'products-to-avoid',
    'product-index',
  ],
  tools: [
    'calculators',
    'converters',
    'price-checkers',
    'checklists',
    'decision-tools',
    'templates',
  ],
};

const expectedArticleRoutes = [
  '/articles/how-does-baking-powder-work/',
  '/articles/why-are-some-answers-better-than-others/',
  '/articles/why-salt-melts-ice/',
];

test('target taxonomy is exact, unique, ordered, descriptive, and explicitly unimplemented', () => {
  assert.deepEqual(taxonomy.PUBLIC_CATEGORIES.map(({ id }) => id), [
    'home-tech',
    'home',
    'kitchen',
    'shop',
    'tools',
  ]);
  assert.deepEqual(taxonomy.PUBLIC_CATEGORIES.map(({ label }) => label), [
    'Home Tech',
    'Home & Apartment',
    'Kitchen',
    'Shop Smarter',
    'Tools',
  ]);
  assert.deepEqual(taxonomy.PUBLIC_CATEGORIES.map(({ route }) => route), [
    '/home-tech/',
    '/home/',
    '/kitchen/',
    '/shop/',
    '/tools/',
  ]);

  const categoryIds = new Set();
  const categoryRoutes = new Set();
  const topicRefs = new Set();
  const topicRoutes = new Set();
  for (const [index, category] of taxonomy.PUBLIC_CATEGORIES.entries()) {
    assert.equal(category.order, index + 1);
    assert.equal(category.implemented, false);
    assert.ok(category.description.length >= 40);
    assert.ok(category.metadata.title.length > 0);
    assert.ok(category.metadata.description.length >= 40);
    assert.ok(category.artworkId.length > 0);
    assert.ok(!categoryIds.has(category.id), `duplicate category ID ${category.id}`);
    assert.ok(!categoryRoutes.has(category.route), `duplicate category route ${category.route}`);
    categoryIds.add(category.id);
    categoryRoutes.add(category.route);
    assert.deepEqual(category.topics.map(({ id }) => id), expectedTopics[category.id]);

    for (const [topicIndex, topic] of category.topics.entries()) {
      const ref = `${category.id}/${topic.id}`;
      assert.equal(topic.order, topicIndex + 1);
      assert.equal(topic.categoryId, category.id);
      assert.equal(topic.implemented, false);
      assert.equal(topic.publicationPolicy, 'threshold-gated');
      assert.ok(topic.description.length >= 40);
      assert.ok(!topicRefs.has(ref), `duplicate topic reference ${ref}`);
      assert.ok(!topicRoutes.has(topic.route), `duplicate topic route ${topic.route}`);
      topicRefs.add(ref);
      topicRoutes.add(topic.route);
    }
  }
  assert.equal(topicRefs.size, 31);
  assert.equal(taxonomy.ALL_GUIDES_TARGET.route, '/articles/');
  assert.equal(taxonomy.ALL_GUIDES_TARGET.label, 'All Guides');
  assert.equal(taxonomy.ALL_GUIDES_TARGET.implemented, false);
  assert.deepEqual(taxonomy.ALL_GUIDES_TARGET.baselineLabels, ['All Articles', 'Articles']);
});

test('topic threshold is centralized, configurable only as a contiguous policy, and rejects bad input', () => {
  assert.deepEqual(taxonomy.TOPIC_PUBLICATION_THRESHOLDS, {
    hiddenMaximum: 0,
    filterMinimum: 1,
    filterMaximum: 2,
    standaloneMinimum: 3,
  });
  assert.equal(taxonomy.topicPublicationMode(0), 'hidden');
  assert.equal(taxonomy.topicPublicationMode(1), 'filter');
  assert.equal(taxonomy.topicPublicationMode(2), 'filter');
  assert.equal(taxonomy.topicPublicationMode(3), 'standalone');
  assert.equal(taxonomy.topicPublicationMode(20), 'standalone');
  assert.throws(() => taxonomy.topicPublicationMode(-1), /non-negative integer/);
  assert.throws(() => taxonomy.topicPublicationMode(1.5), /non-negative integer/);
  assert.throws(() => taxonomy.topicPublicationMode(2, {
    hiddenMaximum: 0,
    filterMinimum: 2,
    filterMaximum: 3,
    standaloneMinimum: 4,
  }), /contiguous/);
});

test('compatibility functions expose target mappings without claiming current implementation', () => {
  assert.deepEqual(taxonomy.targetCategoryFor('make-do'), {
    categoryId: 'home',
    implemented: false,
  });
  assert.deepEqual(taxonomy.targetCategoryFor('cook'), {
    categoryId: 'kitchen',
    implemented: false,
  });
  assert.deepEqual(taxonomy.targetCategoryFor('buying-guides'), {
    categoryId: 'shop',
    implemented: false,
  });
  assert.equal(taxonomy.targetCategoryFor('research-writing'), null);
  assert.deepEqual(taxonomy.targetTopicFor('home-tech/gaming-pcs'), {
    categoryId: 'home-tech',
    topicId: 'computers-laptops',
    implemented: false,
  });
  assert.deepEqual(taxonomy.targetTopicFor('home-tech/laptops'), {
    categoryId: 'home-tech',
    topicId: 'computers-laptops',
    implemented: false,
  });
  assert.deepEqual(taxonomy.targetTopicFor('home-tech/streaming-tvs'), {
    categoryId: 'home-tech',
    topicId: 'tvs-streaming',
    implemented: false,
  });
  assert.equal(taxonomy.targetTopicFor('home-diy/organization-storage'), null);
});

test('observed baseline and target route resolvers cannot be confused', () => {
  assert.deepEqual(
    taxonomy.OBSERVED_ROUTE_CONTRACTS
      .filter(({ outcome }) => outcome === 'serve')
      .map(({ route }) => route)
      .sort(),
    [...ACCEPTED_PHASE_A_DOCUMENT_ROUTES].sort(),
  );

  const baselineMakeDo = taxonomy.resolveObservedRoute('/make-do/');
  assert.equal(baselineMakeDo.outcome, 'serve');
  assert.equal(baselineMakeDo.status, 200);
  assert.equal(baselineMakeDo.canonicalRoute, '/make-do/');
  assert.equal(baselineMakeDo.evidence, 'built-and-live');

  const targetMakeDo = taxonomy.resolveTargetRoute('/make-do/');
  assert.equal(targetMakeDo.outcome, 'redirect');
  assert.equal(targetMakeDo.redirectCode, 301);
  assert.equal(targetMakeDo.canonicalRoute, '/home/');
  assert.equal(targetMakeDo.implemented, false);

  const migrations = new Map([
    ['/cook/', '/kitchen/'],
    ['/buying-guides/', '/shop/'],
    ['/research-writing/', '/editorial-policy/'],
    ['/home-tech/gaming-pcs/', '/home-tech/computers-laptops/'],
    ['/home-tech/laptops/', '/home-tech/computers-laptops/'],
    ['/home-tech/streaming-tvs/', '/home-tech/tvs-streaming/'],
    ['/cooking/baking/', '/kitchen/baking/'],
    ['/make-do-lab/cleaning/', '/home/cleaning/'],
  ]);
  for (const [from, to] of migrations) {
    const resolution = taxonomy.resolveTargetRoute(from);
    assert.equal(resolution.canonicalRoute, to, from);
    assert.equal(resolution.implemented, false, from);
  }

  for (const route of expectedArticleRoutes) {
    const observed = taxonomy.resolveObservedRoute(route);
    const target = taxonomy.resolveTargetRoute(route);
    assert.equal(observed.canonicalRoute, route);
    assert.equal(observed.status, 200);
    assert.equal(target.canonicalRoute, route);
    assert.equal(target.outcome, 'preserve');
    assert.equal(target.implemented, false);
  }

  for (const route of ['/science/', '/glossary/', '/math/']) {
    const result = taxonomy.resolveTargetRoute(route);
    assert.equal(result.outcome, 'terminal');
    assert.equal(result.status, null);
    assert.deepEqual(result.allowedStatuses, [404, 410]);
    assert.equal(result.implemented, false);
  }
  assert.deepEqual(taxonomy.findTargetRedirectChains(), []);
});

test('host contract records the www source/live mismatch and the unimplemented target', () => {
  assert.equal(taxonomy.HOST_CONTRACT.host, 'www.howbiscuit.com');
  assert.deepEqual(taxonomy.HOST_CONTRACT.sourceDeclared, {
    outcome: 'redirect',
    code: 301,
    destinationHost: 'howbiscuit.com',
  });
  assert.deepEqual(taxonomy.HOST_CONTRACT.liveObserved, {
    outcome: 'serve',
    status: 200,
    canonicalHost: 'howbiscuit.com',
  });
  assert.deepEqual(taxonomy.HOST_CONTRACT.target, {
    outcome: 'redirect',
    code: 301,
    destinationHost: 'howbiscuit.com',
    implemented: false,
  });
});

test('source adapter discovers each real tracked article once and ignores generated outputs', () => {
  assert.deepEqual(sources.map(({ route }) => route), expectedArticleRoutes);
  assert.deepEqual(sources.map(({ sourceKind }) => sourceKind), ['mdx', 'mdx', 'latex']);
  assert.equal(new Set(sources.map(({ route }) => route)).size, 3);
  assert.ok(sources.every(({ sourcePath }) => !sourcePath.includes('src/generated/')));
  assert.ok(sources.every(({ sourcePath }) => sourcePath !== 'src/content/docs/articles/why-salt-melts-ice.mdx'));
});

test('accepted classifications are owned by canonical article sources', () => {
  for (const source of sources) {
    assert.ok(['guide', 'editorial-standard'].includes(source.articleType), source.route);
    assert.ok(Number.isInteger(source.editorialPriority), source.route);
    assert.ok(source.editorialClassification, source.route);
  }
  assert.throws(() => createPublicContentRegistry({
    sources: [{ ...sources[0], articleType: null }],
    taxonomy,
  }), /unsupported article type/i);
});

test('normalized model derives source facts and applies the deliberate three-article classification', () => {
  assert.equal(registry.length, 3);
  const salt = registry.find(({ slug }) => slug === 'why-salt-melts-ice');
  const baking = registry.find(({ slug }) => slug === 'how-does-baking-powder-work');
  const editorial = registry.find(({ slug }) => slug === 'why-are-some-answers-better-than-others');

  assert.equal(salt.route, '/articles/why-salt-melts-ice/');
  assert.equal(salt.categoryId, 'home');
  assert.equal(salt.topicId, 'heating-cooling');
  assert.equal(salt.articleType, 'guide');
  assert.equal(salt.articleFormat, 'latex');
  assert.equal(salt.publishedDate, '2026-07-13');
  assert.equal(salt.feedEligible, true);
  assert.equal(salt.searchEligible, true);
  assert.equal(salt.sitemapEligible, true);
  assert.equal(salt.llmsEligible, true);

  assert.equal(baking.categoryId, 'kitchen');
  assert.equal(baking.topicId, 'food-science');
  assert.equal(baking.articleFormat, 'standard');
  assert.equal(editorial.categoryId, null);
  assert.equal(editorial.topicId, null);
  assert.equal(editorial.articleType, 'editorial-standard');
  assert.equal(editorial.editorialClassification, 'editorial-standard');

  for (const article of registry) {
    assert.ok(article.title.length > 0);
    assert.ok(article.description.length >= 40);
    assert.ok(article.readTime);
    assert.ok(article.evidence);
    assert.deepEqual(article.testing, { state: 'not-declared', notes: [] });
    assert.deepEqual(article.sourceNotes, { state: 'legacy-body', items: [] });
    assert.deepEqual(article.relatedContent, { state: 'legacy-body', routes: [] });
    assert.deepEqual(article.disclosure, { state: 'not-declared' });
    assert.equal(article.editorialPriority, 0);
    assert.equal(article.draft, false);
    assert.equal(article.preview, false);
    assert.equal(article.thin, false);
    assert.equal(article.redirectState, null);
    assert.equal(article.retirementState, null);
    assert.equal(article.provenance.title, 'source');
    assert.equal(article.provenance.categoryId, 'source');
  }
});

test('topic counts use publishable guides only and distinguish current data from target visibility', () => {
  assert.equal(topicPublicationModeForRegistry({
    registry,
    categoryId: 'home',
    topicId: 'heating-cooling',
    taxonomy,
  }), 'filter');
  assert.equal(topicPublicationModeForRegistry({
    registry,
    categoryId: 'kitchen',
    topicId: 'food-science',
    taxonomy,
  }), 'filter');
  assert.equal(topicPublicationModeForRegistry({
    registry,
    categoryId: 'home-tech',
    topicId: 'wifi-routers',
    taxonomy,
  }), 'hidden');
  assert.throws(() => topicPublicationModeForRegistry({
    registry,
    categoryId: 'home-tech',
    topicId: 'not-real',
    taxonomy,
  }), /unknown topic/i);

  const salt = registry.find(({ slug }) => slug === 'why-salt-melts-ice');
  assert.equal(isPublishableGuide(salt), true);
  assert.equal(isPublishableGuide({ ...salt, draft: true, searchEligible: false }), false);
  assert.equal(isPublishableGuide({ ...salt, preview: true, searchEligible: false }), false);
  assert.equal(isPublishableGuide({ ...salt, thin: true, searchEligible: false }), false);
  assert.equal(isPublishableGuide({ ...salt, redirectState: { to: '/home/' }, searchEligible: false }), false);
  assert.equal(isPublishableGuide({ ...salt, retirementState: { allowedStatuses: [404, 410] }, searchEligible: false }), false);
});

test('ordering and related selection are immutable and deterministic on explicit synthetic edges', () => {
  const originalRoutes = registry.map(({ route }) => route);
  assert.deepEqual(orderLatestContent(registry).map(({ slug }) => slug), [
    'why-salt-melts-ice',
    'how-does-baking-powder-work',
    'why-are-some-answers-better-than-others',
  ]);
  assert.deepEqual(orderFeaturedContent(registry), []);
  assert.deepEqual(registry.map(({ route }) => route), originalRoutes);

  const salt = registry.find(({ slug }) => slug === 'why-salt-melts-ice');
  const baking = registry.find(({ slug }) => slug === 'how-does-baking-powder-work');
  const editorial = registry.find(({ slug }) => slug === 'why-are-some-answers-better-than-others');
  const explicit = {
    ...salt,
    relatedContent: {
      state: 'structured',
      routes: [editorial.route, baking.route, editorial.route],
    },
  };
  assert.deepEqual(selectRelatedContent(explicit, registry, 3).map(({ route }) => route), [
    editorial.route,
    baking.route,
  ]);

  const sameTopic = {
    ...salt,
    route: '/articles/synthetic-same-topic/',
    slug: 'synthetic-same-topic',
    relatedContent: { state: 'structured', routes: [] },
  };
  assert.deepEqual(selectRelatedContent(sameTopic, registry, 2).map(({ route }) => route), [salt.route]);
});

test('normalizer invariants reject contradictory or unclassified records', () => {
  const saltSource = sources.find(({ route }) => route === '/articles/why-salt-melts-ice/');
  assert.throws(() => createPublicContentRegistry({
    sources: [{ ...saltSource, draft: true, featured: true }],
    taxonomy,
  }), /featured content cannot be draft/i);
  assert.throws(() => createPublicContentRegistry({
    sources: [{ ...saltSource, feed: true, publishedDate: null }],
    taxonomy,
  }), /feed content requires/i);
  assert.throws(() => createPublicContentRegistry({
    sources: [{ ...saltSource, topicId: 'not-real' }],
    taxonomy,
  }), /unknown topic/i);

  const exclusionCases = [
    { draft: true },
    { preview: true },
    { thin: true },
    { redirectState: { to: '/home/' } },
    { retirementState: { allowedStatuses: [404, 410] } },
  ];
  for (const exclusion of exclusionCases) {
    const [record] = createPublicContentRegistry({
      sources: [{ ...saltSource, ...exclusion }],
      taxonomy,
    });
    assert.equal(record.feedEligible, false);
    assert.equal(record.searchEligible, false);
    assert.equal(record.sitemapEligible, false);
    assert.equal(record.llmsEligible, false);
  }
});

test('baseline tracker identities and public /guides/ absence are checked as exact source sets', () => {
  const astroConfig = readFileSync(path.join(root, 'astro.config.mjs'), 'utf8');
  const baseLayout = readFileSync(path.join(root, 'src', 'layouts', 'BaseLayout.astro'), 'utf8');
  assert.deepEqual(
    baseLayout.match(/https:\/\/analytics\.bohodigitalservices\.com\/script\.js/g),
    ['https://analytics.bohodigitalservices.com/script.js'],
  );
  assert.deepEqual(
    baseLayout.match(/fefef93c-b1d6-4d04-95d3-064af3d38a41/g),
    ['fefef93c-b1d6-4d04-95d3-064af3d38a41'],
  );
  assert.deepEqual(
    baseLayout.match(/https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-NG0NQMVFEH/g),
    ['https://www.googletagmanager.com/gtag/js?id=G-NG0NQMVFEH'],
  );
  assert.equal((baseLayout.match(/gtag\('config', 'G-NG0NQMVFEH'/g) ?? []).length, 1);
  assert.equal((astroConfig.match(/site: 'https:\/\/howbiscuit\.com'/g) ?? []).length, 1);
  assert.equal((baseLayout.match(/property="og:image"/g) ?? []).length, 1);
  assert.equal((baseLayout.match(/name="twitter:image"/g) ?? []).length, 1);
  assert.equal((baseLayout.match(/name="twitter:card" content="summary_large_image"/g) ?? []).length, 1);
  assert.equal((baseLayout.match(/image = '\/og\.png'/g) ?? []).length, 1);

  const publicSourcePaths = execFileSync('git', [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '--',
    'astro.config.mjs',
    'public',
    'src/components',
    'src/content',
    'src/layouts',
    'src/pages',
  ], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
  const guidesRoutePattern = /(?:href|slug|route|link|canonical)\s*[:=]\s*["']\/guides\//;
  const offenders = publicSourcePaths.filter((relativePath) => {
    const absolutePath = path.join(root, relativePath);
    return existsSync(absolutePath) && guidesRoutePattern.test(readFileSync(absolutePath, 'utf8'));
  });
  assert.deepEqual(offenders, []);
});
