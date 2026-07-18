import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

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

const docs = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/docs' }),
  schema: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    kind: z.enum(['home', 'division', 'article', 'trust']),
    articleFormat: z.enum(['standard', 'latex']).default('standard'),
    division: divisionSchema.optional(),
    categoryId: z.enum(['home-tech', 'home', 'kitchen', 'shop', 'tools']).nullable().optional(),
    topicId: z.string().nullable().optional(),
    articleType: z.enum(['guide', 'editorial-standard']).optional(),
    editorialClassification: z.string().optional(),
    feed: z.boolean().default(false),
    pubDate: z.coerce.date().optional(),
    updatedDate: z.coerce.date().optional(),
    lastUpdated: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    evidence: z.string().optional(),
    readTime: z.string().optional(),
    featured: z.boolean().default(false),
    template: z.string().optional(),
    hero: z.object({ tagline: z.string().optional() }).optional(),
    draft: z.boolean().default(false),
    preview: z.boolean().default(false),
    thin: z.boolean().default(false),
    redirectState: z.object({ to: z.string() }).nullable().optional(),
    retirementState: z.object({ allowedStatuses: z.array(z.number().int()) }).nullable().optional(),
    editorialPriority: z.number().int().optional(),
    testing: z.unknown().optional(),
    sourceNotes: z.unknown().optional(),
    relatedContent: z.unknown().optional(),
    disclosure: z.unknown().optional(),
  }),
});

export const collections = { docs };
