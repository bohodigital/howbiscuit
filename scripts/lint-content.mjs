import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const docsRoot = path.join(root, 'src', 'content', 'docs');
const distRoot = path.join(root, 'dist');

const requiredDocs = [
  'index.mdx',
  'research-writing/index.mdx',
  'cook/index.mdx',
  'home-tech/index.mdx',
  'home-tech/wifi-routers/index.mdx',
  'home-tech/gaming-pcs/index.mdx',
  'home-tech/laptops/index.mdx',
  'home-tech/smart-home/index.mdx',
  'home-tech/streaming-tvs/index.mdx',
  'home-tech/privacy-security/index.mdx',
  'make-do/index.mdx',
  'tools/index.mdx',
  'tools/converters/index.mdx',
  'tools/calculators/index.mdx',
  'tools/cost-estimators/index.mdx',
  'tools/cost-estimators/appliance-running-cost/index.mdx',
  'tools/cost-estimators/sales-tax/index.mdx',
  'buying-guides/index.mdx',
  'science/index.mdx',
  'glossary/index.mdx',
  'articles/index.mdx',
  'about/index.mdx',
  'editorial-policy/index.mdx',
  'corrections/index.mdx',
  'privacy/index.mdx',
  'affiliate-disclosure/index.mdx',
  'contact/index.mdx',
  'articles/how-does-baking-powder-work/index.mdx',
  'articles/why-are-some-answers-better-than-others/index.mdx',
];

const requiredComponents = [
  'BiscuitBox.astro',
  'DivisionCard.astro',
  'ToolPreview.astro',
  'ShortAnswer.astro',
  'CommonMistakes.astro',
  'CheapSafeGuide.astro',
  'EvidenceBadge.astro',
  'RiskBadge.astro',
  'calculators/UnitConverter.astro',
  'calculators/ApplianceCostCalculator.astro',
  'calculators/SalesTaxCalculator.astro',
  'calculators/EverydayCostCalculators.astro',
];

const forbiddenPublicRoutes = [
  'index.html',
  '404.html',
  'feed.xml',
  'robots.txt',
  'sitemap.xml',
  'assets/styles.css',
  'articles/how-does-baking-powder-work/index.html',
  'articles/why-are-some-answers-better-than-others/index.html',
];

const requiredEndpoints = ['feed.xml.js', 'robots.txt.js', 'sitemap.xml.js'];
const removedBuiltRoutes = ['math/index.html'];
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

const feedArticlePaths = [
  path.join(docsRoot, 'articles', 'how-does-baking-powder-work', 'index.mdx'),
  path.join(docsRoot, 'articles', 'why-are-some-answers-better-than-others', 'index.mdx'),
];

for (const articlePath of feedArticlePaths) {
  const source = await readFile(articlePath, 'utf8');
  const frontmatter = frontmatterFor(source, path.relative(root, articlePath));
  if (!/feed:\s*true/.test(frontmatter)) {
    errors.push(`Article is not in RSS feed: ${path.relative(root, articlePath)}`);
  }
  if (!/pubDate:\s*2026-07-01/.test(frontmatter)) {
    errors.push(`Article publication date changed unexpectedly: ${path.relative(root, articlePath)}`);
  }
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exit(1);
}

console.log(`Content lint passed for ${mdxFiles.length} MDX pages and ${distFiles.length} built files.`);
