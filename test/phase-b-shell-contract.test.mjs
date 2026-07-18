import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import {
  ACCEPTED_PHASE_A_DOCUMENT_ROUTES,
  KNOWN_THIN_CURRENT_ROUTES,
  PHASE_C_ONLY_DOCUMENT_ROUTES,
} from '../src/lib/search/pagefind-policy.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');

function collectFiles(directory, predicate) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(fullPath, predicate));
    else if (predicate(fullPath)) files.push(fullPath);
  }
  return files;
}

function artifactRoute(filePath, artifactRoot) {
  const relative = path.relative(artifactRoot, filePath).replaceAll('\\', '/');
  if (relative === 'index.html') return '/';
  if (relative === '404.html') return '/404.html';
  return relative.endsWith('/index.html') ? `/${relative.slice(0, -'/index.html'.length)}/` : `/${relative}`;
}

function sourceRoute(filePath, sourceRoot) {
  const relative = path.relative(sourceRoot, filePath).replaceAll('\\', '/').replace(/\.(md|mdx)$/, '');
  const withoutIndex = relative.replace(/(^|\/)index$/, '');
  return withoutIndex ? `/${withoutIndex}/` : '/';
}

function contrastRatio(foreground, background) {
  const luminance = (hex) => {
    const channels = hex.match(/[a-f\d]{2}/gi).map((value) => Number.parseInt(value, 16) / 255);
    const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

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

test('reviewed accessibility and evidence contracts fail closed in source', () => {
  const biscuitCss = read('src/styles/biscuit.css');
  const shellCss = read('src/styles/shell.css');
  const header = read('src/components/SiteHeader.astro');
  const base = read('src/layouts/BaseLayout.astro');
  const productCard = read('src/components/ProductCard.astro');
  const productShelf = read('src/components/ProductShelf.astro');
  const publicModel = read('src/lib/public-content/model.mjs');
  const priceStatusBadge = read('src/components/PriceStatusBadge.astro');
  const articleMeta = read('src/components/ArticleMeta.astro');

  assert.ok(contrastRatio('#b43a22', '#fff8e7') >= 4.5, 'light tomato foreground must meet WCAG AA');
  assert.ok(contrastRatio('#ff7759', '#111b23') >= 4.5, 'dark tomato foreground must meet WCAG AA');
  assert.ok(contrastRatio('#142432', '#ef6547') >= 4.5, 'light panic-strip hover must meet WCAG AA');
  assert.ok(contrastRatio('#142432', '#ff7759') >= 4.5, 'dark panic-strip hover must meet WCAG AA');
  assert.ok(contrastRatio('#142432', '#ffd05b') >= 4.5, 'dark honey hover foreground must meet WCAG AA');
  assert.ok(contrastRatio('#ffffff', '#315ee8') >= 4.5, 'light Home Tech title foreground must meet WCAG AA');
  assert.ok(contrastRatio('#142432', '#7190ff') >= 4.5, 'dark Home Tech title foreground must meet WCAG AA');
  assert.ok(contrastRatio('#f7c94b', '#142432') >= 4.5, 'light panic-strip label must meet WCAG AA');
  assert.ok(contrastRatio('#142432', '#fff7e5') >= 4.5, 'dark panic-strip label must meet WCAG AA');
  assert.ok(contrastRatio('#fff8e7', '#142432') >= 3, 'light panic-strip focus indicator must meet WCAG non-text contrast');
  assert.ok(contrastRatio('#111b23', '#fff7e5') >= 3, 'dark panic-strip focus indicator must meet WCAG non-text contrast');
  assert.ok(contrastRatio('#315ee8', '#f6f2e8') >= 3, 'dark LaTeX-paper focus indicator must meet WCAG non-text contrast');
  assert.ok(contrastRatio('#666666', '#fffefb') >= 4.5, 'LaTeX related label must meet WCAG AA on paper');
  assert.ok(contrastRatio('#666666', '#fff2c7') >= 4.5, 'LaTeX related label must meet WCAG AA on hover');
  assert.match(biscuitCss, /--hb-tomato-text:\s*#b43a22/);
  assert.match(biscuitCss, /\.hb-panic-strip a:hover\s*\{[^}]*background:\s*var\(--hb-tomato\);[^}]*color:\s*#142432;/);
  assert.match(biscuitCss, /\.hb-topic-directory a:hover p\s*\{\s*color:\s*#142432;/);
  assert.match(biscuitCss, /:root\[data-theme='dark'\] \.hb-hub-title\[data-division='home-tech'\]\s*\{\s*color:\s*#142432;/);
  assert.match(biscuitCss, /:root\[data-theme='dark'\] \.hb-panic-strip > p\s*\{\s*color:\s*#142432;/);
  assert.match(biscuitCss, /\.hb-panic-strip a:focus-visible\s*\{\s*outline-color:\s*var\(--hb-paper\)/);
  assert.match(biscuitCss, /:root\[data-theme='dark'\] \.hb-latex-paper a:focus-visible\s*\{\s*outline-color:\s*#315ee8/);
  assert.match(biscuitCss, /\.hb-latex-related a span\s*\{\s*color:\s*#666/);
  assert.match(shellCss, /\.hb-menu-guides a:hover small\s*\{\s*color:\s*#142432;/);
  assert.doesNotMatch(shellCss, /\.hb-article-toc[^{}]*grid-row:\s*1/);
  assert.match(base, /document\.documentElement\.classList\.add\('js'\)/);
  assert.match(header, /<noscript>[\s\S]*Primary navigation without JavaScript/);
  assert.match(articleMeta, /record\.updatedDate \? 'Updated' : 'Published'/);

  for (const component of [productCard, productShelf]) {
    assert.match(component, /priceState: 'observed' \| 'stale'; price: string; observedAt: string; source: string/);
    assert.match(component, /priceState: 'estimate'; price: string; observedAt\?: never; source: string/);
    assert.match(component, /priceState: 'unavailable'; price\?: never; observedAt\?: never/);
  }
  assert.match(productCard, /assertValidProductEvidence\(product\)/);
  assert.match(productCard, /product\.priceState === 'observed' \|\| product\.priceState === 'stale'[\s\S]*observedAt=\{product\.observedAt\}[\s\S]*<PriceStatusBadge state=\{product\.priceState\} \/>/);
  assert.match(publicModel, /Estimated product prices must not claim an observation date/);
  assert.match(publicModel, /Unavailable products must not imply a price observation/);
  assert.match(priceStatusBadge, /estimate' \| 'unavailable'; observedAt\?: never/);
  assert.match(priceStatusBadge, /assertValidPriceBadgeProps\(\{ state, observedAt \}\)/);
  assert.match(publicModel, /Price badges require a recognized price state/);
});

test('the built artifact has the exact accepted routes, per-page metadata, tracker counts, and H1 counts', () => {
  const artifactRoot = path.join(root, 'dist');
  const sourceRoot = path.join(root, 'src', 'content', 'docs');
  assert.ok(existsSync(artifactRoot), 'npm test must build the artifact before running contract tests');
  const sourceRoutes = new Set(collectFiles(sourceRoot, (filePath) => /\.(md|mdx)$/.test(filePath)).map((filePath) => sourceRoute(filePath, sourceRoot)));
  const acceptedRoutes = new Set(ACCEPTED_PHASE_A_DOCUMENT_ROUTES);
  assert.equal(acceptedRoutes.size, ACCEPTED_PHASE_A_DOCUMENT_ROUTES.length, 'accepted Phase A routes must be unique');
  assert.deepEqual([...sourceRoutes].sort(), [...acceptedRoutes].sort());
  for (const route of PHASE_C_ONLY_DOCUMENT_ROUTES) assert.ok(!sourceRoutes.has(route), `${route} must remain inactive until Phase C`);
  const pages = new Map(collectFiles(artifactRoot, (filePath) => filePath.endsWith('.html')).map((filePath) => [artifactRoute(filePath, artifactRoot), readFileSync(filePath, 'utf8')]));
  assert.deepEqual([...pages.keys()].sort(), [...acceptedRoutes, '/404.html'].sort());
  for (const route of PHASE_C_ONLY_DOCUMENT_ROUTES) assert.ok(!pages.has(route), `${route} must remain absent from the Phase B artifact`);

  for (const [route, html] of pages) {
    assert.equal((html.match(/<h1\b/gi) ?? []).length, 1, `${route} H1 count`);
    assert.equal((html.match(/rel="canonical"/g) ?? []).length, 1, `${route} canonical count`);
    assert.equal((html.match(/name="robots"/g) ?? []).length, 1, `${route} robots count`);
    assert.equal((html.match(/property="og:title"/g) ?? []).length, 1, `${route} Open Graph title count`);
    assert.equal((html.match(/property="og:image"/g) ?? []).length, 1, `${route} Open Graph image count`);
    assert.equal((html.match(/name="twitter:card"/g) ?? []).length, 1, `${route} Twitter card count`);
    const jsonLd = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
    assert.equal(jsonLd.length, 1, `${route} JSON-LD count`);
    assert.doesNotThrow(() => JSON.parse(jsonLd[0][1]), `${route} JSON-LD must parse`);
    const trackerCount = route === '/404.html' ? 0 : 1;
    for (const marker of [
      'analytics.bohodigitalservices.com/script.js',
      'fefef93c-b1d6-4d04-95d3-064af3d38a41',
      'googletagmanager.com/gtag/js?id=G-NG0NQMVFEH',
      "gtag('config', 'G-NG0NQMVFEH'",
    ]) assert.equal(html.split(marker).length - 1, trackerCount, `${route} tracker count for ${marker}`);
  }

  for (const route of KNOWN_THIN_CURRENT_ROUTES) {
    assert.ok(pages.has(route), `${route} must remain served until Phase C`);
    assert.match(pages.get(route), /data-pagefind-ignore="all"/);
    assert.doesNotMatch(pages.get(route), /data-pagefind-body/);
  }
});

test('the real Pagefind fragment route set exactly matches eligible built HTML', () => {
  const artifactRoot = path.join(root, 'dist');
  const pages = new Map(collectFiles(artifactRoot, (filePath) => filePath.endsWith('.html')).map((filePath) => [artifactRoute(filePath, artifactRoot), readFileSync(filePath, 'utf8')]));
  const eligibleRoutes = [...pages].filter(([, html]) => html.includes('data-pagefind-body')).map(([route]) => route).sort();
  assert.equal(eligibleRoutes.length, 20);

  const pagefindRoot = path.join(artifactRoot, 'pagefind');
  if (!existsSync(pagefindRoot)) {
    assert.equal(process.env.HOWBISCUIT_SKIP_PAGEFIND, '1', 'only the guarded Pi lane may omit Pagefind');
    return;
  }
  assert.ok(existsSync(path.join(pagefindRoot, 'pagefind.js')));
  const fragments = collectFiles(path.join(pagefindRoot, 'fragment'), (filePath) => filePath.endsWith('.pf_fragment'));
  const indexedRoutes = fragments.map((filePath) => {
    const payload = gunzipSync(readFileSync(filePath)).toString('utf8');
    return JSON.parse(payload.slice(payload.indexOf('{'))).url;
  }).sort();
  assert.equal(new Set(indexedRoutes).size, indexedRoutes.length, 'Pagefind routes must not be duplicated');
  assert.deepEqual(indexedRoutes, eligibleRoutes);
});
