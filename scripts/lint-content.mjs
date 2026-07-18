import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const docsRoot = path.join(root, 'src', 'content', 'docs');
const distRoot = path.join(root, 'dist');

const requiredDocs = [
  'index.mdx',
  'home-tech/index.mdx',
  'home/index.mdx',
  'kitchen/index.mdx',
  'shop/index.mdx',
  'tools/index.mdx',
  'articles/index.mdx',
  'about/index.mdx',
  'editorial-policy/index.mdx',
  'corrections/index.mdx',
  'privacy/index.mdx',
  'affiliate-disclosure/index.mdx',
  'contact/index.mdx',
  'articles/how-does-baking-powder-work/index.mdx',
  'articles/why-are-some-answers-better-than-others/index.mdx',
  'articles/why-salt-melts-ice.mdx',
];

const requiredComponents = [
  'BiscuitBox.astro',
  'EvidenceBadge.astro',
  'LatexArticle.astro',
  'SourceNotes.astro',
  'TestingBadge.astro',
];

const forbiddenPublicRoutes = [
  'index.html',
  '404.html',
  'feed.xml',
  'robots.txt',
  'sitemap.xml',
  'llms.txt',
  'assets/styles.css',
  'articles/how-does-baking-powder-work/index.html',
  'articles/why-are-some-answers-better-than-others/index.html',
  'articles/why-salt-melts-ice/index.html',
];

const requiredEndpoints = ['feed.xml.js', 'llms.txt.js', 'robots.txt.js', 'sitemap.xml.js'];
const removedBuiltRoutes = [
  'buying-guides/index.html',
  'cook/index.html',
  'glossary/index.html',
  'home-tech/gaming-pcs/index.html',
  'home-tech/laptops/index.html',
  'home-tech/privacy-security/index.html',
  'home-tech/smart-home/index.html',
  'home-tech/streaming-tvs/index.html',
  'home-tech/wifi-routers/index.html',
  'make-do/index.html',
  'math/index.html',
  'research-writing/index.html',
  'science/index.html',
];
const forbiddenPatterns = [
  /\bTODO\b/i,
  /Lorem ipsum/i,
  /coming soon/i,
  /placeholder/i,
  /Insert text here/i,
  /\bTBD\b/i,
  /SEO experiment/i,
  /traffic laboratory/i,
];
const errors = [];
const pagefindRequired = process.env.HOWBISCUIT_SKIP_PAGEFIND !== '1';

function requireFile(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!existsSync(fullPath)) {
    errors.push(`Missing required file: ${relativePath}`);
  }
}

function rejectFile(relativePath) {
  const fullPath = path.join(root, 'public', relativePath);
  if (existsSync(fullPath)) {
    errors.push(`Static public route conflicts with Astro output: public/${relativePath}`);
  }
}

function frontmatterFor(source, relativePath) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    errors.push(`Missing frontmatter: ${relativePath}`);
    return '';
  }
  return match[1];
}

async function collectFiles(directory, extensions) {
  if (!existsSync(directory)) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath, extensions)));
    } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
      files.push(fullPath);
    }
  }
  return files;
}

function normalizeBuiltMarkup(source) {
  return source
    .replaceAll(/placeholder=(["']).*?\1/gi, '')
    .replaceAll(/&quot;placeholder&quot;:&quot;.*?&quot;/gi, '')
    .replaceAll(/"placeholder":"[^"]*"/gi, '');
}

function scanForbidden(source, relativePath) {
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(source)) {
      errors.push(`Forbidden public text matched ${pattern}: ${relativePath}`);
    }
  }
  if (source.includes('href="#articles"') || source.includes("href='#articles'")) {
    errors.push(`Old homepage #articles link remains: ${relativePath}`);
  }
}

for (const doc of requiredDocs) {
  requireFile(path.join('src', 'content', 'docs', doc));
}

for (const component of requiredComponents) {
  requireFile(path.join('src', 'components', component));
}

for (const pipelineFile of [
  'content/latex/articles/why-salt-melts-ice.tex',
  'docs/latex-article-pipeline.md',
  'scripts/compile-latex-articles.mjs',
  'scripts/run-pi-qa.mjs',
  'src/lib/latex/article-compiler.mjs',
  'test/latex-article.test.mjs',
]) {
  requireFile(pipelineFile);
}

for (const endpoint of requiredEndpoints) {
  requireFile(path.join('src', 'pages', endpoint));
}

for (const publicRoute of forbiddenPublicRoutes) {
  rejectFile(publicRoute);
}

for (const removedRoute of removedBuiltRoutes) {
  const fullPath = path.join(distRoot, removedRoute);
  if (existsSync(fullPath)) {
    errors.push(`Removed route was rebuilt: ${removedRoute}`);
  }
}

const mdxFiles = await collectFiles(docsRoot, ['.mdx']);
for (const file of mdxFiles) {
  const relativePath = path.relative(root, file).replaceAll(path.sep, '/');
  const source = await readFile(file, 'utf8');
  const frontmatter = frontmatterFor(source, relativePath);
  if (!/title:\s*\S/.test(frontmatter)) {
    errors.push(`Missing title in frontmatter: ${relativePath}`);
  }
  if (!/description:\s*\S/.test(frontmatter)) {
    errors.push(`Missing description in frontmatter: ${relativePath}`);
  }
  scanForbidden(source, relativePath);
}

const distFiles = await collectFiles(distRoot, ['.html', '.xml', '.txt', '.json']);
for (const file of distFiles) {
  const relativePath = path.relative(root, file).replaceAll(path.sep, '/');
  const source = normalizeBuiltMarkup(await readFile(file, 'utf8'));
  scanForbidden(source, relativePath);
}

const feedArticles = [
  { articlePath: path.join(docsRoot, 'articles', 'how-does-baking-powder-work', 'index.mdx'), pubDate: '2026-07-01' },
  { articlePath: path.join(docsRoot, 'articles', 'why-are-some-answers-better-than-others', 'index.mdx'), pubDate: '2026-07-01' },
  { articlePath: path.join(docsRoot, 'articles', 'why-salt-melts-ice.mdx'), pubDate: '2026-07-13' },
];

for (const { articlePath, pubDate } of feedArticles) {
  const source = await readFile(articlePath, 'utf8');
  const frontmatter = frontmatterFor(source, path.relative(root, articlePath));
  if (!/feed:\s*true/.test(frontmatter)) {
    errors.push(`Article is not in RSS feed: ${path.relative(root, articlePath)}`);
  }
  if (!new RegExp(`pubDate:\\s*${pubDate}`).test(frontmatter)) {
    errors.push(`Article publication date changed unexpectedly: ${path.relative(root, articlePath)}`);
  }
}

const latexBuiltPath = path.join(distRoot, 'articles', 'why-salt-melts-ice', 'index.html');
if (!existsSync(latexBuiltPath)) {
  errors.push('The compiled LaTeX article route is missing from dist.');
} else {
  const latexBuilt = await readFile(latexBuiltPath, 'utf8');
  for (const marker of ['hb-latex-paper', 'katex-mathml', 'the-short-answer', 'hb-sources', 'hb-correction-link']) {
    if (!latexBuilt.includes(marker)) errors.push(`Compiled LaTeX article is missing ${marker}.`);
  }
  const visibleLatex = latexBuilt.replaceAll(/<annotation\b[^>]*>[\s\S]*?<\/annotation>/gi, '');
  if (/\\(?:section|begin|end)\b/.test(visibleLatex)) {
    errors.push('Raw LaTeX block commands leaked into the built article.');
  }
}

for (const endpoint of ['feed.xml', 'sitemap.xml', 'llms.txt']) {
  const endpointPath = path.join(distRoot, endpoint);
  if (!existsSync(endpointPath)) {
    errors.push(`Missing built endpoint: ${endpoint}`);
    continue;
  }
  const endpointSource = await readFile(endpointPath, 'utf8');
  if (!endpointSource.includes('/articles/why-salt-melts-ice/')) {
    errors.push(`The LaTeX article is missing from ${endpoint}.`);
  }
}

if (pagefindRequired) {
  for (const pagefindFile of ['pagefind/pagefind.js', 'pagefind/pagefind-entry.json']) {
    if (!existsSync(path.join(distRoot, pagefindFile))) {
      errors.push(`Missing Pagefind release artifact: ${pagefindFile}`);
    }
  }
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exit(1);
}

console.log(`Content lint passed for ${mdxFiles.length} MDX pages and ${distFiles.length} built files.`);
