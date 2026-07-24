import { z } from 'zod';

const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const route = z.string().regex(/^\/tools\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/);
const date = z.preprocess(
  (value) => value instanceof Date ? value.toISOString().slice(0, 10) : value,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
);

export const toolManifestSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  id,
  slug: id,
  title: z.string().trim().min(8).max(100),
  description: z.string().trim().min(40).max(240),
  category: z.literal('tools'),
  topic: id,
  toolType: z.enum(['explorer', 'browser', 'explainer']),
  publicationStatus: z.enum(['published', 'draft', 'retired']),
  approval: z.object({
    state: z.enum(['approved', 'pending']),
    reviewer: z.string().trim().min(2).max(120),
    approvedAt: date.nullable(),
  }).strict(),
  sourceReleaseIds: z.array(id).min(1).max(5),
  researchPacketIds: z.array(id).min(1).max(20),
  datasetIds: z.array(z.enum([
    'geographyRelationships', 'energyObservations', 'foods', 'foodNutrients',
    'marketReports', 'marketObservations', 'agriculturalStatistics',
  ])).min(1),
  visibility: z.enum(['public', 'internal']),
  requiresJavaScript: z.boolean(),
  noJavaScriptFallback: z.literal('complete-static-table'),
  analyticsEventPolicy: z.literal('page-view-only'),
  inputPrivacy: z.literal('bounded-public-enum-not-recorded'),
  canonicalRoute: route,
  social: z.object({ title: z.string().min(8), description: z.string().min(40) }).strict(),
  relatedArticles: z.array(z.string().regex(/^\/articles\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/)).max(10),
  relatedTools: z.array(route).max(10),
  updatedDate: date,
  reviewDate: date,
}).strict().superRefine((value, context) => {
  if (value.slug !== value.id || value.canonicalRoute !== `/tools/${value.slug}/`) {
    context.addIssue({ code: 'custom', path: ['canonicalRoute'], message: 'ID, slug, and canonical route must agree.' });
  }
  if (value.publicationStatus === 'published' && (value.visibility !== 'public' || value.approval.state !== 'approved' || !value.approval.approvedAt)) {
    context.addIssue({ code: 'custom', path: ['approval'], message: 'Published tools require public visibility and dated approval.' });
  }
});

export const toolDefinitionSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  kind: z.enum(['energy-benchmark', 'zip-relationship', 'food-identity', 'crop-production', 'market-context']),
  inputs: z.array(z.object({
    id,
    label: z.string().trim().min(2).max(80),
    type: z.literal('select'),
    field: z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/),
    maximumOptions: z.number().int().min(1).max(200),
    sensitive: z.literal(false),
  }).strict()).max(5),
  table: z.object({
    caption: z.string().min(10).max(180),
    columns: z.array(z.object({
      field: z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/),
      label: z.string().min(1).max(80),
    }).strict()).min(2).max(12),
  }).strict(),
  chart: z.object({
    enabled: z.boolean(),
    xField: z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/).nullable(),
    yField: z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/).nullable(),
    accessibleSummary: z.string().min(20).max(240),
  }).strict(),
  limitation: z.string().min(40).max(500),
  providerCallsOnPageLoad: z.literal(false),
  transmitsInput: z.literal(false),
}).strict();

export const toolManifestJsonSchema = Object.freeze(z.toJSONSchema(toolManifestSchema, {
  target: 'draft-2020-12',
  reused: 'ref',
}));
export const toolDefinitionJsonSchema = Object.freeze(z.toJSONSchema(toolDefinitionSchema, {
  target: 'draft-2020-12',
  reused: 'ref',
}));

export const toolPackageJsonSchema = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://howbiscuit.com/schemas/tool-package.schema.json',
  title: 'How Biscuit Tool Package',
  type: 'object',
  additionalProperties: false,
  required: ['manifest', 'definition', 'content'],
  properties: {
    manifest: { type: 'object' },
    definition: { type: 'object' },
    content: { type: 'string', minLength: 40 },
  },
});

export function assertSafeToolContent(content, label) {
  if (typeof content !== 'string' || content.trim().length < 40) throw new Error(`${label}: substantive content.md required`);
  if (/<\/?[A-Za-z]|<script|\bon\w+\s*=|javascript:|::[a-z]/i.test(content)) throw new Error(`${label}: raw HTML, scripts, and directives are not allowed`);
  if (/https?:\/\/\S+/i.test(content)) throw new Error(`${label}: external URLs belong in governed source metadata`);
  return content.replaceAll('\r\n', '\n').trim();
}
