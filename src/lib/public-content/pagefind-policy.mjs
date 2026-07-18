/**
 * Exact Phase C document boundary. Standalone topic routes are added only by
 * the normalized threshold policy when a topic has at least three guides.
 */
export const PHASE_C_DOCUMENT_ROUTES = Object.freeze([
  '/',
  '/about/',
  '/affiliate-disclosure/',
  '/articles/',
  '/articles/how-does-baking-powder-work/',
  '/articles/why-are-some-answers-better-than-others/',
  '/articles/why-salt-melts-ice/',
  '/contact/',
  '/corrections/',
  '/editorial-policy/',
  '/home-tech/',
  '/home/',
  '/kitchen/',
  '/privacy/',
  '/shop/',
  '/tools/',
]);

export const RETIRED_DOCUMENT_ROUTES = Object.freeze([
  '/buying-guides/',
  '/cook/',
  '/glossary/',
  '/home-tech/gaming-pcs/',
  '/home-tech/laptops/',
  '/home-tech/privacy-security/',
  '/home-tech/smart-home/',
  '/home-tech/streaming-tvs/',
  '/home-tech/wifi-routers/',
  '/make-do/',
  '/research-writing/',
  '/science/',
]);

function hasExcludedState(record) {
  return record?.draft === true
    || record?.preview === true
    || record?.thin === true
    || record?.redirectState !== null && record?.redirectState !== undefined
    || record?.retirementState !== null && record?.retirementState !== undefined;
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
