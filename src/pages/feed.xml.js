import rss from '@astrojs/rss';

import { orderLatestContent } from '../lib/public-content/model.mjs';
import { getPublicSiteData } from '../lib/public-content/site-registry.mjs';

export async function GET(context) {
  const { registry, taxonomy } = getPublicSiteData();
  const items = orderLatestContent(registry)
    .filter(({ feedEligible }) => feedEligible)
    .map((record) => ({
      title: record.title,
      description: record.description,
      pubDate: new Date(record.publishedDate + 'T12:00:00Z'),
      link: record.route,
    }));

  return rss({
    title: 'How Biscuit',
    description: taxonomy.PUBLIC_METADATA_DEFAULTS.description,
    site: context.site?.toString() ?? 'https://howbiscuit.com',
    customData: '<language>en-us</language>',
    items,
  });
}
