import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

function docPath(id) {
  const clean = id.replace(/\.(md|mdx)$/, '').replace(/(^|\/)index$/, '');
  return clean ? `/${clean}/` : '/';
}

export async function GET(context) {
  const feedItems = await getCollection('docs', ({ data }) => data.feed === true);
  const items = feedItems
    .sort((a, b) => (b.data.pubDate?.getTime() ?? 0) - (a.data.pubDate?.getTime() ?? 0))
    .map((entry) => ({
      title: entry.data.title,
      description: entry.data.description,
      pubDate: entry.data.pubDate ?? new Date('2026-07-01T12:00:00Z'),
      link: docPath(entry.id),
    }));

  return rss({
    title: 'How Biscuit',
    description: 'Practical guides for home technology, cooking, repairs, and buying decisions.',
    site: context.site?.toString() ?? 'https://howbiscuit.com',
    customData: '<language>en-us</language>',
    items,
  });
}
