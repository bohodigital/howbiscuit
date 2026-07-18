import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');

test('all seven custom layouts and the custom catch-all renderer exist', () => {
  for (const layout of [
    'BaseLayout',
    'HomeLayout',
    'CategoryLayout',
    'ArticleLayout',
    'ShoppingLayout',
    'ToolLayout',
    'TrustLayout',
  ]) {
    assert.ok(existsSync(path.join(root, 'src', 'layouts', `${layout}.astro`)), `${layout} is missing`);
  }
  assert.ok(existsSync(path.join(root, 'src', 'pages', '[...slug].astro')));
});

test('Astro no longer delegates public rendering to Starlight', () => {
  const astroConfig = read('astro.config.mjs');
  const contentConfig = read('src/content.config.ts');
  assert.doesNotMatch(astroConfig, /@astrojs\/starlight/);
  assert.doesNotMatch(contentConfig, /@astrojs\/starlight/);
  assert.match(astroConfig, /@astrojs\/mdx/);
  assert.match(astroConfig, /@astrojs\/sitemap/);

  const obsoleteRuntimeContract = /@astrojs\/starlight|starlightRoute|mobile-starlight-toc|starlight-toc|--sl-|\.sl-markdown-content/i;
  for (const relativePath of [
    'package.json',
    'package-lock.json',
    'src/layouts/BaseLayout.astro',
    'src/layouts/HomeLayout.astro',
    'src/layouts/CategoryLayout.astro',
    'src/layouts/ArticleLayout.astro',
    'src/layouts/ShoppingLayout.astro',
    'src/layouts/ToolLayout.astro',
    'src/layouts/TrustLayout.astro',
    'src/styles/biscuit.css',
    'src/styles/shell.css',
  ]) {
    assert.doesNotMatch(read(relativePath), obsoleteRuntimeContract, `${relativePath} retains an obsolete Starlight runtime contract`);
  }
});

test('BaseLayout owns metadata, discovery, skip link, and exactly one copy of each tracker', () => {
  const base = read('src/layouts/BaseLayout.astro');
  for (const needle of [
    'rel="canonical"',
    'name="robots"',
    'property="og:image"',
    'name="twitter:card"',
    'application/ld+json',
    'href="#main-content"',
    'application/rss+xml',
    'rel="sitemap"',
  ]) assert.match(base, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  assert.match(base, /pagefindAttributesForPage/);
  assert.match(base, /\['system', 'light', 'dark'\]\.includes\(storedPreference\)/);

  assert.equal((base.match(/analytics\.bohodigitalservices\.com\/script\.js/g) ?? []).length, 1);
  assert.equal((base.match(/fefef93c-b1d6-4d04-95d3-064af3d38a41/g) ?? []).length, 1);
  assert.equal((base.match(/googletagmanager\.com\/gtag\/js\?id=G-NG0NQMVFEH/g) ?? []).length, 1);
  assert.equal((base.match(/gtag\('config', 'G-NG0NQMVFEH'/g) ?? []).length, 1);
});

test('LaTeX articles keep the paper heading as the single public H1', () => {
  const articleLayout = read('src/layouts/ArticleLayout.astro');
  const compiler = read('src/lib/latex/article-compiler.mjs');
  assert.match(articleLayout, /record\.articleFormat !== 'latex'/);
  assert.match(compiler, /<h1 data-pagefind-meta="title">/);
});

test('the explicit 404 is noindex and excluded from Pagefind at index time', () => {
  assert.ok(existsSync(path.join(root, 'src', 'pages', '404.astro')));
  const notFound = read('src/pages/404.astro');
  assert.match(notFound, /BaseLayout/);
  assert.match(notFound, /noindex/);
  assert.match(notFound, /data-pagefind-ignore/);
  assert.match(notFound, /analytics=\{false\}/);
  assert.match(notFound, />404</);
});

test('observed Phase A routes remain the rendering source while target routes stay unactivated', () => {
  const renderer = read('src/pages/[...slug].astro');
  assert.match(renderer, /OBSERVED_ROUTE_CONTRACTS/);
  assert.match(renderer, /registry\.filter\(\(item\) => item\.searchEligible\)/);
  assert.doesNotMatch(renderer, /TARGET_ROUTE_CONTRACTS/);
  assert.doesNotMatch(read('public/_redirects'), /\/cook\/\s+\/kitchen\//);
});
