import { z } from 'zod';

export const ARTICLE_PACKAGE_SCHEMA_VERSION = '1.0.0';
export const NORMALIZED_PUBLIC_ARTICLE_SCHEMA_VERSION = '1.0.0';

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const routePattern = /^\/articles\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/;

function safeEditorialUrl(value) {
  if (typeof value !== 'string' || value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) return false;
  if (value.startsWith('/')) {
    if (value.startsWith('//') || value.includes('\\')) return false;
    try {
      const decoded = decodeURIComponent(value);
      return !decoded.split(/[?#]/, 1)[0].split('/').includes('..');
    } catch {
      return false;
    }
  }
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:')
      && Boolean(url.hostname)
      && url.username === ''
      && url.password === '';
  } catch {
    return false;
  }
}

const id = z.string().regex(idPattern);
const date = z.string().regex(datePattern);
const stringList = z.array(id).default([]);
const testing = z.object({
  state: z.enum(['hands-on-tested', 'owner-experience', 'not-hands-on-tested', 'not-applicable']),
  notes: z.array(z.string().min(1)).min(1),
}).strict();
const sourceNote = z.object({
  id,
  title: z.string().min(1),
  publisher: z.string().min(1),
  href: z.string().min(1).refine(safeEditorialUrl, 'Source URLs must use HTTP(S) or an absolute site path.'),
}).strict();
const presentationText = z.string().min(1).refine((value) => !/[<>{}\u0000-\u001f\u007f]/.test(value), 'Presentation text must be plain, non-executable text.');
const presentationBlock = z.discriminatedUnion('kind', [
  z.object({
    id,
    kind: z.literal('mechanism'),
    steps: z.array(z.object({ title: presentationText, body: presentationText }).strict()).min(1),
  }).strict(),
  z.object({
    id,
    kind: z.literal('mistake-grid'),
    items: z.array(z.object({ title: presentationText, body: presentationText, fix: presentationText.optional() }).strict()).min(1),
  }).strict(),
  z.object({
    id,
    kind: z.literal('callout'),
    variant: z.enum(['short-answer', 'common-mistake', 'cheap-safe', 'dont-be-fooled', 'source-note']),
    title: presentationText,
    body: presentationText,
  }).strict(),
]);

export function createArticleManifestSchema(taxonomy) {
  const categoryIds = taxonomy.PUBLIC_CATEGORIES.map(({ id: categoryId }) => categoryId);
  const topicIdsByCategory = new Map(taxonomy.PUBLIC_CATEGORIES.map((category) => [
    category.id,
    new Set(category.topics.map(({ id: topicId }) => topicId)),
  ]));
  return z.object({
    schemaVersion: z.literal(ARTICLE_PACKAGE_SCHEMA_VERSION),
    id,
    slug: id,
    title: z.string().min(1),
    description: z.string().min(40),
    articleType: z.enum(['guide', 'editorial-standard']),
    categoryId: z.string().nullable(),
    topicIds: z.array(id),
    problemLabels: z.array(z.string().min(1)).default([]),
    directAnswer: z.string().min(40),
    publishedAt: date,
    updatedAt: date,
    featured: z.boolean().default(false),
    editorialPriority: z.number().int().default(0),
    authors: z.array(z.string().min(1)).min(1),
    evidence: z.object({
      level: z.enum(['hands-on-tested', 'owner-experience', 'specification-reviewed', 'researched', 'price-listing-only', 'editorial-standard']),
      label: z.string().min(1),
    }).strict(),
    testing,
    workflow: z.object({
      state: z.enum(['draft', 'review', 'approved', 'published', 'retired']),
      history: z.array(z.object({ state: z.string().min(1), at: date, actor: z.string().min(1) }).strict()).min(1),
    }).strict(),
    disclosure: z.object({
      state: z.literal('no-paid-links'),
      text: z.string().min(1),
      href: z.literal('/affiliate-disclosure/'),
    }).strict(),
    sourceIds: stringList,
    sourceNotes: z.array(sourceNote),
    testingIds: stringList,
    mediaIds: stringList,
    productIds: stringList,
    productGroupIds: stringList,
    linkPreviewIds: stringList,
    destinationIds: stringList,
    relatedArticleIds: stringList,
    priceClaims: stringList,
    recommendationClaims: stringList,
    presentationBlocks: z.array(presentationBlock).default([]),
  }).strict().superRefine((data, context) => {
    if (data.id !== data.slug) {
      context.addIssue({ code: 'custom', path: ['id'], message: 'Article id and slug must match in schema v1.' });
    }
    if (data.updatedAt < data.publishedAt) {
      context.addIssue({ code: 'custom', path: ['updatedAt'], message: 'updatedAt cannot precede publishedAt.' });
    }
    if (data.articleType === 'guide') {
      if (!data.categoryId || !categoryIds.includes(data.categoryId)) {
        context.addIssue({ code: 'custom', path: ['categoryId'], message: 'Guide categoryId must come from the canonical taxonomy.' });
      } else if (data.topicIds.length !== 1 || !topicIdsByCategory.get(data.categoryId)?.has(data.topicIds[0])) {
        context.addIssue({ code: 'custom', path: ['topicIds'], message: 'Guide topicIds must contain one canonical topic for its category.' });
      }
    } else if (data.categoryId !== null || data.topicIds.length !== 0) {
      context.addIssue({ code: 'custom', path: ['categoryId'], message: 'Editorial standards must remain categoryless.' });
    }
    const noteIds = data.sourceNotes.map(({ id: sourceId }) => sourceId).sort();
    const declaredIds = [...data.sourceIds].sort();
    if (JSON.stringify(noteIds) !== JSON.stringify(declaredIds)) {
      context.addIssue({ code: 'custom', path: ['sourceIds'], message: 'Every sourceId must have exactly one sourceNotes entry.' });
    }
    const presentationIds = data.presentationBlocks.map(({ id: blockId }) => blockId);
    if (new Set(presentationIds).size !== presentationIds.length) {
      context.addIssue({ code: 'custom', path: ['presentationBlocks'], message: 'Presentation block IDs must be unique.' });
    }
  });
}

export function createArticleManifestJsonSchema(taxonomy) {
  const categoryIds = taxonomy.PUBLIC_CATEGORIES.map(({ id }) => id);
  const topicIds = taxonomy.PUBLIC_CATEGORIES.flatMap((category) => category.topics.map(({ id }) => id));
  const idSchema = { type: 'string', pattern: idPattern.source };
  const idArray = { type: 'array', items: idSchema, uniqueItems: true };
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://howbiscuit.com/schemas/article-manifest-v1.schema.json',
    title: 'How Biscuit article package manifest v1',
    type: 'object',
    additionalProperties: false,
    required: ['schemaVersion', 'id', 'slug', 'title', 'description', 'articleType', 'categoryId', 'topicIds', 'problemLabels', 'directAnswer', 'publishedAt', 'updatedAt', 'featured', 'editorialPriority', 'authors', 'evidence', 'testing', 'workflow', 'disclosure', 'sourceIds', 'sourceNotes', 'testingIds', 'mediaIds', 'productIds', 'productGroupIds', 'linkPreviewIds', 'destinationIds', 'relatedArticleIds', 'priceClaims', 'recommendationClaims', 'presentationBlocks'],
    properties: {
      schemaVersion: { const: ARTICLE_PACKAGE_SCHEMA_VERSION },
      id: idSchema,
      slug: idSchema,
      title: { type: 'string', minLength: 1 },
      description: { type: 'string', minLength: 40 },
      articleType: { enum: ['guide', 'editorial-standard'] },
      categoryId: { anyOf: [{ enum: categoryIds }, { type: 'null' }] },
      topicIds: { type: 'array', items: { enum: topicIds }, uniqueItems: true },
      problemLabels: { type: 'array', items: { type: 'string', minLength: 1 } },
      directAnswer: { type: 'string', minLength: 40 },
      publishedAt: { type: 'string', pattern: datePattern.source },
      updatedAt: { type: 'string', pattern: datePattern.source },
      featured: { type: 'boolean' },
      editorialPriority: { type: 'integer' },
      authors: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
      evidence: { type: 'object', additionalProperties: false, required: ['level', 'label'], properties: { level: { enum: ['hands-on-tested', 'owner-experience', 'specification-reviewed', 'researched', 'price-listing-only', 'editorial-standard'] }, label: { type: 'string', minLength: 1 } } },
      testing: { type: 'object', additionalProperties: false, required: ['state', 'notes'], properties: { state: { enum: ['hands-on-tested', 'owner-experience', 'not-hands-on-tested', 'not-applicable'] }, notes: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } } } },
      workflow: { type: 'object', additionalProperties: false, required: ['state', 'history'], properties: { state: { enum: ['draft', 'review', 'approved', 'published', 'retired'] }, history: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: false, required: ['state', 'at', 'actor'], properties: { state: { type: 'string', minLength: 1 }, at: { type: 'string', pattern: datePattern.source }, actor: { type: 'string', minLength: 1 } } } } } },
      disclosure: { type: 'object', additionalProperties: false, required: ['state', 'text', 'href'], properties: { state: { const: 'no-paid-links' }, text: { type: 'string', minLength: 1 }, href: { const: '/affiliate-disclosure/' } } },
      sourceIds: idArray,
      sourceNotes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'title', 'publisher', 'href'], properties: { id: idSchema, title: { type: 'string', minLength: 1 }, publisher: { type: 'string', minLength: 1 }, href: { type: 'string', minLength: 1 } } } },
      testingIds: idArray,
      mediaIds: idArray,
      productIds: idArray,
      productGroupIds: idArray,
      linkPreviewIds: idArray,
      destinationIds: idArray,
      relatedArticleIds: idArray,
      priceClaims: idArray,
      recommendationClaims: idArray,
      presentationBlocks: {
        type: 'array',
        items: {
          oneOf: [
            { type: 'object', additionalProperties: false, required: ['id', 'kind', 'steps'], properties: { id: idSchema, kind: { const: 'mechanism' }, steps: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: false, required: ['title', 'body'], properties: { title: { type: 'string', minLength: 1, pattern: '^[^<>{}\\u0000-\\u001f\\u007f]+$' }, body: { type: 'string', minLength: 1, pattern: '^[^<>{}\\u0000-\\u001f\\u007f]+$' } } } } } },
            { type: 'object', additionalProperties: false, required: ['id', 'kind', 'items'], properties: { id: idSchema, kind: { const: 'mistake-grid' }, items: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: false, required: ['title', 'body'], properties: { title: { type: 'string', minLength: 1, pattern: '^[^<>{}\\u0000-\\u001f\\u007f]+$' }, body: { type: 'string', minLength: 1, pattern: '^[^<>{}\\u0000-\\u001f\\u007f]+$' }, fix: { type: 'string', minLength: 1, pattern: '^[^<>{}\\u0000-\\u001f\\u007f]+$' } } } } } },
            { type: 'object', additionalProperties: false, required: ['id', 'kind', 'variant', 'title', 'body'], properties: { id: idSchema, kind: { const: 'callout' }, variant: { enum: ['short-answer', 'common-mistake', 'cheap-safe', 'dont-be-fooled', 'source-note'] }, title: { type: 'string', minLength: 1, pattern: '^[^<>{}\\u0000-\\u001f\\u007f]+$' }, body: { type: 'string', minLength: 1, pattern: '^[^<>{}\\u0000-\\u001f\\u007f]+$' } } },
          ],
        },
      },
    },
    allOf: [
      { if: { properties: { articleType: { const: 'guide' } }, required: ['articleType'] }, then: { properties: { categoryId: { type: 'string', enum: categoryIds }, topicIds: { type: 'array', minItems: 1, maxItems: 1 } } } },
      { if: { properties: { articleType: { const: 'editorial-standard' } }, required: ['articleType'] }, then: { properties: { categoryId: { type: 'null' }, topicIds: { type: 'array', maxItems: 0 } } } },
    ],
    'x-hb-manifest-cross-fields': true,
    $comment: `Generated from canonical taxonomy ${taxonomy.PUBLIC_TAXONOMY_CONTRACT_VERSION}; do not hand-edit taxonomy enums.`,
  };
}

export function normalizedArticleRoute(slug) {
  const route = `/articles/${slug}/`;
  if (!routePattern.test(route)) throw new Error(`Invalid normalized article route: ${route}`);
  return route;
}

export function isSafeEditorialUrl(value) {
  return safeEditorialUrl(value);
}
