import assert from 'node:assert/strict';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { dump as dumpYaml, load as parseYaml } from 'js-yaml';

import {
  compileArticlePackages,
  createPublishingContext,
  emitCompiledArticles,
  validateArticlePackage,
  validateManifestParity,
  validateMarkdown,
  validateNormalizedArticleUniqueness,
} from '../scripts/publishing/article-compiler.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixtureRoot = path.join(root, 'test', 'fixtures', 'publishing');
const manifestCases = JSON.parse(readFileSync(path.join(fixtureRoot, 'manifest-cases.json'), 'utf8'));
const context = await createPublishingContext(root);
const packagePath = path.join(root, 'content', 'articles', 'how-does-baking-powder-work');
const baseManifest = parseYaml(readFileSync(path.join(packagePath, 'manifest.yaml'), 'utf8'));

function clone(value) {
  return structuredClone(value);
}

function tempPackage() {
  const parent = mkdtempSync(path.join(os.tmpdir(), 'hb-article-package-'));
  const target = path.join(parent, 'how-does-baking-powder-work');
  cpSync(packagePath, target, { recursive: true });
  return { parent, target };
}

function makeDraftPackage(target) {
  const manifestPath = path.join(target, 'manifest.yaml');
  const manifest = parseYaml(readFileSync(manifestPath, 'utf8'));
  manifest.approvalId = null;
  manifest.workflow = {
    state: 'draft',
    history: [{ state: 'draft', at: '2026-07-20', actor: 'test' }],
  };
  writeFileSync(manifestPath, dumpYaml(manifest, { noRefs: true, lineWidth: 120, sortKeys: false }));
}

test('shared manifest fixtures keep JSON Schema and runtime validation in parity', () => {
  for (const relativePath of manifestCases.valid) {
    const manifest = parseYaml(readFileSync(path.join(root, relativePath), 'utf8'));
    assert.doesNotThrow(() => validateManifestParity(manifest, context, relativePath));
  }
  for (const fixture of manifestCases.invalid) {
    const manifest = clone(baseManifest);
    Object.assign(manifest, fixture.patch ?? {});
    const jsonResult = context.validateJsonSchema(manifest);
    const runtimeResult = context.manifestSchema.safeParse(manifest).success;
    assert.equal(jsonResult, runtimeResult, fixture.name);
    assert.equal(runtimeResult, false, fixture.name);
  }
});

test('all governed sources compile into NormalizedPublicArticleV1 without route drift', async () => {
  const { compiled, allCompiled } = await compileArticlePackages({ root });
  assert.equal(compiled.length, 2);
  assert.equal(allCompiled.length, 3);
  assert.deepEqual(allCompiled.map(({ normalizedArticle }) => [
    normalizedArticle.route,
    normalizedArticle.sourceKind,
    normalizedArticle.approvalId,
  ]), [
    ['/articles/how-does-baking-powder-work/', 'article-package', 'approval-how-does-baking-powder-work-baseline'],
    ['/articles/why-are-some-answers-better-than-others/', 'article-package', 'approval-why-are-some-answers-better-than-others-baseline'],
    ['/articles/why-salt-melts-ice/', 'latex-article', 'approval-why-salt-melts-ice-baseline'],
  ]);
  const article = compiled[0].normalizedArticle;
  assert.equal(article.schemaVersion, '1.0.0');
  assert.equal(article.route, '/articles/how-does-baking-powder-work/');
  assert.equal(article.canonicalRoute, article.route);
  assert.equal(article.categoryId, 'kitchen');
  assert.equal(article.topicId, 'food-science');
  assert.equal(article.articleType, 'guide');
  assert.equal(article.feedEligible, true);
  assert.equal(article.searchEligible, true);
  assert.equal(article.sitemapEligible, true);
  assert.equal(article.llmsEligible, true);
  assert.equal(article.sourceNotes.items.length, 3);
  assert.deepEqual(article.relatedContent.routes, [
    '/articles/why-are-some-answers-better-than-others/',
    '/articles/why-salt-melts-ice/',
  ]);
});

test('controlled directives and source citations accept only declared grammar', () => {
  const directiveManifest = clone(baseManifest);
  Object.assign(directiveManifest, {
    productIds: ['mixer-one'],
    destinationIds: ['merchant-one'],
    productGroupIds: ['mixers'],
    mediaIds: ['whisk-photo'],
    linkPreviewIds: ['extension-guide'],
    priceClaims: ['mixer-price'],
    presentationBlocks: [],
  });
  const accepted = validateMarkdown([
    'A sourced claim.[@usu-cooking-food-storage]',
    '::product{product="mixer-one" destination="merchant-one"}',
    '::product-group{group="mixers"}',
    '::media{media="whisk-photo"}',
    '::link-preview{preview="extension-guide"}',
    '::price{claim="mixer-price"}',
  ].join('\n'), directiveManifest, 'fixture.md');
  assert.equal(accepted.directives.length, 5);
  assert.deepEqual(accepted.citations, ['usu-cooking-food-storage']);
});

for (const [name, body, message] of [
  ['raw HTML', '<aside>unsafe</aside>', /raw HTML/],
  ['script tag', '<script>alert(1)</script>', /raw HTML/],
  ['JSX', '<Widget value="x" />', /raw HTML/],
  ['JavaScript import', "import Widget from './Widget.astro';", /imports and exports/],
  ['unknown directive', '::offer{offer="one"}', /unknown directive/],
  ['malformed directive', '::product{product="one"', /malformed directive/],
  ['unsafe URL', '[bad](javascript:alert(1))', /unsafe Markdown URL/],
  ['unsafe reference URL', '[bad][target]\n\n[target]: javascript:alert(1)', /unsafe Markdown URL/],
  ['credential-bearing URL', '[bad](https://user:secret@example.test/path)', /unsafe Markdown URL/],
  ['encoded traversal URL', '[bad](/safe/%2e%2e/private)', /unsafe Markdown URL/],
  ['unresolved source', 'Claim.[@not-registered]', /unresolved source citation/],
  ['unresolved product directive', '::product{product="missing-product" destination="missing-destination"}', /unresolved product/],
]) {
  test(`Markdown validation rejects ${name}`, () => {
    const negativeManifest = clone(baseManifest);
    negativeManifest.presentationBlocks = [];
    assert.throws(() => validateMarkdown(body, negativeManifest, 'fixture.md'), message);
  });
}

test('package validation rejects unexpected and oversized files', () => {
  const unexpected = tempPackage();
  writeFileSync(path.join(unexpected.target, 'notes.txt'), 'not canonical');
  assert.throws(() => validateArticlePackage(unexpected.target, context), /unexpected package entry/);
  rmSync(unexpected.parent, { recursive: true, force: true });

  const oversized = tempPackage();
  writeFileSync(path.join(oversized.target, 'article.md'), `# oversized\n${'x'.repeat(1024 * 1024 + 1)}`);
  assert.throws(() => validateArticlePackage(oversized.target, context), /file exceeds/);
  rmSync(oversized.parent, { recursive: true, force: true });
});

test('package validation rejects unsafe media and symlinks', (t) => {
  const unsafe = tempPackage();
  mkdirSync(path.join(unsafe.target, 'media'));
  writeFileSync(path.join(unsafe.target, 'media', 'payload.svg'), '<svg/>');
  assert.throws(() => validateArticlePackage(unsafe.target, context), /unsafe media format/);
  rmSync(unsafe.parent, { recursive: true, force: true });

  const linked = tempPackage();
  mkdirSync(path.join(linked.target, 'media'));
  try {
    symlinkSync(path.join(linked.target, 'article.md'), path.join(linked.target, 'media', 'linked.png'));
  } catch (error) {
    rmSync(linked.parent, { recursive: true, force: true });
    if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) {
      t.skip('Windows sandbox does not permit symlink creation; Pi QA exercises this assertion.');
      return;
    }
    throw error;
  }
  assert.throws(() => validateArticlePackage(linked.target, context), /symlinks are not allowed/);
  rmSync(linked.parent, { recursive: true, force: true });
});

test('duplicate article identity, slug, and route are rejected', async () => {
  const { compiled } = await compileArticlePackages({ root });
  const article = compiled[0].normalizedArticle;
  assert.throws(() => validateNormalizedArticleUniqueness([article, clone(article)]), /Duplicate article id/);
});

test('generated publishing output is current and deterministic', async () => {
  const first = await emitCompiledArticles();
  const second = await emitCompiledArticles({ check: true });
  assert.deepEqual(first.normalized, second.normalized);
});

test('citations and presentation blocks compile to governed accessible MDX', () => {
  const fixture = tempPackage();
  makeDraftPackage(fixture.target);
  const bodyPath = path.join(fixture.target, 'article.md');
  writeFileSync(bodyPath, `${readFileSync(bodyPath, 'utf8')}\n\nEvidence citation.[@usu-cooking-food-storage]\n`);
  const item = validateArticlePackage(fixture.target, context);
  assert.match(item.generatedMdx, /import MechanismSteps/);
  assert.match(item.generatedMdx, /import MistakeGrid/);
  assert.match(item.generatedMdx, /import BiscuitBox/);
  assert.match(item.generatedMdx, /href="#source-usu-cooking-food-storage"/);
  assert.match(item.generatedMdx, /aria-label="Source 1:/);
  rmSync(fixture.parent, { recursive: true, force: true });
});

test('callout presentation bodies render as escaped text props rather than executable MDX', () => {
  const fixture = tempPackage();
  makeDraftPackage(fixture.target);
  const manifestPath = path.join(fixture.target, 'manifest.yaml');
  const manifest = parseYaml(readFileSync(manifestPath, 'utf8'));
  manifest.presentationBlocks.find(({ id }) => id === 'more-is-not-more').body = 'Click [here](javascript:alert(1))';
  writeFileSync(manifestPath, dumpYaml(manifest, { noRefs: true, lineWidth: 120, sortKeys: false }));
  const item = validateArticlePackage(fixture.target, context);
  assert.match(item.generatedMdx, /body="Click \[here\]\(javascript:alert\(1\)\)"/);
  assert.doesNotMatch(item.generatedMdx, /href="javascript:/);
  rmSync(fixture.parent, { recursive: true, force: true });
});

test('check mode rejects and compile mode safely removes stale compiler-owned routes', async (t) => {
  const staleDirectory = path.join(root, 'src', 'content', 'docs', 'articles', 'stale-compiler-fixture');
  const staleOutput = path.join(staleDirectory, 'index.mdx');
  const handDirectory = path.join(root, 'src', 'content', 'docs', 'articles', 'hand-authored-marker-fixture');
  const handOutput = path.join(handDirectory, 'index.mdx');
  t.after(() => {
    rmSync(staleDirectory, { recursive: true, force: true });
    rmSync(handDirectory, { recursive: true, force: true });
  });
  mkdirSync(staleDirectory);
  writeFileSync(staleOutput, '---\ngeneratedBy: howbiscuit-article-package-compiler-v1\ngeneratedSource: content/articles/stale-compiler-fixture/article.md\n---\n');
  mkdirSync(handDirectory);
  writeFileSync(handOutput, '---\ntitle: Hand-authored marker fixture\n---\n\nA code sample may mention generatedBy: howbiscuit-article-package-compiler-v1 without transferring ownership.\n');
  await assert.rejects(() => emitCompiledArticles({ check: true }), /Stale compiler-owned article output/);
  await emitCompiledArticles();
  assert.equal(existsSync(staleDirectory), false);
  assert.equal(existsSync(handOutput), true);
});

test('the built migration preserves governed mechanism, mistake-grid, and callout presentation', () => {
  const html = readFileSync(path.join(root, 'dist', 'articles', 'how-does-baking-powder-work', 'index.html'), 'utf8');
  assert.match(html, /class="hb-mechanism"/);
  assert.match(html, /class="hb-mistake-grid"/);
  assert.match(html, /data-variant="dont-be-fooled"/);
  assert.match(html, /data-variant="cheap-safe"/);
});
