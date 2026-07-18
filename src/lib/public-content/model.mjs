function asciiCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSafePublicHref(value) {
  if (!isNonEmptyString(value) || /[\u0000-\u001f\u007f]/.test(value)) return false;
  if (value.startsWith('/')) return !value.startsWith('//') && !value.startsWith('/\\');
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
}

const PRICE_BADGE_STATES = new Set(['observed', 'estimate', 'unavailable', 'stale']);
const EVIDENCE_LABELS = new Set([
  'Hands-on tested',
  'Owner experience',
  'Specification reviewed',
  'Researched',
  'Price listing only',
  'Editorial standard',
]);
const TESTING_STATES = new Set(['hands-on-tested', 'owner-experience', 'not-hands-on-tested', 'not-applicable']);

export function assertValidPriceBadgeProps({ state, observedAt } = {}) {
  if (!PRICE_BADGE_STATES.has(state)) {
    throw new Error('Price badges require a recognized price state.');
  }
  if ((state === 'observed' || state === 'stale') && !isNonEmptyString(observedAt)) {
    throw new Error(`${state} price badges require an observation date.`);
  }
  if ((state === 'estimate' || state === 'unavailable') && observedAt !== undefined) {
    throw new Error(`${state} price badges must not claim an observation date.`);
  }
  return { state, observedAt };
}

export function assertValidProductEvidence(product) {
  if (!product || typeof product !== 'object' || Array.isArray(product)) {
    throw new Error('Product evidence must be an object.');
  }
  if (!isNonEmptyString(product.name) || !isNonEmptyString(product.description)) {
    throw new Error('Product cards require a non-empty name and description.');
  }
  if (product.priceState === 'observed' || product.priceState === 'stale') {
    if (!isNonEmptyString(product.price) || !isNonEmptyString(product.observedAt) || !isNonEmptyString(product.source)) {
      throw new Error(`${product.priceState} product prices require price, observedAt, and source evidence.`);
    }
  } else if (product.priceState === 'estimate') {
    if (!isNonEmptyString(product.price) || !isNonEmptyString(product.source)) {
      throw new Error('Estimated product prices require price and source evidence.');
    }
    if (product.observedAt !== undefined) {
      throw new Error('Estimated product prices must not claim an observation date.');
    }
  } else if (product.priceState === 'unavailable') {
    if (product.price !== undefined || product.observedAt !== undefined) {
      throw new Error('Unavailable products must not imply a price observation.');
    }
  } else {
    throw new Error('Product cards require a recognized price state.');
  }
  return product;
}

function normalizeDate(value, field, route) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(Date.parse(`${normalized}T12:00:00Z`))) {
    throw new Error(`${route}: ${field} must be a valid YYYY-MM-DD date`);
  }
  return normalized;
}

function validateClassification(route, classification, taxonomy) {
  if (!classification || typeof classification !== 'object') {
    throw new Error(`${route}: missing migration classification`);
  }
  if (!['guide', 'editorial-standard'].includes(classification.articleType)) {
    throw new Error(`${route}: unsupported article type ${classification.articleType}`);
  }
  if (classification.articleType === 'editorial-standard') {
    if (classification.categoryId !== null || classification.topicId !== null) {
      throw new Error(`${route}: editorial-standard content must remain categoryless`);
    }
  } else {
    if (!taxonomy.hasTargetCategory(classification.categoryId)) {
      throw new Error(`${route}: unknown category ${classification.categoryId}`);
    }
    if (!taxonomy.hasTargetTopic(classification.categoryId, classification.topicId)) {
      throw new Error(`${route}: unknown topic ${classification.categoryId}/${classification.topicId}`);
    }
  }
  if (!Number.isInteger(classification.editorialPriority)) {
    throw new Error(`${route}: editorial priority must be an integer`);
  }
}

function normalizeStructuredField(sourceValue, fallbackState, itemKey, validateItem) {
  if (sourceValue === null || sourceValue === undefined) {
    return Object.freeze({ state: fallbackState, [itemKey]: Object.freeze([]) });
  }
  if (typeof sourceValue !== 'object' || Array.isArray(sourceValue)) {
    throw new Error(`Structured ${itemKey} metadata must be an object.`);
  }
  const values = sourceValue[itemKey] ?? [];
  if (!Array.isArray(values)) throw new Error(`Structured ${itemKey} metadata must contain an array.`);
  values.forEach(validateItem);
  return Object.freeze({
    state: sourceValue.state ?? 'structured',
    [itemKey]: Object.freeze([...values]),
  });
}

function normalizeTesting(sourceValue, fallbackState) {
  if (sourceValue === null || sourceValue === undefined) {
    return Object.freeze({ state: fallbackState, notes: Object.freeze([]) });
  }
  if (typeof sourceValue !== 'object' || Array.isArray(sourceValue)) {
    throw new Error('Testing metadata must be an object.');
  }
  const state = sourceValue.state ?? fallbackState;
  if (!TESTING_STATES.has(state)) throw new Error(`Unsupported testing state: ${state}`);
  const notes = sourceValue.notes ?? [];
  if (!Array.isArray(notes) || notes.some((note) => !isNonEmptyString(note))) {
    throw new Error('Testing notes must be non-empty strings.');
  }
  return Object.freeze({
    state,
    notes: Object.freeze([...notes]),
  });
}

function normalizeDisclosure(sourceValue, fallbackState) {
  if (sourceValue === null || sourceValue === undefined) {
    return Object.freeze({ state: fallbackState });
  }
  if (typeof sourceValue !== 'object' || Array.isArray(sourceValue)) {
    throw new Error('Disclosure metadata must be an object.');
  }
  const state = sourceValue.state ?? fallbackState;
  if (state !== 'no-paid-links') throw new Error(`Unsupported disclosure state: ${state}`);
  if (!isNonEmptyString(sourceValue.text) || sourceValue.href !== '/affiliate-disclosure/') {
    throw new Error('No-paid-links disclosure requires truthful text and the canonical disclosure route.');
  }
  return Object.freeze({ ...sourceValue, state });
}

function normalizeEligibilityState(source, route) {
  const draft = source.draft === true;
  const preview = source.preview === true;
  const thin = source.thin === true;
  const redirectState = source.redirectState ?? null;
  const retirementState = source.retirementState ?? null;
  if (redirectState && retirementState) {
    throw new Error(`${route}: content cannot be both redirected and retired`);
  }
  if (redirectState?.to === route) throw new Error(`${route}: content cannot redirect to itself`);
  return Object.freeze({
    draft,
    preview,
    thin,
    redirectState,
    retirementState,
    publishable: !draft && !preview && !thin && !redirectState && !retirementState,
  });
}

function normalizeContent(source, taxonomy) {
  const route = source.route;
  validateClassification(route, source, taxonomy);
  if (typeof source.title !== 'string' || source.title.trim().length < 8) {
    throw new Error(`${route}: source title is missing or too thin`);
  }
  if (typeof source.description !== 'string' || source.description.trim().length < 40) {
    throw new Error(`${route}: source description is missing or too thin`);
  }
  if (!['standard', 'latex'].includes(source.articleFormat)) {
    throw new Error(`${route}: unsupported article format ${source.articleFormat}`);
  }
  if (!isNonEmptyString(source.answerSummary) || source.answerSummary.trim().length < 40) {
    throw new Error(`${route}: a direct answer summary of at least 40 characters is required`);
  }
  if (!EVIDENCE_LABELS.has(source.evidence)) {
    throw new Error(`${route}: unsupported evidence label ${source.evidence}`);
  }

  const publishedDate = normalizeDate(source.publishedDate, 'publishedDate', route);
  const updatedDate = normalizeDate(source.updatedDate, 'updatedDate', route);
  const { draft, preview, thin, redirectState, retirementState, publishable } = normalizeEligibilityState(source, route);
  if (source.feed === true && !publishedDate) throw new Error(`${route}: feed content requires a publication date`);
  if (source.featured === true && draft) throw new Error(`${route}: featured content cannot be draft`);
  if (source.featured === true && (preview || thin || redirectState || retirementState)) {
    throw new Error(`${route}: featured content must be publishable`);
  }

  const sourceNotes = normalizeStructuredField(
    source.sourceNotes,
    source.sourceNotesState ?? 'missing',
    'items',
    (item) => {
      if (!item || !isNonEmptyString(item.title) || !isNonEmptyString(item.publisher) || !isNonEmptyString(item.href)) {
        throw new Error(`${route}: source notes require title, publisher, and href`);
      }
      if (!isSafePublicHref(item.href)) {
        throw new Error(`${route}: source-note href must be credential-free HTTP(S) or root-relative`);
      }
    },
  );
  const relatedContent = normalizeStructuredField(
    source.relatedContent,
    source.relatedContentState ?? 'missing',
    'routes',
    (relatedRoute) => {
      if (!isNonEmptyString(relatedRoute) || !relatedRoute.startsWith('/articles/') || relatedRoute === route) {
        throw new Error(`${route}: related routes must be other canonical article routes`);
      }
    },
  );
  if (sourceNotes.state !== 'structured' || sourceNotes.items.length === 0) {
    throw new Error(`${route}: structured source notes are required`);
  }
  if (relatedContent.state !== 'structured') {
    throw new Error(`${route}: structured related-content metadata is required`);
  }

  return Object.freeze({
    kind: 'article',
    route,
    canonicalRoute: route,
    slug: source.slug,
    title: source.title.trim(),
    description: source.description.trim(),
    categoryId: source.categoryId,
    topicId: source.topicId,
    articleType: source.articleType,
    editorialClassification: source.editorialClassification,
    articleFormat: source.articleFormat,
    answerSummary: source.answerSummary.trim(),
    problemLabel: isNonEmptyString(source.problemLabel) ? source.problemLabel.trim() : null,
    publishedDate,
    updatedDate,
    feedEligible: publishable && source.feed === true && publishedDate !== null,
    searchEligible: publishable,
    sitemapEligible: publishable,
    llmsEligible: publishable,
    featured: publishable && source.featured === true,
    editorialPriority: source.editorialPriority,
    readTime: source.readTime ?? null,
    evidence: source.evidence ?? null,
    testing: normalizeTesting(source.testing, source.testingState ?? 'not-declared'),
    sourceNotes,
    relatedContent,
    disclosure: normalizeDisclosure(source.disclosure, source.disclosureState ?? 'not-declared'),
    draft,
    preview,
    thin,
    redirectState,
    retirementState,
    legacy: Object.freeze({
      division: source.legacyDivision,
      subtopic: source.legacySubtopic,
      sourceKind: source.sourceKind,
      sourcePath: source.sourcePath,
    }),
    provenance: Object.freeze({
      title: 'source',
      description: 'source',
      articleFormat: 'source',
      answerSummary: 'source',
      problemLabel: source.problemLabel ? 'source' : 'not-declared',
      dates: 'source',
      feed: 'source',
      featured: 'source',
      readTime: 'source',
      evidence: 'source',
      categoryId: source.classificationProvenance ?? 'source',
      topicId: source.classificationProvenance ?? 'source',
      articleType: source.classificationProvenance ?? 'source',
      editorialClassification: source.classificationProvenance ?? 'source',
      testing: 'source',
      sourceNotes: 'source',
      relatedContent: 'source',
      disclosure: 'source',
    }),
  });
}

function normalizePublicPage(source, taxonomy) {
  const route = source.route;
  if (!['home', 'category', 'guide-index', 'trust'].includes(source.kind)) {
    throw new Error(`${route}: unsupported public page kind ${source.kind}`);
  }
  if (!isNonEmptyString(source.title)) throw new Error(`${route}: source title is missing`);
  if (!isNonEmptyString(source.description) || source.description.trim().length < 40) {
    throw new Error(`${route}: source description is missing or too thin`);
  }
  if (source.kind === 'category') {
    if (!taxonomy.hasTargetCategory(source.categoryId)) {
      throw new Error(`${route}: unknown category ${source.categoryId}`);
    }
    const category = taxonomy.PUBLIC_CATEGORIES.find(({ id }) => id === source.categoryId);
    if (category?.route !== route) throw new Error(`${route}: category source route does not match ${source.categoryId}`);
  }
  const publishedDate = normalizeDate(source.publishedDate, 'publishedDate', route);
  const updatedDate = normalizeDate(source.updatedDate, 'updatedDate', route);
  const { draft, preview, thin, redirectState, retirementState, publishable } = normalizeEligibilityState(source, route);
  return Object.freeze({
    kind: source.kind,
    route,
    canonicalRoute: route,
    slug: source.slug,
    title: source.title.trim(),
    description: source.description.trim(),
    categoryId: source.categoryId ?? null,
    topicId: source.topicId ?? null,
    articleType: source.kind,
    publishedDate,
    updatedDate,
    feedEligible: false,
    searchEligible: publishable,
    sitemapEligible: publishable,
    llmsEligible: publishable,
    featured: false,
    editorialPriority: 0,
    draft,
    preview,
    thin,
    redirectState,
    retirementState,
    legacy: Object.freeze({ sourceKind: source.sourceKind, sourcePath: source.sourcePath }),
    provenance: Object.freeze({
      title: 'source',
      description: 'source',
      dates: 'source-or-absent',
      eligibility: 'normalized-source-state',
    }),
  });
}

export function createPublicContentRegistry({ sources, taxonomy }) {
  if (!Array.isArray(sources) || !sources.length) throw new Error('Public content sources are required.');
  const sourceRoutes = sources.map(({ route }) => route).sort(asciiCompare);
  if (new Set(sourceRoutes).size !== sourceRoutes.length) {
    throw new Error('Public-content source routes must be unique.');
  }
  const registry = sources.map((source) => normalizeContent(source, taxonomy));
  registry.sort((left, right) => asciiCompare(left.route, right.route));
  return Object.freeze(registry);
}

export function createPublicDocumentRegistry({ sources, taxonomy }) {
  if (!Array.isArray(sources) || !sources.length) throw new Error('Public document sources are required.');
  const sourceRoutes = sources.map(({ route }) => route).sort(asciiCompare);
  if (new Set(sourceRoutes).size !== sourceRoutes.length) {
    throw new Error('Public-document source routes must be unique.');
  }
  const registry = sources.map((source) => (
    source.kind === 'article' ? normalizeContent(source, taxonomy) : normalizePublicPage(source, taxonomy)
  ));
  registry.sort((left, right) => asciiCompare(left.route, right.route));
  return Object.freeze(registry);
}

export function isPublishableGuide(content) {
  return content.articleType === 'guide'
    && content.categoryId !== null
    && content.topicId !== null
    && content.draft !== true
    && content.preview !== true
    && content.thin !== true
    && !content.redirectState
    && !content.retirementState
    && content.searchEligible === true
    && content.sitemapEligible === true
    && content.llmsEligible === true;
}

export function topicPublicationModeForRegistry({ registry, categoryId, topicId, taxonomy }) {
  if (!taxonomy.hasTargetTopic(categoryId, topicId)) {
    throw new Error(`Unknown topic ${categoryId}/${topicId}`);
  }
  const count = registry.filter((content) => (
    isPublishableGuide(content)
    && content.categoryId === categoryId
    && content.topicId === topicId
  )).length;
  return taxonomy.topicPublicationMode(count);
}

export function topicMigrationDestinationForRegistry({ legacyRef, registry, taxonomy }) {
  const target = taxonomy.targetTopicFor(legacyRef);
  if (!target) throw new Error(`Unknown legacy topic mapping: ${legacyRef}`);
  const category = taxonomy.PUBLIC_CATEGORIES.find(({ id }) => id === target.categoryId);
  const topic = category?.topics.find(({ id }) => id === target.topicId);
  if (!category || !topic) throw new Error(`Incomplete canonical topic mapping: ${legacyRef}`);
  const mode = topicPublicationModeForRegistry({
    registry,
    categoryId: target.categoryId,
    topicId: target.topicId,
    taxonomy,
  });
  return mode === 'standalone' ? topic.route : category.route;
}

function createTopicPageRecord({ category, topic, guides }) {
  return Object.freeze({
    kind: 'topic',
    route: topic.route,
    canonicalRoute: topic.route,
    slug: topic.id,
    title: topic.label,
    description: topic.description,
    categoryId: category.id,
    topicId: topic.id,
    articleType: 'topic',
    updatedDate: guides[0]?.updatedDate ?? guides[0]?.publishedDate ?? null,
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
  });
}

/**
 * Builds the complete public route registry from canonical source documents and
 * threshold-generated topic pages. Runtime routing, artifact checks, Pagefind,
 * sitemap, llms.txt, and tests consume this registry instead of a route list.
 */
export function createPublicSiteRegistry({ sources, taxonomy }) {
  const documentRegistry = createPublicDocumentRegistry({ sources, taxonomy });
  const articleRegistry = documentRegistry.filter(({ kind }) => kind === 'article');
  const topicRecords = taxonomy.PUBLIC_CATEGORIES.flatMap((category) => (
    category.topics.flatMap((topic) => {
      const mode = topicPublicationModeForRegistry({
        registry: articleRegistry,
        categoryId: category.id,
        topicId: topic.id,
        taxonomy,
      });
      if (mode !== 'standalone') return [];
      const guides = orderLatestContent(articleRegistry.filter((record) => (
        isPublishableGuide(record)
        && record.categoryId === category.id
        && record.topicId === topic.id
      )));
      return [createTopicPageRecord({ category, topic, guides })];
    })
  ));
  const publicRegistry = [...documentRegistry, ...topicRecords]
    .sort((left, right) => asciiCompare(left.route, right.route));
  const routes = publicRegistry.map(({ route }) => route);
  if (new Set(routes).size !== routes.length) {
    throw new Error(`Duplicate normalized public route: ${routes.join(', ')}`);
  }
  return Object.freeze(publicRegistry);
}

function dateSortValue(value) {
  return value ?? '0000-00-00';
}

function latestComparator(left, right) {
  return asciiCompare(dateSortValue(right.publishedDate), dateSortValue(left.publishedDate))
    || asciiCompare(dateSortValue(right.updatedDate), dateSortValue(left.updatedDate))
    || right.editorialPriority - left.editorialPriority
    || asciiCompare(left.route, right.route);
}

export function orderLatestContent(registry) {
  return registry.filter(({ searchEligible }) => searchEligible).slice().sort(latestComparator);
}

export function orderFeaturedContent(registry) {
  return registry
    .filter(({ featured, searchEligible }) => featured && searchEligible)
    .slice()
    .sort(latestComparator);
}

export function orderHomepageContent(registry) {
  return registry
    .filter(({ searchEligible }) => searchEligible)
    .slice()
    .sort((left, right) => (
      Number(right.featured) - Number(left.featured)
      || latestComparator(left, right)
    ));
}

export function selectRelatedContent(content, registry, limit = 3) {
  if (!Number.isInteger(limit) || limit < 0) throw new Error('Related-content limit must be a non-negative integer.');
  if (limit === 0) return [];
  const candidates = new Map(registry
    .filter((entry) => entry.searchEligible && entry.route !== content.route)
    .map((entry) => [entry.route, entry]));
  const selected = [];
  const seen = new Set();
  const add = (entry) => {
    if (!entry || seen.has(entry.route) || selected.length >= limit) return;
    seen.add(entry.route);
    selected.push(entry);
  };

  if (content.relatedContent?.state === 'structured') {
    for (const route of content.relatedContent.routes) add(candidates.get(route));
  }
  const ordered = orderLatestContent([...candidates.values()]);
  for (const entry of ordered) {
    if (entry.categoryId === content.categoryId && entry.topicId === content.topicId) add(entry);
  }
  for (const entry of ordered) {
    if (entry.categoryId !== null && entry.categoryId === content.categoryId) add(entry);
  }
  return selected;
}
