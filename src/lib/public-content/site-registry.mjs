import * as taxonomy from '../../config/public-taxonomy.ts';
import { buildPublicNavigation } from './public-navigation.mjs';
import {
  createPublicDocumentRegistry,
  isPublishableGuide,
  orderFeaturedContent,
  orderLatestContent,
  topicPublicationModeForRegistry,
} from './model.mjs';
import { discoverTrackedPublicSources } from './source-adapter.mjs';

function routeFromEntryId(id) {
  const clean = id.replace(/\.(md|mdx)$/, '').replace(/(^|\/)index$/, '');
  return clean ? `/${clean}/` : '/';
}

function buildCategoryViews(registry) {
  return Object.freeze(taxonomy.PUBLIC_CATEGORIES.map((category) => {
    const guides = registry.filter((record) => (
      isPublishableGuide(record) && record.categoryId === category.id
    ));
    const topics = category.topics.flatMap((topic) => {
      const topicGuides = guides.filter(({ topicId }) => topicId === topic.id);
      const mode = topicPublicationModeForRegistry({
        registry,
        categoryId: category.id,
        topicId: topic.id,
        taxonomy,
      });
      return mode === 'hidden' ? [] : [Object.freeze({
        ...topic,
        mode,
        count: topicGuides.length,
        guides: Object.freeze(orderLatestContent(topicGuides)),
      })];
    });
    return Object.freeze({
      ...category,
      topics: Object.freeze(topics),
      guides: Object.freeze(orderLatestContent(guides)),
      featuredGuides: Object.freeze(orderFeaturedContent(guides)),
      latestGuides: Object.freeze(orderLatestContent(guides)),
    });
  }));
}

function buildTopicPageRecords(categoryViews) {
  return Object.freeze(categoryViews.flatMap((category) => (
    category.topics.filter(({ mode }) => mode === 'standalone').map((topic) => Object.freeze({
      kind: 'topic',
      route: topic.route,
      canonicalRoute: topic.route,
      slug: topic.id,
      title: topic.label,
      description: topic.description,
      categoryId: category.id,
      topicId: topic.id,
      articleType: 'topic',
      updatedDate: topic.guides[0]?.updatedDate ?? topic.guides[0]?.publishedDate ?? null,
      publishedDate: null,
      feedEligible: false,
      searchEligible: true,
      sitemapEligible: true,
      llmsEligible: true,
      featured: false,
      editorialPriority: 0,
      draft: false,
      preview: false,
      thin: false,
      redirectState: null,
      retirementState: null,
      legacy: Object.freeze({ sourceKind: 'generated-topic', sourcePath: null }),
      provenance: Object.freeze({
        title: 'taxonomy',
        description: 'taxonomy',
        dates: 'normalized-topic-guides-or-absent',
        eligibility: 'normalized-topic-threshold',
      }),
    }))
  )));
}

let cachedRoot;
let cachedValue;

export function getPublicSiteData(root = process.cwd()) {
  if (cachedValue && cachedRoot === root) return cachedValue;
  const documentRegistry = createPublicDocumentRegistry({
    sources: discoverTrackedPublicSources(root),
    taxonomy,
  });
  const registry = Object.freeze(documentRegistry.filter(({ kind }) => kind === 'article'));
  const categoryViews = buildCategoryViews(registry);
  const publicRegistry = Object.freeze([
    ...documentRegistry,
    ...buildTopicPageRecords(categoryViews),
  ].sort((left, right) => left.route.localeCompare(right.route)));
  const routes = publicRegistry.map(({ route }) => route);
  if (new Set(routes).size !== routes.length) {
    throw new Error(`Duplicate normalized public route: ${routes.join(', ')}`);
  }
  cachedRoot = root;
  cachedValue = Object.freeze({
    taxonomy,
    registry,
    publicRegistry,
    categoryViews,
    navigation: buildPublicNavigation({ taxonomy, categoryViews }),
  });
  return cachedValue;
}

export function createPublicPageCatalog(entries, siteData = getPublicSiteData()) {
  if (!Array.isArray(entries)) throw new Error('Content collection entries are required.');
  const entryByRoute = new Map();
  for (const entry of entries) {
    const route = routeFromEntryId(entry.id);
    if (entryByRoute.has(route)) throw new Error(`Duplicate content collection route: ${route}`);
    entryByRoute.set(route, entry);
  }
  const recordByRoute = new Map(siteData.publicRegistry.map((record) => [record.route, record]));
  for (const [route, entry] of entryByRoute) {
    const record = recordByRoute.get(route);
    if (!record) throw new Error(`Content entry is missing from the normalized public registry: ${route}`);
    if (record.kind !== entry.data.kind) {
      throw new Error(`${route}: content entry kind ${entry.data.kind} differs from normalized kind ${record.kind}`);
    }
  }
  for (const record of siteData.publicRegistry) {
    if (record.kind !== 'topic' && !entryByRoute.has(record.route)) {
      throw new Error(`Normalized public record has no content entry: ${record.route}`);
    }
    if (record.kind === 'topic' && entryByRoute.has(record.route)) {
      throw new Error(`Generated topic route collides with a content entry: ${record.route}`);
    }
  }
  return siteData.publicRegistry;
}

export { routeFromEntryId };
