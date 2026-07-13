import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { allTopicIds } from './data/site-taxonomy.mjs';

const divisionSchema = z.enum([
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
        subtopic: z.enum(allTopicIds).optional(),
        tags: z.array(z.string()).default([]),
        evidence: z.string().optional(),
        readTime: z.string().optional(),
        estimatedCost: z.string().optional(),
        difficulty: z.enum(['easy', 'moderate', 'advanced']).optional(),
        safety: z.enum(['routine', 'caution', 'professional']).optional(),
        featured: z.boolean().default(false),
      }),
    }),
  }),
};
