import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import { menuSections } from './src/data/site-taxonomy.mjs';

const skipPagefind = process.env.HOWBISCUIT_SKIP_PAGEFIND === '1';

const sectionMenus = menuSections.map(({ label, slug, topics }) => ({
  label,
  collapsed: true,
  items: [
    { label: `${label} Overview`, slug },
    ...topics.map((topic) => topic.slug
      ? { label: topic.label, slug: topic.slug }
      : { label: topic.label, link: topic.href }),
  ],
}));

export default defineConfig({
  site: 'https://howbiscuit.com',
  devToolbar: { enabled: false },
  integrations: [
    starlight({
      title: 'How Biscuit',
      description: 'Practical guides for home technology, cooking, repairs, and buying decisions.',
      pagefind: skipPagefind ? false : true,
      customCss: ['./src/styles/biscuit.css'],
      credits: false,
      components: {
        Header: './src/components/SiteHeader.astro',
        Footer: './src/components/SiteFooter.astro',
        Hero: './src/components/HomeHero.astro',
        PageTitle: './src/components/FieldGuideTitle.astro',
        PageFrame: './src/components/PersistentPageFrame.astro',
      },
      editLink: {
        baseUrl: 'https://github.com/bohodigital/howbiscuit/edit/main/',
      },
      sidebar: [
        {
          label: 'Main menu',
          collapsed: false,
          items: [
            { label: 'Home', slug: '' },
            { label: 'All Articles', slug: 'articles' },
            ...sectionMenus,
          ],
        },
        {
          label: 'Latest articles',
          items: [
            {
              label: 'Why Salt Melts Ice',
              slug: 'articles/why-salt-melts-ice',
            },
            {
              label: 'How Does Baking Powder Work?',
              slug: 'articles/how-does-baking-powder-work',
            },
            {
              label: 'Why Are Some Answers Better Than Others?',
              slug: 'articles/why-are-some-answers-better-than-others',
            },
          ],
        },
        {
          label: 'Trust',
          items: [
            { label: 'About', slug: 'about' },
            { label: 'Editorial Policy', slug: 'editorial-policy' },
            { label: 'Corrections', slug: 'corrections' },
            { label: 'Privacy', slug: 'privacy' },
            { label: 'Affiliate Disclosure', slug: 'affiliate-disclosure' },
            { label: 'Contact', slug: 'contact' },
          ],
        },
      ],
      head: [
        {
          tag: 'meta',
          attrs: {
            name: 'theme-color',
            content: '#fff8e7',
          },
        },
        {
          tag: 'meta',
          attrs: { property: 'og:type', content: 'website' },
        },
        {
          tag: 'meta',
          attrs: { property: 'og:site_name', content: 'How Biscuit' },
        },
        {
          tag: 'meta',
          attrs: { property: 'og:image', content: 'https://howbiscuit.com/og.png' },
        },
        {
          tag: 'meta',
          attrs: { property: 'og:image:alt', content: 'How Biscuit practical guides and troubleshooting.' },
        },
        {
          tag: 'meta',
          attrs: { name: 'twitter:card', content: 'summary_large_image' },
        },
        {
          tag: 'meta',
          attrs: { name: 'twitter:image', content: 'https://howbiscuit.com/og.png' },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'sitemap',
            href: '/sitemap.xml',
          },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'alternate',
            type: 'application/rss+xml',
            title: 'How Biscuit RSS Feed',
            href: '/feed.xml',
          },
        },
        {
          tag: 'script',
          attrs: {
            defer: true,
            src: 'https://analytics.bohodigitalservices.com/script.js',
            'data-website-id': 'fefef93c-b1d6-4d04-95d3-064af3d38a41',
            'data-domains': 'howbiscuit.com,www.howbiscuit.com',
            'data-do-not-track': 'true',
            'data-exclude-search': 'true',
          },
        },
        {
          tag: 'script',
          attrs: {
            async: true,
            src: 'https://www.googletagmanager.com/gtag/js?id=G-NG0NQMVFEH',
          },
        },
        {
          tag: 'script',
          content: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-NG0NQMVFEH', { anonymize_ip: true });`,
        },
      ],
    }),
  ],
});
