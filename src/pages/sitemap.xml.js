import { getCollection } from 'astro:content';

import { createPublicPageCatalog, getPublicSiteData } from '../lib/public-content/site-registry.mjs';

function xmlEscape(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export async function GET(context) {
  const site = context.site?.toString().replace(/\/$/, '') ?? 'https://howbiscuit.com';
  const entries = await getCollection('docs');
  const urls = createPublicPageCatalog(entries, getPublicSiteData())
    .filter(({ sitemapEligible }) => sitemapEligible)
    .map((page) => ({
      loc: site + page.route,
      lastmod: page.updatedDate ?? page.publishedDate,
    }));

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => [
      '  <url>',
      '    <loc>' + xmlEscape(url.loc) + '</loc>',
      ...(url.lastmod ? ['    <lastmod>' + xmlEscape(url.lastmod) + '</lastmod>'] : []),
      '  </url>',
    ].join('\n')),
    '</urlset>',
    '',
  ].join('\n');

  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
