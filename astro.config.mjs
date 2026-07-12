import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://howbiscuit.com',
  integrations: [
    starlight({
      title: 'How Biscuit',
      description: 'Plain answers for school, cooking, home tech, and making do.',
      customCss: ['./src/styles/biscuit.css'],
      editLink: {
        baseUrl: 'https://github.com/thepresidentofai/howbiscuit_main/edit/main/',
      },
      sidebar: [
        {
          label: 'Biscuit Field Guide',
          items: [
            { label: 'Start Here', slug: '' },
            { label: 'Articles', slug: 'articles' },
            { label: 'Math', slug: 'math' },
            { label: 'Research & Writing', slug: 'research-writing' },
            { label: 'Cooking', slug: 'cook' },
            { label: 'Home Tech', slug: 'home-tech' },
            { label: 'Make-Do Lab', slug: 'make-do' },
            { label: 'Tools', slug: 'tools' },
          ],
        },
        {
          label: 'Articles',
          items: [
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
          label: 'More',
          items: [
            { label: 'Buying Guides', slug: 'buying-guides' },
            { label: 'Everyday Science', slug: 'science' },
            { label: 'Glossary', slug: 'glossary' },
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
      ],
    }),
  ],
});
