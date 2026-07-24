import * as taxonomy from '../../config/public-taxonomy.ts';
import { buildPublicNavigation } from './public-navigation.mjs';
import {
  createPublicSiteRegistry,
  isPublishableGuide,
  isPublishablePublicRecord,
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

let cachedRoot;
let cachedValue;

export function getPublicSiteData(root = process.cwd()) {
  if (cachedValue && cachedRoot === root) return cachedValue;
  const publicRegistry = createPublicSiteRegistry({
    sources: discoverTrackedPublicSources(root, { taxonomy }),
    taxonomy,
  });
  const registry = Object.freeze(publicRegistry.filter((record) => (
    record.kind === 'article' && isPublishablePublicRecord(record)
  )));
  const categoryViews = buildCategoryViews(registry);
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
    if (!['topic', 'tool'].includes(record.kind) && !entryByRoute.has(record.route)) {
      throw new Error(`Normalized public record has no content entry: ${record.route}`);
    }
    if (record.kind === 'topic' && entryByRoute.has(record.route)) {
      throw new Error(`Generated topic route collides with a content entry: ${record.route}`);
    }
  }
  return Object.freeze(siteData.publicRegistry.filter(isPublishablePublicRecord));
}

export { routeFromEntryId };
