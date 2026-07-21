import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { dump as dumpYaml, load as parseYaml } from 'js-yaml';

import {
  linkPreviewOrOrdinaryLink,
  loadEditorialRecords,
  publicationDigest,
  resolveActiveRecords,
  scoreIdeas,
  validateFirstHandClaims,
  validateWorkflow,
} from '../scripts/publishing/editorial-records.mjs';
import {
  compileArticlePackages,
  createPublishingContext,
  validateArticlePackage,
} from '../scripts/publishing/article-compiler.mjs';
import { loadTypeScriptModule } from '../scripts/lib/load-typescript-module.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const packagePath = path.join(root, 'content', 'articles', 'how-does-baking-powder-work');

function tempPackage() {
  const parent = mkdtempSync(path.join(os.tmpdir(), 'hb-editorial-governance-'));
  const target = path.join(parent, 'how-does-baking-powder-work');
  cpSync(packagePath, target, { recursive: true });
  return { parent, target };
}

function updateManifest(target, update) {
  const manifestPath = path.join(target, 'manifest.yaml');
  const manifest = parseYaml(readFileSync(manifestPath, 'utf8'));
  update(manifest);
  writeFileSync(manifestPath, dumpYaml(manifest, { noRefs: true, lineWidth: 120, sortKeys: false }), 'utf8');
}

function makeDraft(target, update = () => {}) {
  updateManifest(target, (manifest) => {
    manifest.approvalId = null;
    manifest.workflow = { state: 'draft', history: [{ state: 'draft', at: '2026-07-20', actor: 'test' }] };
    update(manifest);
  });
}

test('canonical editorial records load with deterministic idea scores', async () => {
  const taxonomy = await loadTypeScriptModule(path.join(root, 'src', 'config', 'public-taxonomy.ts'));
  const records = await loadEditorialRecords(root, taxonomy);
  assert.deepEqual(Object.fromEntries([
    ['ideas', records.ideas.size],
    ['briefs', records.briefs.size],
    ['sources', records.sources.size],
    ['testing', records.testing.size],
    ['mediaRights', records.mediaRights.size],
    ['linkPreviews', records.linkPreviews.size],
    ['approvals', records.approvals.size],
  ]), { ideas: 3, briefs: 3, sources: 8, testing: 3, mediaRights: 0, linkPreviews: 0, approvals: 3 });
  assert.deepEqual(scoreIdeas(records.ideas), [
    { id: 'idea-how-does-baking-powder-work', totalScore: 24 },
    { id: 'idea-why-are-some-answers-better-than-others', totalScore: 23 },
    { id: 'idea-why-salt-melts-ice', totalScore: 23 },
  ]);
  const approval = records.approvals.values().next().value;
  const { note: _note, recordDigest: _recordDigest, ...approvalWithoutNote } = approval;
  assert.equal(records.schemas.approval.safeParse(approvalWithoutNote).success, false);
});

test('two Markdown packages and the trusted LaTeX source share one governed representation', async () => {
  const { compiled, latexCompiled, allCompiled } = await compileArticlePackages({ root });
  assert.equal(compiled.length, 2);
  assert.equal(latexCompiled.length, 1);
  assert.equal(allCompiled.length, 3);
  assert.ok(allCompiled.every(({ normalizedArticle }) => (
    normalizedArticle.workflow.state === 'published'
    && normalizedArticle.approvalId
    && normalizedArticle.approvalDigest.length === 64
    && normalizedArticle.sourceNotes.items.length > 0
  )));
});

test('workflow history rejects skipped, reversed, and stale states', () => {
  const entry = (state, at) => ({ state, at, actor: 'test' });
  assert.equal(validateWorkflow({ state: 'published', history: [
    entry('draft', '2026-07-01'), entry('review', '2026-07-02'),
    entry('approved', '2026-07-03'), entry('published', '2026-07-04'),
  ] }, 'valid'), true);
  assert.throws(() => validateWorkflow({ state: 'published', history: [
    entry('draft', '2026-07-01'), entry('published', '2026-07-02'),
  ] }, 'skip'), /invalid workflow transition draft -> published/);
  assert.throws(() => validateWorkflow({ state: 'review', history: [
    entry('draft', '2026-07-02'), entry('review', '2026-07-01'),
  ] }, 'reverse'), /chronological/);
  assert.throws(() => validateWorkflow({ state: 'approved', history: [
    entry('draft', '2026-07-01'), entry('review', '2026-07-02'),
  ] }, 'stale'), /state must match/);
});

test('first-hand language requires suitable active testing evidence', () => {
  const supported = { status: 'active', supportsFirstHandClaims: true };
  const unsupported = { status: 'active', supportsFirstHandClaims: false };
  assert.equal(validateFirstHandClaims('This guide is not-hands-on-tested.', [unsupported], 'negative'), true);
  for (const claim of [
    'We tested this claim.',
    'We tried this setup.',
    'We have tested this setup.',
    'We compared three pans.',
    'In our test, it finished first.',
    'Our evaluation found a clear winner.',
    'I measured the result.',
    'I cooked with this for a month.',
  ]) assert.throws(() => validateFirstHandClaims(claim, [unsupported], 'claim'), /requires suitable testing/, claim);
  assert.equal(validateFirstHandClaims('I used this method.', [supported], 'claim'), true);
});

test('retired, disallowed, unresolved, and missing preview records fail closed', () => {
  const records = new Map([
    ['active', { id: 'active', status: 'active' }],
    ['retired', { id: 'retired', status: 'retired' }],
    ['disallowed', { id: 'disallowed', status: 'disallowed' }],
  ]);
  assert.deepEqual(resolveActiveRecords(['active'], records, 'record', 'fixture'), [records.get('active')]);
  assert.throws(() => resolveActiveRecords(['retired'], records, 'record', 'fixture'), /is retired/);
  assert.throws(() => resolveActiveRecords(['disallowed'], records, 'record', 'fixture'), /is disallowed/);
  assert.throws(() => resolveActiveRecords(['missing'], records, 'record', 'fixture'), /unresolved record/);
  assert.deepEqual(linkPreviewOrOrdinaryLink('missing', 'https://example.com/article', new Map()), {
    kind: 'ordinary-link', href: 'https://example.com/article',
  });
});

test('publication digest is deterministic and binds files plus referenced records', () => {
  const base = { articleId: 'article', files: { 'article.md': 'body' }, referencedRecords: [
    { kind: 'source', record: { id: 'source', recordDigest: 'a'.repeat(64) } },
  ] };
  assert.equal(publicationDigest(base), publicationDigest(base));
  assert.notEqual(publicationDigest(base), publicationDigest({ ...base, files: { 'article.md': 'changed' } }));
  assert.notEqual(publicationDigest(base), publicationDigest({ ...base, referencedRecords: [
    { kind: 'source', record: { id: 'source', recordDigest: 'b'.repeat(64) } },
  ] }));
});

test('published packages fail closed after any approval-relevant file change', async () => {
  const { parent, target } = tempPackage();
  try {
    const articlePath = path.join(target, 'article.md');
    writeFileSync(articlePath, `${readFileSync(articlePath, 'utf8')}\nApproval-invalidating change.\n`, 'utf8');
    const context = await createPublishingContext(root);
    assert.throws(() => validateArticlePackage(target, context), /stale approval digest/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('draft packages may compile for preview but are excluded from every publication surface', async () => {
  const { parent, target } = tempPackage();
  try {
    makeDraft(target);
    const context = await createPublishingContext(root);
    const { normalizedArticle } = validateArticlePackage(target, context);
    assert.deepEqual([
      normalizedArticle.feedEligible,
      normalizedArticle.searchEligible,
      normalizedArticle.sitemapEligible,
      normalizedArticle.llmsEligible,
    ], [false, false, false, false]);
    assert.equal(normalizedArticle.draft, true);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('first-hand claims in published manifest metadata require testing evidence', async () => {
  const { parent, target } = tempPackage();
  try {
    makeDraft(target, (manifest) => {
      manifest.directAnswer = 'We tested three pans and found that this one produced the most consistent result.';
    });
    const context = await createPublishingContext(root);
    assert.throws(() => validateArticlePackage(target, context), /first-hand claim requires suitable testing/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('retired packages remain excluded after a valid published-to-retired transition', async () => {
  const { parent, target } = tempPackage();
  try {
    updateManifest(target, (manifest) => {
      manifest.workflow.state = 'retired';
      manifest.workflow.history.push({ state: 'retired', at: '2026-07-20', actor: 'test' });
    });
    const context = await createPublishingContext(root);
    const { normalizedArticle } = validateArticlePackage(target, context);
    assert.deepEqual([
      normalizedArticle.feedEligible,
      normalizedArticle.searchEligible,
      normalizedArticle.sitemapEligible,
      normalizedArticle.llmsEligible,
    ], [false, false, false, false]);
    assert.deepEqual(normalizedArticle.retirementState, { allowedStatuses: [404, 410] });
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('declared link previews must resolve even though ordinary Markdown links need no snapshot', async () => {
  const { parent, target } = tempPackage();
  try {
    makeDraft(target, (manifest) => { manifest.linkPreviewIds = ['missing-preview']; });
    const articlePath = path.join(target, 'article.md');
    writeFileSync(articlePath, `${readFileSync(articlePath, 'utf8')}\n::link-preview{preview="missing-preview"}\n`, 'utf8');
    const context = await createPublishingContext(root);
    assert.throws(() => validateArticlePackage(target, context), /unresolved link-preview record missing-preview/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('link-preview sources and media must belong to the article governance set', async () => {
  const { parent, target } = tempPackage();
  try {
    makeDraft(target, (manifest) => { manifest.linkPreviewIds = ['foreign-preview']; });
    const articlePath = path.join(target, 'article.md');
    writeFileSync(articlePath, `${readFileSync(articlePath, 'utf8')}\n::link-preview{preview="foreign-preview"}\n`, 'utf8');
    const baseContext = await createPublishingContext(root);
    const linkPreviews = new Map([['foreign-preview', {
      id: 'foreign-preview',
      sourceId: 'epa-salt-resources',
      mediaId: null,
      status: 'active',
      recordDigest: 'f'.repeat(64),
    }]]);
    const context = { ...baseContext, editorial: { ...baseContext.editorial, linkPreviews } };
    assert.throws(() => validateArticlePackage(target, context), /source epa-salt-resources is not governed by the article/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('duplicate media-rights paths cannot hide an unregistered package file', async () => {
  const { parent, target } = tempPackage();
  try {
    makeDraft(target, (manifest) => { manifest.mediaIds = ['media-one', 'media-two']; });
    const articlePath = path.join(target, 'article.md');
    writeFileSync(articlePath, `${readFileSync(articlePath, 'utf8')}\n::media{media="media-one"}\n::media{media="media-two"}\n`, 'utf8');
    const mediaRoot = path.join(target, 'media');
    mkdirSync(mediaRoot);
    writeFileSync(path.join(mediaRoot, 'one.png'), 'first fixture');
    writeFileSync(path.join(mediaRoot, 'two.png'), 'second fixture');
    const firstHash = createHash('sha256').update('first fixture').digest('hex');
    const baseContext = await createPublishingContext(root);
    const mediaRights = new Map(['media-one', 'media-two'].map((id, index) => [id, {
      id,
      articleId: 'how-does-baking-powder-work',
      packageRelativePath: 'media/one.png',
      contentHash: firstHash,
      status: 'active',
      recordDigest: String(index + 1).repeat(64),
    }]));
    const context = { ...baseContext, editorial: { ...baseContext.editorial, mediaRights } };
    assert.throws(() => validateArticlePackage(target, context), /duplicate media-rights path one.png/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
