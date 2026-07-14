import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { compileLatexArticle, generatedMdx, generatedModule } from '../src/lib/latex/article-compiler.mjs';

const examplePath = new URL('../content/latex/articles/why-salt-melts-ice.tex', import.meta.url);
const example = await readFile(examplePath, 'utf8');

test('compiles the canonical article into static, accessible math markup', () => {
  const article = compileLatexArticle(example, { sourcePath: 'why-salt-melts-ice.tex' });
  assert.equal(article.metadata.slug, 'why-salt-melts-ice');
  assert.equal(article.metadata.division, 'science');
  assert.match(article.html, /class="hb-latex-paper"/);
  assert.match(article.html, /class="katex-mathml"/);
  assert.match(article.html, /id="the-short-answer"/);
  assert.match(article.html, /aria-label="Equation 1"/);
  assert.match(article.html, /U\.S\. Environmental Protection Agency/);
  assert.equal(article.outline.filter((item) => item.depth === 2).length, 4);
});

test('generation is deterministic and produces a Starlight route module', () => {
  const first = compileLatexArticle(example);
  const second = compileLatexArticle(example);
  assert.equal(generatedMdx(first), generatedMdx(second));
  assert.equal(generatedModule(first), generatedModule(second));
  assert.match(generatedMdx(first), /articleFormat: latex/);
  assert.match(generatedMdx(first), /LatexArticle article=\{article\}/);
});

test('rejects file inclusion and arbitrary TeX execution', () => {
  assert.throws(
    () => compileLatexArticle(example.replace('\\maketitle', '\\input{secrets.tex}\n\\maketitle')),
    /Forbidden command \\input/,
  );
});

test('rejects unsupported prose commands instead of leaking raw TeX', () => {
  assert.throws(
    () => compileLatexArticle(example.replace('Pure water and ice', '\\unknown{Nope} Pure water and ice')),
    /Unsupported prose command \\unknown/,
  );
});

test('rejects invalid math instead of rendering a broken equation', () => {
  assert.throws(
    () => compileLatexArticle(example.replace('\\Delta T_f = i K_f m', '\\frac{1}{')),
    /KaTeX could not render/,
  );
});

test('rejects unsafe links', () => {
  assert.throws(
    () => compileLatexArticle(example.replace('https://www.epa.gov/risk/salt-resources', 'javascript:alert(1)')),
    /Only credential-free HTTP\(S\)/,
  );
});

test('rejects repeated document environments', () => {
  assert.throws(
    () => compileLatexArticle(`${example}\n\\begin{document}\\end{document}`),
    /Nested or repeated document environments|Content after \\end\{document\}/,
  );
});
