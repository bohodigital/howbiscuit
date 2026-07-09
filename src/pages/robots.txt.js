export function GET(context) {
  const site = context.site?.toString().replace(/\/$/, '') ?? 'https://howbiscuit.com';

  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
