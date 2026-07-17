function asciiCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
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

function normalizeStructuredField(sourceValue, fallbackState, itemKey) {
  if (sourceValue === null || sourceValue === undefined) {
    return Object.freeze({ state: fallbackState, [itemKey]: Object.freeze([]) });
  }
  if (typeof sourceValue !== 'object' || Array.isArray(sourceValue)) {
    throw new Error(`Structured ${itemKey} metadata must be an object.`);
  }
  const values = sourceValue[itemKey] ?? [];
  if (!Array.isArray(values)) throw new Error(`Structured ${itemKey} metadata must contain an array.`);
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
  return Object.freeze({
    state: sourceValue.state ?? 'declared',
    notes: Object.freeze([...(sourceValue.notes ?? [])]),
  });
}

function normalizeDisclosure(sourceValue, fallbackState) {
  if (sourceValue === null || sourceValue === undefined) {
    return Object.freeze({ state: fallbackState });
  }
  if (typeof sourceValue !== 'object' || Array.isArray(sourceValue)) {
    throw new Error('Disclosure metadata must be an object.');
  }
  return Object.freeze({ ...sourceValue });
}

function normalizeContent(source, classification, taxonomy) {
  const route = source.route;
  validateClassification(route, classification, taxonomy);
  if (typeof source.title !== 'string' || source.title.trim().length < 8) {
    throw new Error(`${route}: source title is missing or too thin`);
  }
  if (typeof source.description !== 'string' || source.description.trim().length < 40) {
    throw new Error(`${route}: source description is missing or too thin`);
  }
  if (!['standard', 'latex'].includes(source.articleFormat)) {
    throw new Error(`${route}: unsupported article format ${source.articleFormat}`);
  }

  const publishedDate = normalizeDate(source.publishedDate, 'publishedDate', route);
  const updatedDate = normalizeDate(source.updatedDate, 'updatedDate', route);
  const draft = source.draft === true;
  const preview = source.preview === true;
  const thin = source.thin === true;
  const redirectState = source.redirectState ?? null;
  const retirementState = source.retirementState ?? null;
  if (redirectState && retirementState) {
    throw new Error(`${route}: content cannot be both redirected and retired`);
  }
  if (redirectState?.to === route) throw new Error(`${route}: content cannot redirect to itself`);
  if (source.feed === true && !publishedDate) throw new Error(`${route}: feed content requires a publication date`);
  if (source.featured === true && draft) throw new Error(`${route}: featured content cannot be draft`);
  if (source.featured === true && (preview || thin || redirectState || retirementState)) {
    throw new Error(`${route}: featured content must be publishable`);
  }

  const publishable = !draft && !preview && !thin && !redirectState && !retirementState;
  const sourceNotes = normalizeStructuredField(
    source.sourceNotes,
    classification.sourceNotesState,
    'items',
  );
  const relatedContent = normalizeStructuredField(
    source.relatedContent,
    classification.relatedContentState,
    'routes',
  );

  return Object.freeze({
    route,
    canonicalRoute: route,
    slug: source.slug,
    title: source.title.trim(),
    description: source.description.trim(),
    categoryId: classification.categoryId,
    topicId: classification.topicId,
    articleType: classification.articleType,
    editorialClassification: classification.editorialClassification,
    articleFormat: source.articleFormat,
    publishedDate,
    updatedDate,
    feedEligible: publishable && source.feed === true && publishedDate !== null,
    searchEligible: publishable,
    sitemapEligible: publishable,
    llmsEligible: publishable,
    featured: publishable && source.featured === true,
    editorialPriority: classification.editorialPriority,
    readTime: source.readTime ?? null,
    evidence: source.evidence ?? null,
    testing: normalizeTesting(source.testing, classification.testingState),
    sourceNotes,
    relatedContent,
    disclosure: normalizeDisclosure(source.disclosure, classification.disclosureState),
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
      dates: 'source',
      feed: 'source',
      featured: 'source',
      readTime: 'source',
      evidence: 'source',
      categoryId: 'migration-classification',
      topicId: 'migration-classification',
      articleType: 'migration-classification',
      editorialClassification: 'migration-classification',
      testing: source.testing ? 'source' : 'explicit-not-declared',
      sourceNotes: source.sourceNotes ? 'source' : 'legacy-body-not-normalized',
      relatedContent: source.relatedContent ? 'source' : 'legacy-body-not-normalized',
      disclosure: source.disclosure ? 'source' : 'explicit-not-declared',
    }),
  });
}

export function createPublicContentRegistry({ sources, classificationManifest, taxonomy }) {
  if (!Array.isArray(sources) || !sources.length) throw new Error('Public content sources are required.');
  const sourceRoutes = sources.map(({ route }) => route).sort(asciiCompare);
  const classificationRoutes = Object.keys(classificationManifest).sort(asciiCompare);
  if (JSON.stringify(sourceRoutes) !== JSON.stringify(classificationRoutes)) {
    throw new Error(`Public-content classification parity failed: sources=${sourceRoutes.join(',')} classifications=${classificationRoutes.join(',')}`);
  }
  if (new Set(sourceRoutes).size !== sourceRoutes.length) {
    throw new Error('Public-content source routes must be unique.');
  }
  const registry = sources.map((source) => normalizeContent(
    source,
    classificationManifest[source.route],
    taxonomy,
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
    .sort((left, right) => (
      right.editorialPriority - left.editorialPriority
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
