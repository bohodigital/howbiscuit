export const KNOWN_THIN_CURRENT_ROUTES = Object.freeze([
  '/glossary/',
  '/home-tech/gaming-pcs/',
  '/home-tech/laptops/',
  '/home-tech/streaming-tvs/',
  '/science/',
]);

export function isKnownThinCurrentRoute(route) {
  return KNOWN_THIN_CURRENT_ROUTES.includes(route);
}

function hasExcludedState(record) {
  return record.draft === true
    || record.preview === true
    || record.thin === true
    || isKnownThinCurrentRoute(record.route)
    || record.redirectState !== null && record.redirectState !== undefined
    || record.retirementState !== null && record.retirementState !== undefined;
}

export function pagefindMetadataForRecord(record) {
  if (!record || typeof record !== 'object') throw new Error('A public-content record is required.');
  const excluded = hasExcludedState(record);
  if (record.searchEligible === true && excluded) {
    throw new Error(`Contradictory Pagefind eligibility for ${record.route ?? 'unknown route'}.`);
  }
  if (record.searchEligible !== true || excluded) return Object.freeze({ include: false });

  return Object.freeze({
    include: true,
    filters: Object.freeze({
      category: record.categoryId ?? 'editorial',
      type: record.articleType,
    }),
    meta: Object.freeze({
      title: record.title,
      description: record.description,
      route: record.route,
    }),
  });
}

export function pagefindAttributesForPage(page) {
  if (page?.searchEligible === true && !hasExcludedState(page)) {
    return Object.freeze({ 'data-pagefind-body': '' });
  }
  return Object.freeze({ 'data-pagefind-ignore': 'all' });
}
