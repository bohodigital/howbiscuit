import { isPublishablePublicRecord } from './model.mjs';

const PUBLIC_TYPE_LABELS = Object.freeze({
  guide: 'Guide',
  'editorial-standard': 'Editorial standard',
  home: 'Home',
  category: 'Category',
  'guide-index': 'All Guides',
  trust: 'Trust',
  topic: 'Topic',
});

function publicCategoryLabel(record, taxonomy) {
  if (record.categoryId === null || record.categoryId === undefined) return 'Editorial';
  const category = taxonomy?.PUBLIC_CATEGORIES?.find(({ id }) => id === record.categoryId);
  if (!category) throw new Error(`Unknown Pagefind category ${record.categoryId} for ${record.route}.`);
  return category.label;
}

function publicTypeLabel(record) {
  const key = record.articleType ?? record.kind;
  const label = PUBLIC_TYPE_LABELS[key];
  if (!label) throw new Error(`Unknown Pagefind content type ${key ?? 'missing'} for ${record.route}.`);
  return label;
}

export function pagefindMetadataForRecord(record, taxonomy) {
  if (!record || typeof record !== 'object') throw new Error('A public-content record is required.');
  const discoveryFlags = [record.searchEligible, record.sitemapEligible, record.llmsEligible];
  const hasPartialDiscoveryEligibility = discoveryFlags.some((value) => value === true)
    && !discoveryFlags.every((value) => value === true);
  const publishable = isPublishablePublicRecord(record);
  if (hasPartialDiscoveryEligibility || (record.searchEligible === true && !publishable)) {
    throw new Error(`Contradictory Pagefind eligibility for ${record.route ?? 'unknown route'}.`);
  }
  if (!publishable) return Object.freeze({ include: false });

  return Object.freeze({
    include: true,
    filters: Object.freeze({
      category: publicCategoryLabel(record, taxonomy),
      type: publicTypeLabel(record),
    }),
    meta: Object.freeze({
      title: record.title,
      description: record.description,
      route: record.route,
    }),
  });
}

export function pagefindAttributesForPage(page) {
  if (isPublishablePublicRecord(page)) {
    return Object.freeze({ 'data-pagefind-body': '' });
  }
  return Object.freeze({ 'data-pagefind-ignore': 'all' });
}
