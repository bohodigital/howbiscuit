import { getCollection } from 'astro:content';

function docPath(id) {
  const clean = id.replace(/\.(md|mdx)$/, '').replace(/(^|\/)index$/, '');
  return clean ? `/${clean}/` : '/';
}

function xmlEscape(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function dateOnly(value) {
  if (!value) return '2026-07-01';
  return new Date(value).toISOString().slice(0, 10);
}

export async function GET(context) {
  const site = context.site?.toString().replace(/\/$/, '') ?? 'https://howbiscuit.com';
  const docs = await getCollection('docs');
  const urls = docs
    .map((entry) => ({
      loc: `${site}${docPath(entry.id)}`,
      lastmod: dateOnly(entry.data.updatedDate ?? entry.data.lastUpdated ?? entry.data.pubDate),
    }))
    .sort((a, b) => a.loc.localeCompare(b.loc));

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(
      (url) =>
        `  <url>\n    <loc>${xmlEscape(url.loc)}</loc>\n    <lastmod>${url.lastmod}</lastmod>\n  </url>`,
    ),
    '</urlset>',
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
}
