import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

import {
  PUBLIC_CATEGORIES,
  hasTargetTopic,
  type PublicCategoryId,
} from './config/public-taxonomy';

const publicCategoryIds = PUBLIC_CATEGORIES.map(({ id }) => id) as [PublicCategoryId, ...PublicCategoryId[]];
const categoryId = z.enum(publicCategoryIds);
const sourceNote = z.object({
  title: z.string().min(1),
  publisher: z.string().min(1),
  href: z.string().min(1),
});

const docs = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/docs' }),
  schema: z.object({
    title: z.string().min(1),
    description: z.string().min(40),
    kind: z.enum(['home', 'category', 'guide-index', 'article', 'trust']),
    articleFormat: z.enum(['standard', 'latex']).default('standard'),
    categoryId: categoryId.nullable().optional(),
    topicId: z.string().nullable().optional(),
    articleType: z.enum(['guide', 'editorial-standard']).optional(),
    editorialClassification: z.string().optional(),
    editorialPriority: z.number().int().optional(),
    answerSummary: z.string().min(40).optional(),
    problemLabel: z.string().min(1).optional(),
    feed: z.boolean().default(false),
    pubDate: z.coerce.date().optional(),
    updatedDate: z.coerce.date().optional(),
    lastUpdated: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    evidence: z.enum([
      'Hands-on tested',
      'Owner experience',
      'Specification reviewed',
      'Researched',
      'Price listing only',
      'Editorial standard',
    ]).optional(),
    readTime: z.string().optional(),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
    preview: z.boolean().default(false),
    thin: z.boolean().default(false),
    redirectState: z.object({ to: z.string() }).nullable().optional(),
    retirementState: z.object({ allowedStatuses: z.array(z.number().int()) }).nullable().optional(),
    testing: z.object({
      state: z.enum(['hands-on-tested', 'owner-experience', 'not-hands-on-tested', 'not-applicable']),
      notes: z.array(z.string().min(1)),
    }).optional(),
    sourceNotes: z.object({
      state: z.literal('structured'),
      items: z.array(sourceNote).min(1),
    }).optional(),
    relatedContent: z.object({
      state: z.literal('structured'),
      routes: z.array(z.string().startsWith('/articles/')),
    }).optional(),
    disclosure: z.object({
      state: z.literal('no-paid-links'),
      text: z.string().min(1),
      href: z.literal('/affiliate-disclosure/'),
    }).optional(),
  }).superRefine((data, context) => {
    if (data.kind === 'category' && !data.categoryId) {
      context.addIssue({ code: 'custom', path: ['categoryId'], message: 'Category pages require categoryId.' });
    }
    if (data.kind !== 'article') return;
    for (const field of ['articleType', 'editorialClassification', 'editorialPriority', 'answerSummary', 'evidence', 'readTime', 'testing', 'sourceNotes', 'relatedContent', 'disclosure'] as const) {
      if (data[field] === undefined) {
        context.addIssue({ code: 'custom', path: [field], message: `Article pages require ${field}.` });
      }
    }
    if (data.articleType === 'guide') {
      if (!data.categoryId || !data.topicId) {
        context.addIssue({ code: 'custom', path: ['categoryId'], message: 'Guide articles require category and topic metadata.' });
      } else if (!hasTargetTopic(data.categoryId, data.topicId)) {
        context.addIssue({ code: 'custom', path: ['topicId'], message: 'Guide articles require a topic from the canonical public taxonomy.' });
      }
    }
    if (data.articleType === 'editorial-standard' && (data.categoryId !== null || data.topicId !== null)) {
      context.addIssue({ code: 'custom', path: ['categoryId'], message: 'Editorial standards must remain categoryless.' });
    }
  }),
});

export const collections = { docs };
