import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadTypeScriptModule } from '../scripts/lib/load-typescript-module.mjs';
import { compileLatexArticle, generatedMdx, generatedModule } from '../src/lib/latex/article-compiler.mjs';

const examplePath = new URL('../content/latex/articles/why-salt-melts-ice.tex', import.meta.url);
const example = await readFile(examplePath, 'utf8');
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const taxonomy = await loadTypeScriptModule(path.join(root, 'src', 'config', 'public-taxonomy.ts'));
const compile = (source, options = {}) => compileLatexArticle(source, { ...options, taxonomy });

test('compiles canonical Phase C metadata and accessible math without duplicating global services', () => {
  const article = compile(example, { sourcePath: 'why-salt-melts-ice.tex' });
  assert.equal(article.metadata.slug, 'why-salt-melts-ice');
  assert.equal(article.metadata.categoryId, 'home');
  assert.equal(article.metadata.topicId, 'heating-cooling');
  assert.equal(article.metadata.articleType, 'guide');
  assert.equal(article.metadata.featured, true);
  assert.equal(article.metadata.evidence, 'Researched');
  assert.equal(article.metadata.testing.state, 'not-hands-on-tested');
  assert.equal(article.metadata.disclosure.state, 'no-paid-links');
  assert.equal(article.metadata.sourceNotes.items.length, 3);
  assert.deepEqual(article.metadata.relatedContent.routes, [
    '/articles/how-does-baking-powder-work/',
    '/articles/why-are-some-answers-better-than-others/',
  ]);
  assert.match(article.html, /class="hb-latex-paper"/);
  assert.match(article.html, /^<div class="hb-latex-paper"/);
  assert.doesNotMatch(article.html, /<article\b|<h1\b/);
  assert.match(article.html, /class="katex-mathml"/);
  assert.match(article.html, /id="the-short-answer"/);
  assert.match(article.html, /aria-label="Equation 1"/);
  assert.match(article.html, /<aside class="hb-latex-box" aria-label="[^"]+">/);
  assert.doesNotMatch(article.html, /hb-latex-sources|hb-latex-related/);
  assert.equal(article.outline.filter((item) => item.depth === 2).length, 4);
});

test('generation is deterministic and carries source-owned structured metadata into Astro', () => {
  const first = compile(example);
  const second = compile(example);
  assert.equal(generatedMdx(first), generatedMdx(second));
  assert.equal(generatedModule(first), generatedModule(second));
  assert.match(generatedMdx(first), /articleFormat: latex/);
  assert.match(generatedMdx(first), /categoryId: home/);
  assert.match(generatedMdx(first), /answerSummary:/);
  assert.match(generatedMdx(first), /sourceNotes: \{"state":"structured"/);
  assert.match(generatedMdx(first), /LatexArticle article=\{article\}/);
});

test('classification commands fail closed', () => {
  assert.throws(
    () => compile(example.replace('\\hbcategory{home}', '\\hbcategory{science}')),
    /Unknown How Biscuit category: science/,
  );
  assert.throws(
    () => compile(example.replace('\\hbpriority{30}', '\\hbpriority{high}')),
    /must be an integer/,
  );
});

test('requires the canonical taxonomy and rejects file inclusion or arbitrary TeX execution', () => {
  assert.throws(() => compileLatexArticle(example), /canonical public taxonomy is required/);
  assert.throws(() => compile(example.replace('\\maketitle', '\\input{secrets.tex}\n\\maketitle')), /Forbidden command \\input/);
});

test('rejects unsupported prose commands, invalid math, and unsafe links', () => {
  assert.throws(() => compile(example.replace('Pure water and ice', '\\unknown{Nope} Pure water and ice')), /Unsupported prose command \\unknown/);
  assert.throws(() => compile(example.replace('\\Delta T_f = i K_f m', '\\frac{1}{')), /KaTeX could not render/);
  assert.throws(() => compile(example.replace('https://www.epa.gov/risk/salt-resources', 'javascript:alert(1)')), /Only credential-free HTTP\(S\)/);
  assert.throws(() => compile(example.replace('https://www.epa.gov/risk/salt-resources', '//user:password@example.test/path')), /Unsafe or invalid URL|Only credential-free HTTP\(S\)/);
});

test('rejects repeated document environments', () => {
  assert.throws(() => compile(example + '\n\\begin{document}\\end{document}'), /Nested or repeated document environments|Content after \\end\{document\}/);
});

test('check-only mode rejects an orphaned generated module', async () => {
  const orphanPath = path.join(root, 'src', 'generated', 'latex', 'orphan-contract-probe.mjs');
  await mkdir(path.dirname(orphanPath), { recursive: true });
  await writeFile(orphanPath, '// orphan contract probe\n', 'utf8');
  try {
    const result = spawnSync(process.execPath, ['scripts/compile-latex-articles.mjs', '--check'], { cwd: root, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + '\n' + result.stderr, /Orphaned generated module/);
  } finally {
    await rm(orphanPath, { force: true });
  }
});

test('check-only mode rejects stale generated output', async () => {
  const generatedPath = path.join(root, 'src', 'content', 'docs', 'articles', 'why-salt-melts-ice.mdx');
  const original = await readFile(generatedPath, 'utf8');
  await writeFile(generatedPath, original + '\n<!-- stale-output-contract-probe -->\n', 'utf8');
  try {
    const result = spawnSync(process.execPath, ['scripts/compile-latex-articles.mjs', '--check'], { cwd: root, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + '\n' + result.stderr, /Stale generated file/);
  } finally {
    await writeFile(generatedPath, original, 'utf8');
  }
});
