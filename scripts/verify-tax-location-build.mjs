import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  allTaxLocationPages,
  taxLocationDirectoryPath,
  taxLocationPagePath,
} from '../src/data/tax-location-pages.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const htmlPath = (urlPath) => path.join(dist, ...urlPath.split('/').filter(Boolean), 'index.html');
const occurrences = (value, pattern) => value.match(pattern)?.length ?? 0;

assert.equal(allTaxLocationPages.length, 76, 'Expected 51 state/DC pages and 25 metro pages.');

const canonicals = new Set();
for (const page of allTaxLocationPages) {
  const urlPath = taxLocationPagePath(page);
  const html = await readFile(htmlPath(urlPath), 'utf8');
  const canonical = `https://howbiscuit.com${urlPath}`;
  assert.match(html, new RegExp(`<title>${page.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\| How Biscuit</title>`));
  assert.ok(html.includes(`<link rel="canonical" href="${canonical}"`), `${page.slug} canonical is missing.`);
  assert.equal(occurrences(html, /analytics\.bohodigitalservices\.com\/script\.js/g), 1, `${page.slug} Umami tag count changed.`);
  assert.equal(occurrences(html, /googletagmanager\.com\/gtag\/js\?id=G-NG0NQMVFEH/g), 1, `${page.slug} Google tag count changed.`);
  assert.equal(occurrences(html, /gtag\('config', 'G-NG0NQMVFEH'/g), 1, `${page.slug} Google config count changed.`);
  assert.ok(html.includes('data-pagefind-body'), `${page.slug} is outside the Pagefind body.`);
  assert.ok(html.includes('application/ld+json'), `${page.slug} structured data is missing.`);
  assert.ok(html.includes('data-location-landing="true"'), `${page.slug} calculator landing preset is missing.`);
  canonicals.add(canonical);
}
assert.equal(canonicals.size, allTaxLocationPages.length, 'Location canonicals must be unique.');

const directoryHtml = await readFile(htmlPath(taxLocationDirectoryPath), 'utf8');
for (const page of allTaxLocationPages) {
  assert.ok(directoryHtml.includes(`href="${taxLocationPagePath(page)}"`), `${page.slug} is missing from the directory.`);
}

const sitemap = await readFile(path.join(dist, 'sitemap-0.xml'), 'utf8');
for (const page of allTaxLocationPages) {
  assert.ok(sitemap.includes(`https://howbiscuit.com${taxLocationPagePath(page)}`), `${page.slug} is missing from the sitemap.`);
}

const pagefindEntry = JSON.parse(await readFile(path.join(dist, 'pagefind', 'pagefind-entry.json'), 'utf8'));
assert.ok(pagefindEntry.languages?.en?.page_count >= allTaxLocationPages.length, 'Pagefind did not index the generated page set.');

console.log(`Verified ${allTaxLocationPages.length} tax location pages, unique canonicals, sitemap entries, Pagefind coverage, and unchanged analytics tags.`);
