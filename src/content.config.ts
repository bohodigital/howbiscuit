import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

const divisionSchema = z.enum([
  'math',
  'research-writing',
  'cook',
  'home-tech',
  'make-do',
  'tools',
  'buying-guides',
  'science',
  'glossary',
]);

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        kind: z.enum(['home', 'division', 'article', 'trust']).optional(),
        division: divisionSchema.optional(),
        feed: z.boolean().default(false),
        pubDate: z.coerce.date().optional(),
        updatedDate: z.coerce.date().optional(),
      }),
    }),
  }),
};
