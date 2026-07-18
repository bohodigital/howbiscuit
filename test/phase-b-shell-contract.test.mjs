import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadTypeScriptModule } from '../scripts/lib/load-typescript-module.mjs';
import { createPublicSiteRegistry } from '../src/lib/public-content/model.mjs';
import { discoverTrackedPublicSources } from '../src/lib/public-content/source-adapter.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist');
const read = (relative) => readFileSync(path.join(root, relative), 'utf8');
const taxonomy = await loadTypeScriptModule(path.join(root, 'src', 'config', 'public-taxonomy.ts'));
const publicRegistry = createPublicSiteRegistry({
  sources: discoverTrackedPublicSources(root, { taxonomy }),
  taxonomy,
});
const PHASE_C_DOCUMENT_ROUTES = publicRegistry.map(({ route }) => route);
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
    assert.match(article, /hb-related/);
    assert.match(article, /Report a correction/);
    assert.match(article, /no affiliate links, sponsored placements, paid reviews, or product placements/i);
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
    const types = jsonLd(pages.get(route)).map((entry) => entry['@type']);
    assert.ok(types.includes('WebSite'), route);
    assert.ok(types.includes('Article'), route);
    assert.ok(types.includes('BreadcrumbList'), route);
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
  assert.match(header, /published guide\$\{topic\.count === 1 \? '' : 's'\}/);
  assert.equal(existsSync(path.join(root, 'src/data/site-taxonomy.mjs')), false);
  assert.equal(existsSync(path.join(root, 'src/lib/public-content/classification-manifest.mjs')), false);
  assert.doesNotMatch(read('package.json'), /@astrojs\/starlight|@astrojs\/sitemap/);
  assert.doesNotMatch(read('astro.config.mjs'), /starlight|sitemap\(/i);
});
