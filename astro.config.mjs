import mdx from '@astrojs/mdx';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://howbiscuit.com',
  trailingSlash: 'always',
  devToolbar: { enabled: false },
  integrations: [mdx()],
});
