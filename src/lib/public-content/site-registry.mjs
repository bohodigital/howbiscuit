import * as taxonomy from '../../config/public-taxonomy.ts';
import { buildPublicNavigation } from './public-navigation.mjs';
import {
  createPublicContentRegistry,
  isPublishableGuide,
  orderFeaturedContent,
  orderLatestContent,
  topicPublicationModeForRegistry,
} from './model.mjs';
import { discoverTrackedArticleSources } from './source-adapter.mjs';

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
  const registry = createPublicContentRegistry({
    sources: discoverTrackedArticleSources(root),
    taxonomy,
  });
  const categoryViews = buildCategoryViews(registry);
  cachedRoot = root;
  cachedValue = Object.freeze({
    taxonomy,
    registry,
    categoryViews,
    navigation: buildPublicNavigation({ taxonomy, categoryViews }),
  });
  return cachedValue;
}

export function createPublicPageCatalog(entries, siteData = getPublicSiteData()) {
  if (!Array.isArray(entries)) throw new Error('Content collection entries are required.');
  const articleByRoute = new Map(siteData.registry.map((record) => [record.route, record]));
  const pages = entries.map((entry) => {
    const route = routeFromEntryId(entry.id);
    const record = articleByRoute.get(route);
    const excluded = entry.data.draft === true
      || entry.data.preview === true
      || entry.data.thin === true
      || Boolean(entry.data.redirectState)
      || Boolean(entry.data.retirementState);
    if (entry.data.kind === 'article' && !record) {
      throw new Error(`Article is missing from the normalized registry: ${route}`);
    }
    return Object.freeze({
      route,
      title: record?.title ?? entry.data.title,
      description: record?.description ?? entry.data.description,
      kind: entry.data.kind,
      categoryId: record?.categoryId ?? entry.data.categoryId ?? null,
      topicId: record?.topicId ?? entry.data.topicId ?? null,
      articleType: record?.articleType ?? entry.data.kind,
      updatedDate: record?.updatedDate
        ?? entry.data.updatedDate?.toISOString().slice(0, 10)
        ?? entry.data.pubDate?.toISOString().slice(0, 10)
        ?? '2026-07-18',
      publishedDate: record?.publishedDate ?? entry.data.pubDate?.toISOString().slice(0, 10) ?? null,
      searchEligible: record?.searchEligible ?? !excluded,
      sitemapEligible: record?.sitemapEligible ?? !excluded,
      llmsEligible: record?.llmsEligible ?? !excluded,
      record: record ?? null,
    });
  });

  for (const category of siteData.categoryViews) {
    for (const topic of category.topics.filter(({ mode }) => mode === 'standalone')) {
      pages.push(Object.freeze({
        route: topic.route,
        title: topic.label,
        description: topic.description,
        kind: 'topic',
        categoryId: category.id,
        topicId: topic.id,
        articleType: 'topic',
        updatedDate: topic.guides[0]?.updatedDate ?? topic.guides[0]?.publishedDate ?? null,
        publishedDate: null,
        searchEligible: true,
        sitemapEligible: true,
        llmsEligible: true,
        record: null,
      }));
    }
  }

  pages.sort((left, right) => left.route.localeCompare(right.route));
  const routes = pages.map(({ route }) => route);
  if (new Set(routes).size !== routes.length) {
    throw new Error(`Duplicate public page route: ${routes.join(', ')}`);
  }
  return Object.freeze(pages);
}

export { routeFromEntryId };
