import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadTypeScriptModule } from '../scripts/lib/load-typescript-module.mjs';
import { createPublicSiteRegistry, isPublishablePublicRecord } from '../src/lib/public-content/model.mjs';
import { pagefindMetadataForRecord } from '../src/lib/public-content/pagefind-policy.mjs';
import { discoverTrackedPublicSources } from '../src/lib/public-content/source-adapter.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist');
const read = (relative) => readFileSync(path.join(root, relative), 'utf8');
const taxonomy = await loadTypeScriptModule(path.join(root, 'src', 'config', 'public-taxonomy.ts'));
const publicRegistry = createPublicSiteRegistry({
  sources: discoverTrackedPublicSources(root, { taxonomy }),
  taxonomy,
});
const publishableRegistry = publicRegistry.filter(isPublishablePublicRecord);
const PHASE_C_DOCUMENT_ROUTES = publishableRegistry.map(({ route }) => route);
const RETIRED_DOCUMENT_ROUTES = taxonomy.TARGET_ROUTE_CONTRACTS
  .filter(({ route, outcome }) => !route.includes('*') && ['redirect', 'terminal'].includes(outcome))
  .map(({ route }) => route);

function collectHtml(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectHtml(full));
    else if (entry.name.endsWith('.html')) files.push(full);
  }
  return files;
}

function routeFor(file) {
  const relative = path.relative(dist, file).replaceAll('\\', '/');
  if (relative === 'index.html') return '/';
  if (relative === '404.html') return '/404.html';
  return '/' + relative.replace(/index\.html$/, '');
}

function jsonLd(html) {
  const match = html.match(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  assert.ok(match, 'JSON-LD payload missing');
  return JSON.parse(match[1]);
}

function htmlText(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function contrastRatio(foreground, background) {
  const luminance = (hex) => {
    const channels = hex.match(/[a-f\d]{2}/gi).map((value) => Number.parseInt(value, 16) / 255);
    const linear = channels.map((value) => (
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    ));
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

const pages = new Map(collectHtml(dist).map((file) => [routeFor(file), readFileSync(file, 'utf8')]));

test('built artifact contains exactly the active Phase C routes plus the custom 404', () => {
  assert.deepEqual([...pages.keys()].sort(), [...PHASE_C_DOCUMENT_ROUTES, '/404.html'].sort());
  for (const route of RETIRED_DOCUMENT_ROUTES) assert.equal(pages.has(route), false, route);
  for (const route of PHASE_C_DOCUMENT_ROUTES) {
    const html = pages.get(route);
    assert.match(html, /data-pagefind-body/);
    assert.match(html, /content="index, follow"/);
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1, route);
    const headingLevels = [...html.matchAll(/<h([1-6])\b/g)].map((match) => Number(match[1]));
    headingLevels.slice(1).forEach((level, index) => {
      assert.ok(level <= headingLevels[index] + 1, `${route} skips from H${headingLevels[index]} to H${level}`);
    });
    assert.match(html, new RegExp('href="https://howbiscuit\\.com' + route.replaceAll('/', '\\/') + '"'));
  }
  const notFound = pages.get('/404.html');
  assert.doesNotMatch(notFound, /<link\b[^>]*rel="canonical"/i);
  assert.doesNotMatch(notFound, /<meta\b[^>]*property="og:url"/i);
  assert.equal(jsonLd(notFound).some((entry) => entry['@type'] === 'WebPage'), false);
});

test('built article semantics and public Pagefind labels match the normalized registry', () => {
  for (const record of publishableRegistry) {
    const html = pages.get(record.route);
    const expected = pagefindMetadataForRecord(record, taxonomy);
    if (expected.filters.category) {
      assert.match(html, new RegExp(`data-pagefind-filter="category">${htmlText(expected.filters.category)}<`), record.route);
    } else {
      assert.doesNotMatch(html, /data-pagefind-filter="category"/, record.route);
    }
    assert.match(html, new RegExp(`data-pagefind-filter="type">${htmlText(expected.filters.type)}<`), record.route);
  }
  const salt = pages.get('/articles/why-salt-melts-ice/');
  assert.equal((salt.match(/<article\b/g) ?? []).length, 1);
  assert.equal((salt.match(/<h1\b/g) ?? []).length, 1);
  assert.match(salt, /<div class="hb-latex-paper"/);
  assert.ok(salt.indexOf('<h1') < salt.indexOf('<p class="hb-direct-answer"'));
  assert.ok(salt.indexOf('<p class="hb-direct-answer"') < salt.indexOf('<nav class="hb-latex-outline"'));
  assert.ok(salt.indexOf('<nav class="hb-latex-outline"') < salt.indexOf('<div class="hb-latex-paper"'));
  const breadcrumb = jsonLd(salt).find((entry) => entry['@type'] === 'BreadcrumbList');
  const topicCrumb = breadcrumb.itemListElement.find((item) => item.name === 'Heating & Cooling');
  assert.equal(topicCrumb.item, 'https://howbiscuit.com/home/#topic-heating-cooling');
  assert.doesNotMatch(pages.get('/tools/'), /href="\/tools\/">View the Tools category/);
});

test('WCAG text, non-text, and reviewed selector contrast guards remain fail closed', () => {
  const biscuitCss = read('src/styles/biscuit.css');
  const shellCss = read('src/styles/shell.css');
  for (const [foreground, background, minimum, label] of [
    ['#b43a22', '#fff8e7', 4.5, 'light tomato text'],
    ['#ff7759', '#111b23', 4.5, 'dark tomato text'],
    ['#142432', '#ef6547', 4.5, 'light tomato hover text'],
    ['#142432', '#ff7759', 4.5, 'dark tomato hover text'],
    ['#142432', '#f7c94b', 4.5, 'light honey text'],
    ['#142432', '#ffd05b', 4.5, 'dark honey text'],
    ['#ffffff', '#315ee8', 4.5, 'light Home Tech title'],
    ['#142432', '#7190ff', 4.5, 'dark Home Tech title'],
    ['#f7c94b', '#142432', 4.5, 'light panic-strip label'],
    ['#142432', '#fff7e5', 4.5, 'dark panic-strip label'],
    ['#4e5b64', '#fff8e7', 4.5, 'light secondary text'],
    ['#c6c9c4', '#111b23', 4.5, 'dark secondary text'],
    ['#164aa8', '#f6f2e8', 4.5, 'LaTeX link text'],
    ['#fff8e7', '#142432', 3, 'light panic-strip focus indicator'],
    ['#111b23', '#fff7e5', 3, 'dark panic-strip focus indicator'],
    ['#315ee8', '#f6f2e8', 3, 'dark LaTeX focus indicator'],
    ['#315ee8', '#fff8e7', 3, 'light global focus indicator'],
    ['#7190ff', '#111b23', 3, 'dark global focus indicator'],
  ]) {
    assert.ok(contrastRatio(foreground, background) >= minimum, `${label} must meet WCAG contrast`);
  }
  assert.match(biscuitCss, /--hb-tomato-text:\s*#b43a22/);
  assert.match(biscuitCss, /--hb-ink-soft:\s*#4e5b64/);
  assert.match(biscuitCss, /:root\[data-theme='dark'\][\s\S]*--hb-ink-soft:\s*#c6c9c4/);
  assert.match(biscuitCss, /a:focus-visible,[\s\S]*button:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--hb-blue\)/);
  assert.match(biscuitCss, /\.hb-panic-strip a:hover\s*\{[^}]*background:\s*var\(--hb-tomato\);[^}]*color:\s*#142432/);
  assert.doesNotMatch(biscuitCss, /\.hb-topic-directory\b|\.hb-hub-title\b|\[data-division=/);
  assert.match(biscuitCss, /:root\[data-theme='dark'\] \.hb-panic-strip > p\s*\{[^}]*color:\s*#142432/);
  assert.match(biscuitCss, /\.hb-panic-strip a:focus-visible\s*\{[^}]*outline-color:\s*var\(--hb-paper\)/);
  assert.match(biscuitCss, /:root\[data-theme='dark'\] \.hb-latex-paper a:focus-visible\s*\{[^}]*outline-color:\s*#315ee8/);
  assert.match(biscuitCss, /\.hb-latex-paper a\s*\{[^}]*color:\s*#164aa8/);
  assert.match(shellCss, /\.hb-menu-guides a:hover small\s*\{[^}]*color:\s*#142432/);
  assert.match(shellCss, /\.hb-disclosure a\s*\{[^}]*color:\s*#142432/);
  assert.match(shellCss, /\.hb-disclosure a:focus-visible\s*\{[^}]*outline-color:\s*#142432/);
});

test('homepage uses registry-driven sections in the governed conceptual order', () => {
  const home = pages.get('/');
  const markers = [
    'Featured guides',
    'BROWSE BY PROBLEM',
    'Browse by category',
    'Latest guides',
    'Shopping resources',
    'EVIDENCE ON EVERY GUIDE',
  ];
  const positions = markers.map((marker) => home.indexOf(marker));
  assert.ok(positions.every((position) => position >= 0), positions);
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.match(home, /Why Salt Melts Ice/);
  assert.match(home, /Home Tech/);
  assert.match(home, /Home &amp; Apartment/);
  assert.match(home, /Kitchen/);
  assert.match(home, /Shop Smarter/);
  assert.match(home, /Tools/);
  assert.match(home, /href="\/articles\/">Browse All Guides<\/a>/);
  assert.doesNotMatch(home, /View all guides/i);
  assert.doesNotMatch(home, /Why Are Some Answers Better Than Others/);
  assert.doesNotMatch(home, /Check Local Prices<\/a>/);
});

test('categories expose honest topic thresholds, empty states, and neighboring routes', () => {
  assert.match(pages.get('/home/'), /Heating &amp; Cooling/);
  assert.match(pages.get('/home/'), /Why Salt Melts Ice/);
  assert.match(pages.get('/kitchen/'), /Food Science/);
  assert.match(pages.get('/kitchen/'), /How Does Baking Powder Work/);
  for (const route of ['/home-tech/', '/shop/', '/tools/']) {
    assert.match(pages.get(route), /No topic has enough published guides yet/);
    assert.match(pages.get(route), /No publishable guides in this category/);
  }
  assert.match(pages.get('/shop/'), /No product group is published/);
});

test('All Guides, RSS, sitemap, llms.txt, and article related services share the three real articles', () => {
  const routes = [
    '/articles/how-does-baking-powder-work/',
    '/articles/why-are-some-answers-better-than-others/',
    '/articles/why-salt-melts-ice/',
  ];
  const allGuides = pages.get('/articles/');
  const feed = read('dist/feed.xml');
  const sitemap = read('dist/sitemap.xml');
  const llms = read('dist/llms.txt');
  const privacySitemapEntry = sitemap.match(/<url>\s*<loc>https:\/\/howbiscuit\.com\/privacy\/<\/loc>([\s\S]*?)<\/url>/);
  assert.ok(privacySitemapEntry);
  assert.doesNotMatch(privacySitemapEntry[1], /<lastmod>/);
  assert.match(allGuides, /<h2[^>]*id="all-guides-list-title"[^>]*>Guides<\/h2>/);
  assert.deepEqual(
    [...allGuides.matchAll(/hb-guide-card-top"><span>([^<]+)<\/span>/g)].map((match) => match[1]).sort(),
    ['Editorial standard', 'Home &amp; Apartment', 'Kitchen'].sort(),
  );
  let ordinaryTocCount = 0;
  for (const route of routes) {
    assert.match(allGuides, new RegExp('href="' + route.replaceAll('/', '\\/') + '"'));
    assert.ok(feed.includes('https://howbiscuit.com' + route));
    assert.ok(sitemap.includes('https://howbiscuit.com' + route));
    assert.ok(llms.includes('https://howbiscuit.com' + route));
    const article = pages.get(route);
    assert.match(article, /hb-sources/);
    assert.match(article, /<aside class="hb-related" aria-label="Related guides">/);
    assert.match(article, /Report a correction/);
    assert.match(article, /no affiliate links, sponsored placements, paid reviews, or product placements/i);
    assert.match(article, /class="hb-article-labels" role="group" aria-label="Article classification"/);
    assert.match(article, /class="hb-badge hb-evidence hb-evidence-label" data-evidence="(?:researched|editorial-standard)"/);
    assert.match(article, /class="hb-badge hb-testing-badge" data-state="(?:not-hands-on-tested|not-applicable)"/);
    for (const [aside] of article.matchAll(/(<aside\b[^>]*>)/g)) {
      assert.match(aside, /aria-(?:label|labelledby)="[^"]+"/, `${route} has an unnamed complementary landmark`);
    }
    const tocNavigation = article.match(/<nav\b(?=[^>]*\bclass="[^"]*\bhb-article-toc\b[^"]*")(?=[^>]*\baria-labelledby="article-toc-title")[^>]*>/);
    if (tocNavigation) {
      ordinaryTocCount += 1;
      assert.ok(article.indexOf(tocNavigation[0]) < article.indexOf('class="hb-content"'), `${route} TOC follows the article body`);
    }
  }
  assert.equal(ordinaryTocCount, 2);
});

test('structured data contains WebSite globally and Article plus BreadcrumbList on articles', () => {
  assert.ok(jsonLd(pages.get('/')).some((entry) => entry['@type'] === 'WebSite'));
  for (const route of PHASE_C_DOCUMENT_ROUTES.filter((item) => item.startsWith('/articles/') && item !== '/articles/')) {
    const articleHtml = pages.get(route);
    const types = jsonLd(articleHtml).map((entry) => entry['@type']);
    assert.ok(types.includes('WebSite'), route);
    assert.ok(types.includes('Article'), route);
    assert.ok(types.includes('BreadcrumbList'), route);
    assert.match(articleHtml, /<meta property="og:type" content="article"/);
  }
});

test('trust, recovery, redirects, navigation, and framework removal are truthful', () => {
  assert.match(pages.get('/about/'), /independent practical-guides publication operated by Boho Digital Services/);
  assert.match(pages.get('/contact/'), /mailto:hello@howbiscuit\.com/);
  assert.match(pages.get('/corrections/'), /mailto:hello@howbiscuit\.com/);
  assert.match(pages.get('/affiliate-disclosure/'), /no affiliate links, sponsored placements, paid reviews, or product placements/i);
  assert.match(pages.get('/404.html'), /bettergrades\.net/);
  for (const label of ['Home Tech', 'Home &amp; Apartment', 'Kitchen', 'Shop Smarter', 'Tools', 'All Guides']) {
    for (const html of pages.values()) assert.match(html, new RegExp('<footer[\\s\\S]*' + label), label);
  }
  const redirects = read('public/_redirects');
  for (const line of [
    '/make-do/ /home/ 301',
    '/cook/ /kitchen/ 301',
    '/buying-guides/ /shop/ 301',
    '/research-writing/ /editorial-policy/ 301',
    '/cooking/* /kitchen/ 301',
    '/make-do-lab/* /home/ 301',
  ]) assert.ok(redirects.includes(line), line);
  const header = read('src/components/SiteHeader.astro');
  assert.match(header, /href=\{category\.href\}/);
  assert.match(header, /resolvePublicNavigationState/);
  assert.match(header, /summary aria-current=\{navigationState\.categories\[category\.id\]\}/);
  assert.match(header, /published guide\$\{topic\.count === 1 \? '' : 's'\}/);
  assert.match(header, /class="hb-topic-labels" role="group" aria-label=/);
  assert.match(header, /class="hb-search-results" role="region" aria-label="Search results"/);
  assert.match(pages.get('/home/'), /<summary aria-current="page"[^>]*>Home &amp; Apartment/);
  assert.match(pages.get('/articles/why-salt-melts-ice/'), /<summary aria-current="true"[^>]*>Home &amp; Apartment/);
  assert.match(pages.get('/articles/'), /class="hb-all-guides-link"[^>]*aria-current="page"/);
  assert.match(pages.get('/articles/why-are-some-answers-better-than-others/'), /class="hb-all-guides-link"[^>]*aria-current="true"/);
  assert.equal(existsSync(path.join(root, 'src/data/site-taxonomy.mjs')), false);
  assert.equal(existsSync(path.join(root, 'src/lib/public-content/classification-manifest.mjs')), false);
  assert.doesNotMatch(read('package.json'), /@astrojs\/starlight|@astrojs\/sitemap/);
  assert.doesNotMatch(read('astro.config.mjs'), /starlight|sitemap\(/i);
});
