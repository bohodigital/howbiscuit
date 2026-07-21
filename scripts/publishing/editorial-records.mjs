import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { load as parseYaml } from 'js-yaml';
import { z } from 'zod';

import { isSafeEditorialUrl } from './contracts.mjs';
import { stableJson } from './stable-json.mjs';

export const EDITORIAL_RECORD_SCHEMA_VERSION = '1.0.0';
const MAX_RECORD_BYTES = 256 * 1024;
const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const nonEmpty = z.string().min(1);
const stringList = z.array(nonEmpty).default([]);
const idList = z.array(id).default([]);
const activeStatus = z.enum(['draft', 'active', 'retired', 'disallowed']);
const workflowState = z.enum(['draft', 'review', 'approved', 'published', 'retired']);
const workflowHistoryEntry = z.object({ state: workflowState, at: date, actor: nonEmpty }).strict();

const ideaScoreComponents = z.object({
  durability: z.number().int().min(1).max(5),
  productRelevance: z.number().int().min(1).max(5),
  evidenceFeasibility: z.number().int().min(1).max(5),
  opportunity: z.number().int().min(1).max(5),
  productionEffort: z.number().int().min(1).max(5),
  risk: z.number().int().min(1).max(5),
}).strict();

function ideaTotal(components) {
  return components.durability
    + components.productRelevance
    + components.evidenceFeasibility
    + components.opportunity
    + (6 - components.productionEffort)
    + (6 - components.risk);
}

export function createEditorialSchemas(taxonomy) {
  const categories = taxonomy.PUBLIC_CATEGORIES.map(({ id: categoryId }) => categoryId);
  const topics = taxonomy.PUBLIC_CATEGORIES.flatMap((category) => category.topics.map(({ id: topicId }) => topicId));
  const idea = z.object({
    schemaVersion: z.literal(EDITORIAL_RECORD_SCHEMA_VERSION),
    id,
    title: nonEmpty,
    proposedCategory: z.enum(categories).nullable(),
    proposedTopics: z.array(z.enum(topics)),
    userProblem: nonEmpty,
    intendedAudience: nonEmpty,
    durability: nonEmpty,
    productRelevance: nonEmpty,
    evidenceFeasibility: nonEmpty,
    competitionOpportunity: nonEmpty,
    productionEffort: nonEmpty,
    risk: nonEmpty,
    scoreComponents: ideaScoreComponents,
    totalScore: z.number().int(),
    status: z.enum(['candidate', 'selected', 'briefed', 'published', 'retired']),
    notes: stringList,
  }).strict().superRefine((record, context) => {
    if (record.totalScore !== ideaTotal(record.scoreComponents)) {
      context.addIssue({ code: 'custom', path: ['totalScore'], message: 'totalScore must equal the deterministic score components.' });
    }
    if (record.proposedCategory === null && record.proposedTopics.length !== 0) {
      context.addIssue({ code: 'custom', path: ['proposedTopics'], message: 'Categoryless ideas cannot propose taxonomy topics.' });
    }
    if (record.proposedCategory !== null) {
      for (const topicId of record.proposedTopics) {
        if (!taxonomy.hasTargetTopic(record.proposedCategory, topicId)) {
          context.addIssue({ code: 'custom', path: ['proposedTopics'], message: 'Proposed topics must belong to the proposed category.' });
        }
      }
    }
  });
  const brief = z.object({
    schemaVersion: z.literal(EDITORIAL_RECORD_SCHEMA_VERSION), id, ideaId: id, intendedArticleId: id,
    researchQuestion: nonEmpty, userIntent: nonEmpty, scope: stringList, exclusions: stringList,
    requiredClaims: stringList, prohibitedClaims: stringList, requiredSourceTypes: stringList,
    candidateSourceIds: idList, testingNeeds: stringList, mediaNeeds: stringList, productNeeds: stringList,
    safetyConsiderations: stringList, unresolvedQuestions: stringList, recommendation: nonEmpty,
    status: z.enum(['draft', 'review', 'approved', 'retired']),
  }).strict();
  const source = z.object({
    schemaVersion: z.literal(EDITORIAL_RECORD_SCHEMA_VERSION), id, title: nonEmpty, publisher: nonEmpty,
    author: nonEmpty.nullable(), canonicalUrl: z.string().refine(isSafeEditorialUrl).nullable(),
    publicationIdentity: nonEmpty.nullable(), publicationDate: date.nullable(), accessedDate: date,
    sourceType: z.enum(['government', 'university', 'standard', 'textbook', 'peer-reviewed', 'first-party', 'editorial-policy']),
    authorityNotes: nonEmpty, archiveNotes: stringList, rightsRestrictions: nonEmpty, status: activeStatus,
  }).strict().superRefine((record, context) => {
    if ((record.canonicalUrl === null) === (record.publicationIdentity === null)) {
      context.addIssue({ code: 'custom', path: ['canonicalUrl'], message: 'Exactly one canonical URL or publication identity is required.' });
    }
  });
  const testing = z.object({
    schemaVersion: z.literal(EDITORIAL_RECORD_SCHEMA_VERSION), id, articleId: id, testedSubject: nonEmpty,
    productIds: idList, tester: nonEmpty, dates: z.array(date).min(1), environment: nonEmpty, method: nonEmpty,
    measurements: z.array(z.object({ name: nonEmpty, value: z.union([z.string(), z.number()]), unit: nonEmpty.nullable() }).strict()),
    observations: stringList, limitations: z.array(nonEmpty).min(1), evidenceArtifacts: stringList,
    claimState: z.enum(['hands-on-tested', 'owner-experience', 'not-hands-on-tested', 'not-applicable']),
    supportsFirstHandClaims: z.boolean(), status: activeStatus,
  }).strict().superRefine((record, context) => {
    const supportedState = ['hands-on-tested', 'owner-experience'].includes(record.claimState);
    if (record.supportsFirstHandClaims !== supportedState) {
      context.addIssue({ code: 'custom', path: ['supportsFirstHandClaims'], message: 'First-hand support must match the evidence state.' });
    }
    if (record.supportsFirstHandClaims && record.evidenceArtifacts.length === 0) {
      context.addIssue({ code: 'custom', path: ['evidenceArtifacts'], message: 'First-hand claims require evidence artifacts.' });
    }
  });
  const mediaRights = z.object({
    schemaVersion: z.literal(EDITORIAL_RECORD_SCHEMA_VERSION), id, articleId: id,
    packageRelativePath: z.string().regex(/^media\/[a-zA-Z0-9._/-]+$/).refine((value) => !value.split('/').includes('..')),
    contentHash: digest, type: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']),
    creator: nonEmpty, source: nonEmpty, rightsBasis: nonEmpty, license: nonEmpty.nullable(),
    permissionDetails: nonEmpty, attribution: nonEmpty, altText: nonEmpty, restrictions: stringList, status: activeStatus,
  }).strict();
  const linkPreview = z.object({
    schemaVersion: z.literal(EDITORIAL_RECORD_SCHEMA_VERSION), id,
    destinationUrl: z.string().refine(isSafeEditorialUrl), title: nonEmpty, description: nonEmpty,
    siteLabel: nonEmpty, capturedDate: date, sourceId: id, mediaId: id.nullable(),
    rightsStatus: z.enum(['not-required', 'registered']), status: activeStatus,
  }).strict().superRefine((record, context) => {
    if ((record.mediaId === null) !== (record.rightsStatus === 'not-required')) {
      context.addIssue({ code: 'custom', path: ['rightsStatus'], message: 'Preview media requires registered rights; media-free previews must use not-required.' });
    }
  });
  const approval = z.object({
    schemaVersion: z.literal(EDITORIAL_RECORD_SCHEMA_VERSION), id, articleId: id, approvingActor: nonEmpty,
    timestamp: z.iso.datetime({ offset: true }), packageDigest: digest,
    approvedState: z.literal('published'), note: nonEmpty, status: z.enum(['active', 'superseded', 'revoked']),
  }).strict();
  const latexGovernance = z.object({
    schemaVersion: z.literal(EDITORIAL_RECORD_SCHEMA_VERSION), articleId: id, ideaId: id, briefId: id, approvalId: id,
    sourceIds: z.array(id).min(1), testingIds: z.array(id).min(1), mediaIds: idList,
    productIds: idList, productGroupIds: idList, linkPreviewIds: idList, destinationIds: idList,
    priceClaims: idList, recommendationClaims: idList,
    workflow: z.object({ state: workflowState, history: z.array(workflowHistoryEntry).min(1) }).strict(),
  }).strict();
  return Object.freeze({ idea, brief, source, testing, mediaRights, linkPreview, approval, latexGovernance });
}

const TRANSITIONS = new Map([
  ['draft', new Set(['review'])],
  ['review', new Set(['approved'])],
  ['approved', new Set(['published'])],
  ['published', new Set(['retired'])],
  ['retired', new Set()],
]);

export function validateWorkflow(workflow, label) {
  if (!workflow?.history?.length) throw new Error(`${label}: workflow history is required`);
  if (workflow.history[0].state !== 'draft') throw new Error(`${label}: workflow must start at draft`);
  for (let index = 1; index < workflow.history.length; index += 1) {
    const previous = workflow.history[index - 1];
    const current = workflow.history[index];
    if (!TRANSITIONS.get(previous.state)?.has(current.state)) {
      throw new Error(`${label}: invalid workflow transition ${previous.state} -> ${current.state}`);
    }
    if (current.at < previous.at) throw new Error(`${label}: workflow history must be chronological`);
  }
  const finalState = workflow.history.at(-1).state;
  if (finalState !== workflow.state) throw new Error(`${label}: workflow state must match its final history entry`);
  return true;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function loadKind(root, directory, schema) {
  const recordRoot = path.join(root, 'content', directory);
  if (!existsSync(recordRoot)) return new Map();
  const records = new Map();
  for (const entry of readdirSync(recordRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    if (entry.name.startsWith('.')) continue;
    if (!entry.isFile() || !entry.name.endsWith('.yaml')) throw new Error(`content/${directory}/${entry.name}: unexpected record entry`);
    const filePath = path.join(recordRoot, entry.name);
    const status = lstatSync(filePath);
    if (status.isSymbolicLink() || !status.isFile() || status.size > MAX_RECORD_BYTES) throw new Error(`content/${directory}/${entry.name}: unsafe record file`);
    const parsed = schema.parse(parseYaml(readFileSync(filePath, 'utf8')));
    if (records.has(parsed.id)) throw new Error(`Duplicate ${directory} ID: ${parsed.id}`);
    records.set(parsed.id, Object.freeze({ ...parsed, recordDigest: sha256(stableJson(parsed)) }));
  }
  return records;
}

export async function loadEditorialRecords(root, taxonomy) {
  const schemas = createEditorialSchemas(taxonomy);
  const records = {
    ideas: loadKind(root, 'ideas', schemas.idea),
    briefs: loadKind(root, 'briefs', schemas.brief),
    sources: loadKind(root, 'sources', schemas.source),
    testing: loadKind(root, 'testing', schemas.testing),
    mediaRights: loadKind(root, 'media-rights', schemas.mediaRights),
    linkPreviews: loadKind(root, 'link-previews', schemas.linkPreview),
    approvals: loadKind(root, 'approvals', schemas.approval),
  };
  const sourceIdentities = new Set();
  for (const source of records.sources.values()) {
    const identity = source.canonicalUrl ?? source.publicationIdentity;
    if (sourceIdentities.has(identity)) throw new Error(`Duplicate source identity: ${identity}`);
    sourceIdentities.add(identity);
  }
  for (const brief of records.briefs.values()) {
    if (!records.ideas.has(brief.ideaId)) throw new Error(`Brief ${brief.id}: unresolved idea ${brief.ideaId}`);
    for (const sourceId of brief.candidateSourceIds) if (!records.sources.has(sourceId)) throw new Error(`Brief ${brief.id}: unresolved source ${sourceId}`);
  }
  for (const preview of records.linkPreviews.values()) {
    const source = records.sources.get(preview.sourceId);
    if (!source || source.status !== 'active') throw new Error(`Link preview ${preview.id}: unresolved or inactive source ${preview.sourceId}`);
    if (preview.mediaId !== null) {
      const media = records.mediaRights.get(preview.mediaId);
      if (!media || media.status !== 'active') throw new Error(`Link preview ${preview.id}: unresolved or inactive media ${preview.mediaId}`);
    }
  }
  return Object.freeze({ schemas, ...records });
}

export function editorialJsonSchemas(schemas) {
  return Object.fromEntries(Object.entries(schemas).map(([name, schema]) => [name, z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input' })]));
}

export function scoreIdeas(ideas) {
  return [...ideas.values()].map((record) => Object.freeze({ id: record.id, totalScore: ideaTotal(record.scoreComponents) }))
    .sort((left, right) => right.totalScore - left.totalScore || left.id.localeCompare(right.id, 'en'));
}

export const FIRST_HAND_CLAIM_PATTERN = /(?:\b(?:[Ww]e|I)\b|\b(?:[Oo]ur|[Mm]y)\s+(?:tests?|testing|evaluation|measurements?|observations?|experience)\b|\b(?:[Ii]n|[Ff]rom)\s+(?:our|my)\s+(?:tests?|testing|evaluation|experience)\b|\b[Hh]ands-on\b|\b[Pp]ersonally used\b)/;

export function validateFirstHandClaims(text, testingRecords, label) {
  const claimText = text
    .replace(/\bnot[- ]hands-on[- ]tested\b/gi, '')
    .replace(/\bbecause I said so\b/gi, '');
  if (!FIRST_HAND_CLAIM_PATTERN.test(claimText)) return true;
  if (!testingRecords.some((record) => record.status === 'active' && record.supportsFirstHandClaims)) {
    throw new Error(`${label}: first-hand claim requires suitable testing or usage evidence`);
  }
  return true;
}

export function publicationDigest({ articleId, files, referencedRecords }) {
  const fileEntries = Object.entries(files).map(([filePath, contents]) => ({ path: filePath, sha256: sha256(contents) }))
    .sort((left, right) => left.path.localeCompare(right.path, 'en'));
  const references = referencedRecords.map(({ kind, record }) => ({ kind, id: record.id, digest: record.recordDigest }))
    .sort((left, right) => left.kind.localeCompare(right.kind, 'en') || left.id.localeCompare(right.id, 'en'));
  return sha256(stableJson({ schemaVersion: EDITORIAL_RECORD_SCHEMA_VERSION, articleId, files: fileEntries, references }));
}

export function resolveActiveRecords(ids, records, kind, label, { allowMissing = false } = {}) {
  return ids.map((recordId) => {
    const record = records.get(recordId);
    if (!record && allowMissing) return null;
    if (!record) throw new Error(`${label}: unresolved ${kind} ${recordId}`);
    if (record.status !== 'active' && record.status !== 'published') throw new Error(`${label}: ${kind} ${recordId} is ${record.status}`);
    return record;
  });
}

export function linkPreviewOrOrdinaryLink(previewId, destinationUrl, records) {
  const preview = records.get(previewId);
  if (!preview || preview.status !== 'active') return Object.freeze({ kind: 'ordinary-link', href: destinationUrl });
  return Object.freeze({ kind: 'registered-preview', ...preview });
}
