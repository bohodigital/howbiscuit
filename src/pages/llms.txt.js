import { getCollection } from 'astro:content';

import { createPublicPageCatalog, getPublicSiteData } from '../lib/public-content/site-registry.mjs';

export async function GET() {
  const siteData = getPublicSiteData();
  const entries = await getCollection('docs');
  const pages = createPublicPageCatalog(entries, siteData).filter(({ llmsEligible }) => llmsEligible);
  const lines = [
    '# How Biscuit',
    '',
    '> ' + siteData.taxonomy.PUBLIC_METADATA_DEFAULTS.description,
    '',
    'How Biscuit is an independent practical-guides publication operated by Boho Digital Services.',
    'This build has no affiliate links, sponsored placements, paid reviews, or product placements.',
    '',
    '## Public pages',
    '',
    ...pages.flatMap((page) => ['- [' + page.title + '](https://howbiscuit.com' + page.route + '): ' + page.description]),
    '',
    '## Contact and corrections',
    '',
    '- Email: hello@howbiscuit.com',
    '- Corrections: https://howbiscuit.com/corrections/',
    '',
  ];
  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
