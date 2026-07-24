import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import { dump as dumpYaml, load as parseYaml } from 'js-yaml';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

import { loadTypeScriptModule } from '../lib/load-typescript-module.mjs';
import { discoverTrackedPublicSources } from '../../src/lib/public-content/source-adapter.mjs';
import { compileLatexArticle } from '../../src/lib/latex/article-compiler.mjs';
import {
  ARTICLE_PACKAGE_SCHEMA_VERSION,
  NORMALIZED_PUBLIC_ARTICLE_SCHEMA_VERSION,
  createArticleManifestJsonSchema,
  createArticleManifestSchema,
  isSafeEditorialUrl,
  normalizedArticleRoute,
} from './contracts.mjs';
import {
  loadEditorialRecords,
  publicationDigest,
  resolveActiveRecords,
  validateFirstHandClaims,
  validateWorkflow,
} from './editorial-records.mjs';
import {
  loadProductRecords,
  renderCommerceDirective,
  resolveArticleCommerce,
} from './product-records.mjs';
import { stableJson } from './stable-json.mjs';

const scriptsRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const repositoryRoot = path.dirname(scriptsRoot);
export const ARTICLE_PACKAGE_ROOT = path.join(repositoryRoot, 'content', 'articles');
export const NORMALIZED_OUTPUT_PATH = path.join(repositoryRoot, 'src', 'generated', 'publishing', 'articles.v1.json');
export const GENERATED_SCHEMA_PATH = path.join(repositoryRoot, 'schemas', 'generated', 'article-manifest-v1.schema.json');
export const GENERATED_ARTICLE_ROOT = path.join(repositoryRoot, 'src', 'content', 'docs', 'articles');
const RESEARCH_PACKET_BUNDLE_PATH = path.join(repositoryRoot, 'src', 'generated', 'data', 'research-packets.v1.json');

const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_ARTICLE_BYTES = 1024 * 1024;
const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 25 * 1024 * 1024;
const SAFE_MEDIA_EXTENSIONS = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.webp']);
const DIRECTIVE_CONTRACTS = Object.freeze({
  product: Object.freeze(['product', 'destination']),
  'product-group': Object.freeze(['group']),
  media: Object.freeze(['media']),
  'link-preview': Object.freeze(['preview']),
  price: Object.freeze(['claim']),
  presentation: Object.freeze(['block']),
  research: Object.freeze(['packet']),
  'research-summary': Object.freeze(['packet']),
  'research-table': Object.freeze(['packet', 'table']),
  'research-chart': Object.freeze(['packet', 'chart']),
  'research-source-note': Object.freeze(['packet']),
});
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const GENERATED_BY = 'howbiscuit-article-package-compiler-v1';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function relativeFromRoot(filePath, root = repositoryRoot) {
  return path.relative(root, filePath).replaceAll('\\', '/');
}

function safeRead(filePath, maximumBytes) {
  const status = lstatSync(filePath);
  assert(!status.isSymbolicLink(), `${relativeFromRoot(filePath)}: symlinks are not allowed`);
  assert(status.isFile(), `${relativeFromRoot(filePath)}: expected a regular file`);
  assert(status.size <= maximumBytes, `${relativeFromRoot(filePath)}: file exceeds ${maximumBytes} bytes`);
  return readFileSync(filePath, 'utf8').replaceAll('\r\n', '\n');
}

function inspectMedia(mediaRoot) {
  if (!lstatSync(mediaRoot).isDirectory()) throw new Error(`${relativeFromRoot(mediaRoot)}: media must be a directory`);
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(mediaRoot, absolute).replaceAll('\\', '/');
      assert(!relative.startsWith('../') && !path.isAbsolute(relative), `${relative}: media path traversal is not allowed`);
      const status = lstatSync(absolute);
      assert(!status.isSymbolicLink(), `${relativeFromRoot(absolute)}: symlinks are not allowed`);
      if (status.isDirectory()) visit(absolute);
      else {
        assert(status.isFile(), `${relativeFromRoot(absolute)}: unsupported media entry`);
        assert(SAFE_MEDIA_EXTENSIONS.has(path.extname(entry.name).toLowerCase()), `${relativeFromRoot(absolute)}: unsafe media format`);
        assert(status.size <= MAX_MEDIA_BYTES, `${relativeFromRoot(absolute)}: media exceeds ${MAX_MEDIA_BYTES} bytes`);
        files.push({ path: relative, size: status.size, hash: sha256(readFileSync(absolute)) });
      }
    }
  };
  visit(mediaRoot);
  return files;
}

function parseDirectiveAttributes(source, sourceLabel) {
  const attributes = {};
  let cursor = 0;
  const matcher = /([a-z][a-z0-9-]*)="([^"]*)"/g;
  for (const match of source.matchAll(matcher)) {
    const skipped = source.slice(cursor, match.index);
    assert(/^\s*$/.test(skipped), `${sourceLabel}: malformed directive attributes`);
    assert(!(match[1] in attributes), `${sourceLabel}: duplicate directive attribute ${match[1]}`);
    attributes[match[1]] = match[2];
    cursor = match.index + match[0].length;
  }
  assert(/^\s*$/.test(source.slice(cursor)), `${sourceLabel}: malformed directive attributes`);
  return attributes;
}

export function validateMarkdown(markdown, manifest, sourceLabel = 'article.md') {
  const normalized = markdown.replaceAll('\r\n', '\n');
  assert(!/^\s*(?:import|export)\s/m.test(normalized), `${sourceLabel}: JavaScript imports and exports are not allowed`);
  assert(!/<\s*\/?[A-Za-z][^>]*>/.test(normalized), `${sourceLabel}: raw HTML, scripts, and JSX are not allowed`);
  const withoutDirectives = normalized.split('\n').filter((line) => !line.trimStart().startsWith('::')).join('\n');
  assert(!/[{}]/.test(withoutDirectives), `${sourceLabel}: executable template expressions are not allowed`);
  const markdownTree = unified().use(remarkParse).parse(normalized);
  visit(markdownTree, ['html', 'link', 'image', 'definition'], (node) => {
    assert(node.type !== 'html', `${sourceLabel}: raw HTML, scripts, and JSX are not allowed`);
    const target = typeof node.url === 'string' ? node.url : null;
    if (target !== null) assert(target.startsWith('#') || isSafeEditorialUrl(target), `${sourceLabel}: unsafe Markdown URL ${target}`);
  });

  const directives = [];
  for (const [index, line] of normalized.split('\n').entries()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('::')) continue;
    const match = trimmed.match(/^::([a-z-]+)\{(.*)\}$/);
    assert(match, `${sourceLabel}:${index + 1}: malformed directive`);
    const [, kind, attributeSource] = match;
    const required = DIRECTIVE_CONTRACTS[kind];
    assert(required, `${sourceLabel}:${index + 1}: unknown directive ${kind}`);
    const attributes = parseDirectiveAttributes(attributeSource, `${sourceLabel}:${index + 1}`);
    assert(JSON.stringify(Object.keys(attributes).sort()) === JSON.stringify([...required].sort()), `${sourceLabel}:${index + 1}: ${kind} directive attributes must be ${required.join(', ')}`);
    for (const [key, value] of Object.entries(attributes)) {
      assert(ID_PATTERN.test(value), `${sourceLabel}:${index + 1}: ${key} must be a stable record ID`);
    }
    directives.push(Object.freeze({ kind, attributes: Object.freeze(attributes), line: index + 1 }));
  }

  const references = new Map([
    ['product', [{ attribute: 'product', field: 'productIds' }, { attribute: 'destination', field: 'destinationIds' }]],
    ['product-group', [{ attribute: 'group', field: 'productGroupIds' }]],
    ['media', [{ attribute: 'media', field: 'mediaIds' }]],
    ['link-preview', [{ attribute: 'preview', field: 'linkPreviewIds' }]],
    ['price', [{ attribute: 'claim', field: 'priceClaims' }]],
    ['presentation', [{ attribute: 'block', field: 'presentationBlocks', project: (block) => block.id }]],
  ]);
  for (const [kind, contracts] of references) {
    const matching = directives.filter((directive) => directive.kind === kind);
    for (const contract of contracts) {
      const declared = (manifest[contract.field] ?? []).map(contract.project ?? ((value) => value));
      const used = matching.map((directive) => directive.attributes[contract.attribute]);
      for (const value of used) assert(declared.includes(value), `${sourceLabel}: unresolved ${kind} ${contract.attribute} reference ${value}`);
      assert(new Set(used).size === used.length, `${sourceLabel}: duplicate ${kind} ${contract.attribute} reference`);
      assert(JSON.stringify([...used].sort()) === JSON.stringify([...declared].sort()), `${sourceLabel}: declared ${contract.field} must be used exactly once`);
    }
  }
  const researchDirectives = directives.filter(({ kind }) => kind === 'research' || kind.startsWith('research-'));
  const declaredPackets = manifest.researchPacketIds ?? [];
  for (const directive of researchDirectives) {
    assert(declaredPackets.includes(directive.attributes.packet), `${sourceLabel}: unresolved ${directive.kind} packet reference ${directive.attributes.packet}`);
  }
  for (const packetId of declaredPackets) {
    assert(researchDirectives.some(({ attributes }) => attributes.packet === packetId), `${sourceLabel}: declared researchPacketIds must be rendered at least once (${packetId})`);
  }
  const researchKeys = researchDirectives.map(({ kind, attributes }) => `${kind}:${attributes.packet}:${attributes.table ?? attributes.chart ?? ''}`);
  assert(new Set(researchKeys).size === researchKeys.length, `${sourceLabel}: duplicate research rendering directive`);

  const citations = [...normalized.matchAll(/\[@([a-z0-9]+(?:-[a-z0-9]+)*)\]/g)].map((match) => match[1]);
  for (const sourceId of citations) {
    assert(manifest.sourceIds.includes(sourceId), `${sourceLabel}: unresolved source citation ${sourceId}`);
  }
  return Object.freeze({ directives: Object.freeze(directives), citations: Object.freeze(citations) });
}

function packageFileInventory(packagePath) {
  const entries = readdirSync(packagePath, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name, 'en'));
  const expected = new Set(['article.md', 'manifest.yaml', 'media']);
  for (const entry of entries) assert(expected.has(entry.name), `${relativeFromRoot(path.join(packagePath, entry.name))}: unexpected package entry`);
  assert(entries.some(({ name }) => name === 'manifest.yaml'), `${relativeFromRoot(packagePath)}: manifest.yaml is required`);
  assert(entries.some(({ name }) => name === 'article.md'), `${relativeFromRoot(packagePath)}: article.md is required`);
  const mediaEntry = entries.find(({ name }) => name === 'media');
  const media = mediaEntry ? inspectMedia(path.join(packagePath, 'media')) : [];
  return media;
}

function wordCount(markdown, presentationBlocks) {
  const presentationText = presentationBlocks.flatMap((block) => {
    if (block.kind === 'mechanism') return block.steps.flatMap(({ title, body }) => [title, body]);
    if (block.kind === 'mistake-grid') return block.items.flatMap(({ title, body, fix }) => [title, body, fix ?? '']);
    return [block.title, block.body];
  }).join(' ');
  const plain = `${markdown}\n${presentationText}`
    .replace(/^::.*$/gm, '')
    .replace(/\[@[a-z0-9-]+\]/g, '')
    .replace(/[`*_#[\]()>|~-]/g, ' ');
  return plain.split(/\s+/).filter(Boolean).length;
}

function escapeHtmlAttribute(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function compileCitations(line, normalizedArticle) {
  const notes = new Map(normalizedArticle.sourceNotes.items.map((source, index) => [source.id, { source, index }]));
  return line.replace(/\[@([a-z0-9]+(?:-[a-z0-9]+)*)\]/g, (_, sourceId) => {
    const { source, index } = notes.get(sourceId);
    return `<sup><a href="#source-${sourceId}" aria-label="Source ${index + 1}: ${escapeHtmlAttribute(source.title)}">[${index + 1}]</a></sup>`;
  });
}

export function compileDirectiveLine(line, presentationById = new Map(), commerce = { products: [], productGroups: [], destinations: [], priceClaims: [] }) {
  if (!line.trim().startsWith('::')) return line;
  const match = line.trim().match(/^::([a-z-]+)\{(.*)\}$/);
  const attributes = parseDirectiveAttributes(match[2], 'validated directive');
  const commerceOutput = renderCommerceDirective(match[1], attributes, commerce);
  if (commerceOutput !== null) return commerceOutput;
  if (match[1] === 'media') return `> Registered media: ${attributes.media}`;
  if (match[1] === 'link-preview') return `> Link preview: ${attributes.preview}`;
  if (match[1] === 'research' || match[1] === 'research-summary') return `<ResearchBlock kind="summary" packetId="${attributes.packet}" />`;
  if (match[1] === 'research-table') return `<ResearchBlock kind="table" packetId="${attributes.packet}" blockId="${attributes.table}" />`;
  if (match[1] === 'research-chart') return `<ResearchBlock kind="chart" packetId="${attributes.packet}" blockId="${attributes.chart}" />`;
  if (match[1] === 'research-source-note') return `<ResearchBlock kind="source-note" packetId="${attributes.packet}" />`;
  const block = presentationById.get(attributes.block);
  if (block.kind === 'mechanism') return `<MechanismSteps steps={${JSON.stringify(block.steps)}} />`;
  if (block.kind === 'mistake-grid') return `<MistakeGrid items={${JSON.stringify(block.items)}} />`;
  return `<BiscuitBox variant="${block.variant}" title="${escapeHtmlAttribute(block.title)}" body="${escapeHtmlAttribute(block.body)}" />`;
}

function compiledMdx(normalizedArticle, markdown) {
  const sourceNotes = normalizedArticle.sourceNotes.items.map(({ id, title, publisher, href }) => ({ id, title, publisher, href }));
  const frontmatter = {
    title: normalizedArticle.title,
    description: normalizedArticle.description,
    kind: 'article',
    articleFormat: 'standard',
    categoryId: normalizedArticle.categoryId,
    topicId: normalizedArticle.topicId,
    articleType: normalizedArticle.articleType,
    editorialClassification: normalizedArticle.editorialClassification,
    editorialPriority: normalizedArticle.editorialPriority,
    answerSummary: normalizedArticle.answerSummary,
    ...(normalizedArticle.problemLabel === null ? {} : { problemLabel: normalizedArticle.problemLabel }),
    evidence: normalizedArticle.evidence,
    readTime: normalizedArticle.readTime,
    feed: normalizedArticle.feedEligible,
    featured: normalizedArticle.featured,
    pubDate: normalizedArticle.publishedDate,
    updatedDate: normalizedArticle.updatedDate,
    lastUpdated: normalizedArticle.updatedDate,
    testing: normalizedArticle.testing,
    sourceNotes: { state: 'structured', items: sourceNotes },
    relatedContent: normalizedArticle.relatedContent,
    disclosure: normalizedArticle.disclosure,
    generatedBy: GENERATED_BY,
    generatedSource: normalizedArticle.bodySourcePath,
  };
  const presentationById = new Map(normalizedArticle.presentationBlocks.map((block) => [block.id, block]));
  const componentKinds = new Set(normalizedArticle.presentationBlocks.map((block) => block.kind));
  const hasResearch = normalizedArticle.directives.some(({ kind }) => kind === 'research' || kind.startsWith('research-'));
  const imports = [
    componentKinds.has('mechanism') ? "import MechanismSteps from '../../../../components/MechanismSteps.astro';" : null,
    componentKinds.has('mistake-grid') ? "import MistakeGrid from '../../../../components/MistakeGrid.astro';" : null,
    componentKinds.has('callout') ? "import BiscuitBox from '../../../../components/BiscuitBox.astro';" : null,
    hasResearch ? "import ResearchBlock from '../../../../components/data/ResearchBlock.astro';" : null,
  ].filter(Boolean).join('\n');
  const body = markdown.split('\n')
    .map((line) => compileDirectiveLine(line, presentationById, normalizedArticle.commerce))
    .map((line) => compileCitations(line, normalizedArticle))
    .join('\n')
    .trimEnd();
  return `---\n${dumpYaml(frontmatter, { noRefs: true, lineWidth: 120, sortKeys: false }).trimEnd()}\n---\n${imports ? `\n${imports}\n` : ''}\n${body}\n`;
}

export function validateResearchDirectives(directives, manifest, sourceLabel = 'article.md') {
  const packetPayload = JSON.parse(readFileSync(RESEARCH_PACKET_BUNDLE_PATH, 'utf8'));
  const packetById = new Map(packetPayload.packets.map((packet) => [packet.id, packet]));
  const researchDirectives = directives.filter(({ kind }) => kind === 'research' || kind.startsWith('research-'));
  for (const directive of researchDirectives) {
    const packet = packetById.get(directive.attributes.packet);
    assert(packet, `${sourceLabel}: missing research packet ${directive.attributes.packet}`);
    assert(packet.status === 'validated' && packet.approval?.state === 'approved', `${sourceLabel}: draft, retired, or unapproved research packet ${packet.id}`);
    assert(packet.staleness?.state === 'current', `${sourceLabel}: stale research packet ${packet.id}`);
    assert(packet.claims?.length > 0 && packet.claims.every((claim) => claim.evidenceRecordIds?.length && claim.classification !== 'unsupported'), `${sourceLabel}: missing or unsupported evidence in ${packet.id}`);
    if (directive.kind === 'research-table') assert(packet.tables.some(({ id }) => id === directive.attributes.table), `${sourceLabel}: missing research table ${directive.attributes.table}`);
    if (directive.kind === 'research-chart') assert(packet.charts.some(({ id }) => id === directive.attributes.chart), `${sourceLabel}: missing research chart ${directive.attributes.chart}`);
    if (packet.claims.some(({ classification }) => classification === 'retailer-price-observation')) {
      assert(packet.geography !== 'not-applicable' && packet.observationDates.length > 0, `${sourceLabel}: Kroger price packet lacks store and observation scope`);
    }
    if (packet.claims.some(({ classification }) => classification === 'food-composition')) {
      assert(packet.claims.every((claim) => claim.classification !== 'food-composition' || claim.text.match(/\b(?:g|mg|µg|kcal)\b/i)), `${sourceLabel}: food-composition claim lacks unit`);
    }
  }
  for (const packetId of manifest.researchPacketIds ?? []) assert(packetById.has(packetId), `${sourceLabel}: unresolved research packet ${packetId}`);
  return true;
}

export async function createPublishingContext(root = repositoryRoot) {
  const taxonomy = await loadTypeScriptModule(path.join(root, 'src', 'config', 'public-taxonomy.ts'));
  const editorial = await loadEditorialRecords(root, taxonomy);
  const commerce = await loadProductRecords(root, editorial);
  const manifestSchema = createArticleManifestSchema(taxonomy);
  const jsonSchema = createArticleManifestJsonSchema(taxonomy);
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  ajv.addKeyword({
    keyword: 'x-hb-manifest-cross-fields',
    schemaType: 'boolean',
    errors: false,
    validate(enabled, data) {
      if (!enabled || !data || typeof data !== 'object') return true;
      if (data.id !== data.slug || data.updatedAt < data.publishedAt) return false;
      const presentationIds = Array.isArray(data.presentationBlocks) ? data.presentationBlocks.map(({ id }) => id) : [];
      if (new Set(presentationIds).size !== presentationIds.length) return false;
      if (data.articleType === 'guide') {
        return typeof data.categoryId === 'string'
          && Array.isArray(data.topicIds)
          && data.topicIds.length === 1
          && taxonomy.hasTargetTopic(data.categoryId, data.topicIds[0]);
      }
      return data.articleType === 'editorial-standard' && data.categoryId === null && data.topicIds?.length === 0;
    },
  });
  const validateJsonSchema = ajv.compile(jsonSchema);
  return Object.freeze({ root, taxonomy, editorial, commerce, manifestSchema, jsonSchema, validateJsonSchema });
}

export function validateManifestParity(rawManifest, context, sourceLabel = 'manifest.yaml') {
  const jsonValid = context.validateJsonSchema(rawManifest);
  const runtime = context.manifestSchema.safeParse(rawManifest);
  if (jsonValid !== runtime.success) {
    throw new Error(`${sourceLabel}: JSON Schema/runtime validation parity failure`);
  }
  if (!runtime.success) {
    const runtimeMessages = runtime.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`);
    const schemaMessages = (context.validateJsonSchema.errors ?? []).map((issue) => `${issue.instancePath || '<root>'}: ${issue.message}`);
    throw new Error(`${sourceLabel}: invalid manifest\n${[...runtimeMessages, ...schemaMessages].join('\n')}`);
  }
  return runtime.data;
}

function resolveEditorialGovernance(governance, files, media, context, label, claimText) {
  validateWorkflow(governance.workflow, label);
  const { editorial } = context;
  const idea = editorial.ideas.get(governance.ideaId);
  assert(idea?.status === 'published', `${label}: idea ${governance.ideaId} must resolve to a published record`);
  const brief = editorial.briefs.get(governance.briefId);
  assert(brief?.status === 'approved', `${label}: brief ${governance.briefId} must resolve to an approved record`);
  assert(brief.ideaId === idea.id && brief.intendedArticleId === governance.id, `${label}: brief linkage does not match article and idea`);
  const sources = resolveActiveRecords(governance.sourceIds, editorial.sources, 'source', label);
  const researchPacketIds = new Set(JSON.parse(readFileSync(RESEARCH_PACKET_BUNDLE_PATH, 'utf8')).packets.map(({id})=>id));
  for (const packetId of governance.researchPacketIds ?? []) {
    assert(researchPacketIds.has(packetId), `${label}: unresolved research packet ${packetId}`);
  }
  const testingRecords = resolveActiveRecords(governance.testingIds, editorial.testing, 'testing record', label);
  assert(testingRecords.length === 1, `${label}: schema v1 requires exactly one testing record`);
  for (const testing of testingRecords) assert(testing.articleId === governance.id, `${label}: testing record ${testing.id} belongs to another article`);
  validateFirstHandClaims(claimText, testingRecords, label);

  const mediaRecords = resolveActiveRecords(governance.mediaIds, editorial.mediaRights, 'media-rights record', label);
  const registeredMediaPaths = new Set();
  for (const mediaRecord of mediaRecords) {
    assert(mediaRecord.articleId === governance.id, `${label}: media ${mediaRecord.id} belongs to another article`);
    const relativeMediaPath = mediaRecord.packageRelativePath.replace(/^media\//, '');
    assert(!registeredMediaPaths.has(relativeMediaPath), `${label}: duplicate media-rights path ${relativeMediaPath}`);
    registeredMediaPaths.add(relativeMediaPath);
    const mediaFile = media.find(({ path: filePath }) => filePath === relativeMediaPath);
    assert(mediaFile, `${label}: media ${mediaRecord.id} file is missing`);
    assert(mediaFile.hash === mediaRecord.contentHash, `${label}: media ${mediaRecord.id} hash mismatch`);
  }
  for (const mediaFile of media) {
    assert(registeredMediaPaths.has(mediaFile.path), `${label}: media file ${mediaFile.path} has no rights record`);
  }
  assert(media.length === registeredMediaPaths.size, `${label}: every package media file must have exactly one rights record`);

  const linkPreviews = resolveActiveRecords(governance.linkPreviewIds, editorial.linkPreviews, 'link-preview record', label);
  for (const preview of linkPreviews) {
    assert(sources.some(({ id }) => id === preview.sourceId), `${label}: link preview ${preview.id} source ${preview.sourceId} is not governed by the article`);
    if (preview.mediaId !== null) {
      assert(mediaRecords.some(({ id }) => id === preview.mediaId), `${label}: link preview ${preview.id} media ${preview.mediaId} is not governed by the article`);
    }
  }
  const commerce = resolveArticleCommerce(governance, context.commerce, editorial, label, claimText);
  const referencedRecords = [
    { kind: 'idea', record: idea },
    { kind: 'brief', record: brief },
    ...sources.map((record) => ({ kind: 'source', record })),
    ...testingRecords.map((record) => ({ kind: 'testing', record })),
    ...mediaRecords.map((record) => ({ kind: 'media-rights', record })),
    ...linkPreviews.map((record) => ({ kind: 'link-preview', record })),
    ...commerce.dependencies,
  ];
  const expectedDigest = publicationDigest({ articleId: governance.id, files, referencedRecords });
  const approval = governance.approvalId === null ? null : editorial.approvals.get(governance.approvalId);
  const published = governance.workflow.state === 'published';
  if (published) {
    assert(approval?.status === 'active', `${label}: publication requires an active owner approval`);
    assert(approval.articleId === governance.id && approval.approvedState === 'published', `${label}: approval is for another article or state`);
    assert(approval.packageDigest === expectedDigest, `${label}: stale approval digest; expected ${expectedDigest}`);
  }
  const sourceNotes = sources.map((source) => {
    assert(source.canonicalUrl !== null, `${label}: public source ${source.id} requires a canonical URL`);
    return Object.freeze({ id: source.id, title: source.title, publisher: source.publisher, href: source.canonicalUrl });
  });
  const testing = testingRecords[0];
  return Object.freeze({
    published,
    idea,
    brief,
    approval,
    expectedDigest,
    sourceNotes: Object.freeze(sourceNotes),
    testing: Object.freeze({ state: testing.claimState, notes: Object.freeze([...testing.limitations]) }),
    commerce,
    referencedRecords: Object.freeze(referencedRecords),
  });
}

export function validateArticlePackage(packagePath, context) {
  const packageStatus = lstatSync(packagePath);
  assert(!packageStatus.isSymbolicLink() && packageStatus.isDirectory(), `${relativeFromRoot(packagePath)}: package must be a real directory`);
  const media = packageFileInventory(packagePath);
  const manifestPath = path.join(packagePath, 'manifest.yaml');
  const articlePath = path.join(packagePath, 'article.md');
  const manifestSource = safeRead(manifestPath, MAX_MANIFEST_BYTES);
  const markdown = safeRead(articlePath, MAX_ARTICLE_BYTES);
  const rawManifest = parseYaml(manifestSource);
  assert(rawManifest && typeof rawManifest === 'object' && !Array.isArray(rawManifest), `${relativeFromRoot(manifestPath)}: manifest must be a mapping`);
  const manifest = validateManifestParity(rawManifest, context, relativeFromRoot(manifestPath));
  assert(path.basename(packagePath) === manifest.slug, `${relativeFromRoot(packagePath)}: directory must match manifest slug`);
  const packageBytes = Buffer.byteLength(manifestSource) + Buffer.byteLength(markdown) + media.reduce((total, item) => total + item.size, 0);
  assert(packageBytes <= MAX_PACKAGE_BYTES, `${relativeFromRoot(packagePath)}: package exceeds ${MAX_PACKAGE_BYTES} bytes`);
  const markdownAnalysis = validateMarkdown(markdown, manifest, relativeFromRoot(articlePath));
  validateResearchDirectives(markdownAnalysis.directives, manifest, relativeFromRoot(articlePath));
  const publicationFiles = Object.fromEntries([
    ['manifest.yaml', manifestSource],
    ['article.md', markdown],
    ...media.map((item) => [`media/${item.path}`, `sha256:${item.hash}`]),
  ]);
  const governance = resolveEditorialGovernance(
    manifest,
    publicationFiles,
    media,
    context,
    relativeFromRoot(packagePath),
    `${markdown}\n${stableJson(manifest)}`,
  );
  const route = normalizedArticleRoute(manifest.slug);
  const bodyDigest = sha256(markdown);
  const packageDigest = sha256(stableJson({ manifest, markdown, media }));
  const words = wordCount(markdown, manifest.presentationBlocks);
  const relatedRoutes = manifest.relatedArticleIds.map((articleId) => normalizedArticleRoute(articleId));
  const normalizedArticle = Object.freeze({
    schemaVersion: NORMALIZED_PUBLIC_ARTICLE_SCHEMA_VERSION,
    kind: 'article',
    sourceKind: 'article-package',
    sourcePath: relativeFromRoot(packagePath),
    bodySourcePath: relativeFromRoot(articlePath),
    generatedContentPath: `src/content/docs/articles/${manifest.slug}/index.mdx`,
    id: manifest.id,
    slug: manifest.slug,
    route,
    canonicalRoute: route,
    pagefindRoute: route,
    rssIdentity: route,
    sitemapIdentity: route,
    title: manifest.title,
    description: manifest.description,
    categoryId: manifest.categoryId,
    topicId: manifest.topicIds[0] ?? null,
    topicIds: manifest.topicIds,
    articleType: manifest.articleType,
    editorialClassification: manifest.articleType,
    articleFormat: 'standard',
    answerSummary: manifest.directAnswer,
    problemLabel: manifest.problemLabels[0] ?? null,
    problemLabels: manifest.problemLabels,
    publishedDate: manifest.publishedAt,
    updatedDate: manifest.updatedAt,
    feedEligible: governance.published,
    searchEligible: governance.published,
    sitemapEligible: governance.published,
    llmsEligible: governance.published,
    featured: manifest.featured,
    editorialPriority: manifest.editorialPriority,
    readTime: `${Math.max(1, Math.ceil(words / 200))} min read`,
    evidence: manifest.evidence.label,
    testing: governance.testing,
    sourceIds: manifest.sourceIds,
    researchPacketIds: manifest.researchPacketIds,
    sourceNotes: Object.freeze({ state: 'structured', items: governance.sourceNotes }),
    testingIds: manifest.testingIds,
    mediaIds: manifest.mediaIds,
    productIds: manifest.productIds,
    productGroupIds: manifest.productGroupIds,
    linkPreviewIds: manifest.linkPreviewIds,
    destinationIds: manifest.destinationIds,
    priceClaims: manifest.priceClaims,
    recommendationClaims: manifest.recommendationClaims,
    commerce: governance.commerce,
    presentationBlocks: manifest.presentationBlocks,
    relatedArticleIds: manifest.relatedArticleIds,
    relatedContent: Object.freeze({ state: 'structured', routes: relatedRoutes }),
    disclosure: manifest.disclosure,
    workflow: manifest.workflow,
    authors: manifest.authors,
    directives: markdownAnalysis.directives,
    citations: markdownAnalysis.citations,
    media,
    bodyDigest,
    packageDigest,
    approvalDigest: governance.expectedDigest,
    approvalId: manifest.approvalId,
    draft: manifest.workflow.state === 'draft',
    preview: ['review', 'approved'].includes(manifest.workflow.state),
    thin: false,
    redirectState: null,
    retirementState: manifest.workflow.state === 'retired' ? Object.freeze({ allowedStatuses: Object.freeze([404, 410]) }) : null,
  });
  return Object.freeze({ manifest, markdown, normalizedArticle, generatedMdx: compiledMdx(normalizedArticle, markdown) });
}

export function validateNormalizedArticleUniqueness(articles) {
  for (const field of ['id', 'slug', 'route']) {
    const values = articles.map((article) => article[field]);
    assert(new Set(values).size === values.length, `Duplicate article ${field}: ${values.join(', ')}`);
  }
  return true;
}

function compileLatexArticles(root, context) {
  const sourceRoot = path.join(root, 'content', 'latex', 'articles');
  const governanceRoot = path.join(root, 'content', 'latex-governance');
  const files = readdirSync(sourceRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.tex'))
    .sort((left, right) => left.name.localeCompare(right.name, 'en'));
  return files.map((entry) => {
    const sourcePath = path.join(sourceRoot, entry.name);
    const source = safeRead(sourcePath, 2 * 1024 * 1024);
    const article = compileLatexArticle(source, { sourcePath: relativeFromRoot(sourcePath, root), taxonomy: context.taxonomy });
    const governancePath = path.join(governanceRoot, `${article.metadata.slug}.yaml`);
    const governanceSource = safeRead(governancePath, MAX_MANIFEST_BYTES);
    const parsedGovernance = context.editorial.schemas.latexGovernance.parse(parseYaml(governanceSource));
    assert(parsedGovernance.articleId === article.metadata.slug, `${relativeFromRoot(governancePath, root)}: articleId must match the LaTeX slug`);
    const governance = Object.freeze({ ...parsedGovernance, id: parsedGovernance.articleId });
    const resolved = resolveEditorialGovernance(
      governance,
      { [relativeFromRoot(sourcePath, root)]: source, [relativeFromRoot(governancePath, root)]: governanceSource },
      [],
      context,
      relativeFromRoot(sourcePath, root),
      source
        .replace(/\\hbproblem\{[^}]*\}/g, '')
        .replace(/\\related\{[^}]*\}\{[^}]*\}\{[^}]*\}/g, ''),
    );
    assert(article.metadata.sourceNotes.items.length === resolved.sourceNotes.length, `${relativeFromRoot(sourcePath, root)}: LaTeX source-note count does not match governed source IDs`);
    for (const sourceNote of article.metadata.sourceNotes.items) {
      const governed = resolved.sourceNotes.find(({ href }) => href === sourceNote.href);
      assert(governed && governed.title === sourceNote.title && governed.publisher === sourceNote.publisher, `${relativeFromRoot(sourcePath, root)}: LaTeX source note does not match its canonical source record`);
    }
    const route = normalizedArticleRoute(article.metadata.slug);
    const relatedArticleIds = article.metadata.relatedContent.routes.map((relatedRoute) => {
      const match = relatedRoute.match(/^\/articles\/([a-z0-9]+(?:-[a-z0-9]+)*)\/$/);
      assert(match, `${relativeFromRoot(sourcePath, root)}: invalid related route ${relatedRoute}`);
      return match[1];
    });
    const normalizedArticle = Object.freeze({
      schemaVersion: NORMALIZED_PUBLIC_ARTICLE_SCHEMA_VERSION,
      kind: 'article',
      sourceKind: 'latex-article',
      sourcePath: relativeFromRoot(sourcePath, root),
      bodySourcePath: relativeFromRoot(sourcePath, root),
      generatedContentPath: `src/content/docs/articles/${article.metadata.slug}.mdx`,
      id: article.metadata.slug,
      slug: article.metadata.slug,
      route,
      canonicalRoute: route,
      pagefindRoute: route,
      rssIdentity: route,
      sitemapIdentity: route,
      title: article.metadata.title,
      description: article.metadata.description,
      categoryId: article.metadata.categoryId,
      topicId: article.metadata.topicId,
      topicIds: [article.metadata.topicId],
      articleType: article.metadata.articleType,
      editorialClassification: article.metadata.editorialClassification,
      articleFormat: 'latex',
      answerSummary: article.metadata.answerSummary,
      problemLabel: article.metadata.problemLabel ?? null,
      problemLabels: article.metadata.problemLabel ? [article.metadata.problemLabel] : [],
      publishedDate: article.metadata.pubDate,
      updatedDate: article.metadata.updatedDate,
      feedEligible: resolved.published && article.metadata.feed,
      searchEligible: resolved.published,
      sitemapEligible: resolved.published,
      llmsEligible: resolved.published,
      featured: resolved.published && article.metadata.featured,
      editorialPriority: article.metadata.editorialPriority,
      readTime: article.metadata.readTime,
      evidence: article.metadata.evidence,
      testing: resolved.testing,
      sourceIds: governance.sourceIds,
      researchPacketIds: governance.researchPacketIds ?? [],
      sourceNotes: Object.freeze({ state: 'structured', items: resolved.sourceNotes }),
      testingIds: governance.testingIds,
      mediaIds: governance.mediaIds,
      productIds: governance.productIds,
      productGroupIds: governance.productGroupIds,
      linkPreviewIds: governance.linkPreviewIds,
      destinationIds: governance.destinationIds,
      priceClaims: governance.priceClaims,
      recommendationClaims: governance.recommendationClaims,
      commerce: resolved.commerce,
      presentationBlocks: [],
      relatedArticleIds,
      relatedContent: Object.freeze({ state: 'structured', routes: article.metadata.relatedContent.routes }),
      disclosure: article.metadata.disclosure,
      workflow: governance.workflow,
      authors: [article.metadata.author],
      directives: [],
      citations: [],
      media: [],
      bodyDigest: sha256(source),
      packageDigest: sha256(stableJson({ source, governance })),
      approvalDigest: resolved.expectedDigest,
      approvalId: governance.approvalId,
      draft: governance.workflow.state === 'draft',
      preview: ['review', 'approved'].includes(governance.workflow.state),
      thin: false,
      redirectState: null,
      retirementState: governance.workflow.state === 'retired' ? Object.freeze({ allowedStatuses: Object.freeze([404, 410]) }) : null,
    });
    return Object.freeze({ governance, article, normalizedArticle });
  });
}

function validateRelatedArticleReferences(compiled, canonicalRoutes) {
  for (const { normalizedArticle } of compiled) {
    for (const relatedId of normalizedArticle.relatedArticleIds) {
      assert(relatedId !== normalizedArticle.id, `${normalizedArticle.sourcePath}: related articles cannot reference themselves`);
      assert(canonicalRoutes.has(normalizedArticleRoute(relatedId)), `${normalizedArticle.sourcePath}: unresolved related article ${relatedId}`);
    }
  }
}

export async function compileArticlePackages({ root = repositoryRoot } = {}) {
  const context = await createPublishingContext(root);
  const articleRoot = path.join(root, 'content', 'articles');
  const packageDirectories = readdirSync(articleRoot, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.'))
    .sort((left, right) => left.name.localeCompare(right.name, 'en'));
  assert(packageDirectories.length > 0, 'At least one canonical article package is required.');
  assert(packageDirectories.every((entry) => entry.isDirectory() && !entry.isSymbolicLink()), 'Article-package root may contain only real package directories.');
  const compiled = packageDirectories.map((entry) => validateArticlePackage(path.join(articleRoot, entry.name), context));
  const latexCompiled = compileLatexArticles(root, context);
  const allCompiled = [...compiled, ...latexCompiled];
  validateNormalizedArticleUniqueness(allCompiled.map(({ normalizedArticle }) => normalizedArticle));
  const generatedArticles = allCompiled.map(({ normalizedArticle }) => normalizedArticle);
  const canonicalSources = discoverTrackedPublicSources(root, {
    taxonomy: context.taxonomy,
    generatedArticles,
    expectedGeneratedRoutes: generatedArticles.map(({ route }) => route),
  });
  validateRelatedArticleReferences(allCompiled, new Set(canonicalSources.filter(({ kind }) => kind === 'article').map(({ route }) => route)));
  return Object.freeze({ context, compiled: Object.freeze(compiled), latexCompiled: Object.freeze(latexCompiled), allCompiled: Object.freeze(allCompiled) });
}

function assertOrWrite(filePath, expected, check) {
  if (check) {
    assert(existsSync(filePath), `${relativeFromRoot(filePath)}: generated output is missing`);
    const status = lstatSync(filePath);
    assert(status.isFile() && !status.isSymbolicLink(), `${relativeFromRoot(filePath)}: generated output must be a regular file`);
    assert(readFileSync(filePath, 'utf8').replaceAll('\r\n', '\n') === expected, `${relativeFromRoot(filePath)}: generated output is stale`);
    return false;
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  const current = (() => { try { return readFileSync(filePath, 'utf8').replaceAll('\r\n', '\n'); } catch { return null; } })();
  if (current === expected) return false;
  writeFileSync(filePath, expected, 'utf8');
  return true;
}

function compilerOwnedArticleOutputs(generatedRoot) {
  if (!existsSync(generatedRoot)) return [];
  const outputs = [];
  for (const entry of readdirSync(generatedRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const outputPath = path.join(generatedRoot, entry.name, 'index.mdx');
    if (!existsSync(outputPath)) continue;
    const status = lstatSync(outputPath);
    assert(status.isFile() && !status.isSymbolicLink(), `${relativeFromRoot(outputPath)}: compiler-owned output must be a regular file`);
    const source = readFileSync(outputPath, 'utf8').replaceAll('\r\n', '\n');
    const frontmatterMatch = source.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
    if (!frontmatterMatch) continue;
    const frontmatter = parseYaml(frontmatterMatch[1]);
    const slug = path.basename(path.dirname(outputPath));
    const expectedSource = `content/articles/${slug}/article.md`;
    if (frontmatter?.generatedBy === GENERATED_BY && frontmatter?.generatedSource === expectedSource) outputs.push(outputPath);
  }
  return outputs;
}

export async function emitCompiledArticles({ root = repositoryRoot, check = false } = {}) {
  const { context, compiled, latexCompiled, allCompiled } = await compileArticlePackages({ root });
  const normalizedOutputPath = path.join(root, 'src', 'generated', 'publishing', 'articles.v1.json');
  const generatedSchemaPath = path.join(root, 'schemas', 'generated', 'article-manifest-v1.schema.json');
  const normalized = Object.freeze({
    schemaVersion: NORMALIZED_PUBLIC_ARTICLE_SCHEMA_VERSION,
    taxonomyVersion: context.taxonomy.PUBLIC_TAXONOMY_CONTRACT_VERSION,
    articles: allCompiled.map(({ normalizedArticle }) => normalizedArticle).sort((left, right) => left.route.localeCompare(right.route, 'en')),
  });
  let changed = false;
  changed = assertOrWrite(normalizedOutputPath, stableJson(normalized), check) || changed;
  changed = assertOrWrite(generatedSchemaPath, stableJson(context.jsonSchema), check) || changed;
  const expectedSlugs = new Set(compiled.map(({ normalizedArticle }) => normalizedArticle.slug));
  const generatedRoot = path.join(root, 'src', 'content', 'docs', 'articles');
  const staleOutputs = compilerOwnedArticleOutputs(generatedRoot).filter((outputPath) => !expectedSlugs.has(path.basename(path.dirname(outputPath))));
  if (check) {
    assert(staleOutputs.length === 0, `Stale compiler-owned article output: ${staleOutputs.map((outputPath) => relativeFromRoot(outputPath)).join(', ')}`);
  } else {
    for (const outputPath of staleOutputs) {
      const parent = path.dirname(outputPath);
      unlinkSync(outputPath);
      if (readdirSync(parent).length === 0) rmdirSync(parent);
    }
  }
  for (const item of compiled) {
    const outputPath = path.join(root, item.normalizedArticle.generatedContentPath);
    changed = assertOrWrite(outputPath, item.generatedMdx, check) || changed;
  }
  return Object.freeze({ changed, normalized, compiled, latexCompiled, allCompiled });
}

export { ARTICLE_PACKAGE_SCHEMA_VERSION };
