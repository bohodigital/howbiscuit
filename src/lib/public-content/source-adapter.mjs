import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { load as parseYaml } from 'js-yaml';

import { compileLatexArticle } from '../latex/article-compiler.mjs';

function asciiCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function extractFrontmatter(source, sourcePath) {
  const normalized = source.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) throw new Error(`${sourcePath}: missing YAML frontmatter`);
  const data = parseYaml(match[1]);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${sourcePath}: frontmatter must be a mapping`);
  }
  return data;
}

function routeFromMdxPath(relativePath) {
  const prefix = 'src/content/docs/';
  if (!relativePath.startsWith(prefix) || !relativePath.endsWith('.mdx')) {
    throw new Error(`Unsupported public MDX path: ${relativePath}`);
  }
  let route = relativePath.slice(prefix.length, -'.mdx'.length);
  route = route.replace(/(^|\/)index$/, '');
  return `/${route}/`.replaceAll('//', '/');
}

function mdxSource(root, relativePath) {
  const data = extractFrontmatter(readFileSync(path.join(root, relativePath), 'utf8'), relativePath);
  const route = routeFromMdxPath(relativePath);
  return Object.freeze({
    kind: data.kind,
    sourceKind: 'mdx',
    sourcePath: relativePath,
    route,
    slug: route.split('/').filter(Boolean).at(-1),
    title: data.title,
    description: data.description,
    legacyDivision: data.division ?? null,
    legacySubtopic: data.subtopic ?? null,
    categoryId: data.categoryId ?? null,
    topicId: data.topicId ?? null,
    articleType: data.articleType ?? null,
    editorialClassification: data.editorialClassification ?? null,
    articleFormat: data.articleFormat ?? 'standard',
    answerSummary: data.answerSummary ?? null,
    problemLabel: data.problemLabel ?? null,
    publishedDate: data.pubDate ?? null,
    updatedDate: data.updatedDate ?? data.lastUpdated ?? null,
    feed: data.feed ?? false,
    featured: data.featured ?? false,
    editorialPriority: data.editorialPriority ?? null,
    readTime: data.readTime ?? null,
    evidence: data.evidence ?? null,
    testing: data.testing ?? null,
    sourceNotes: data.sourceNotes ?? null,
    relatedContent: data.relatedContent ?? null,
    disclosure: data.disclosure ?? null,
    draft: data.draft ?? false,
    preview: data.preview ?? false,
    thin: data.thin ?? false,
    redirectState: data.redirectState ?? null,
    retirementState: data.retirementState ?? null,
  });
}

function latexSource(root, relativePath) {
  const compiled = compileLatexArticle(readFileSync(path.join(root, relativePath), 'utf8'), {
    sourcePath: relativePath,
  });
  const data = compiled.metadata;
  return Object.freeze({
    kind: 'article',
    sourceKind: 'latex',
    sourcePath: relativePath,
    route: `/articles/${data.slug}/`,
    slug: data.slug,
    title: data.title,
    description: data.description,
    legacyDivision: null,
    legacySubtopic: null,
    categoryId: data.categoryId ?? null,
    topicId: data.topicId ?? null,
    articleType: data.articleType ?? null,
    editorialClassification: data.editorialClassification ?? null,
    articleFormat: 'latex',
    answerSummary: data.answerSummary ?? null,
    problemLabel: data.problemLabel ?? null,
    publishedDate: data.pubDate ?? null,
    updatedDate: data.updatedDate ?? null,
    feed: data.feed ?? false,
    featured: data.featured ?? false,
    editorialPriority: data.editorialPriority ?? null,
    readTime: data.readTime ?? null,
    evidence: data.evidence ?? null,
    testing: data.testing ?? null,
    sourceNotes: data.sourceNotes ?? null,
    relatedContent: data.relatedContent ?? null,
    disclosure: data.disclosure ?? null,
    draft: false,
    preview: false,
    thin: false,
    redirectState: null,
    retirementState: null,
  });
}

export function discoverTrackedPublicSources(root) {
  const output = execFileSync('git', [
    'ls-files',
    '--',
    'src/content/docs',
    'content/latex/articles',
  ], { cwd: root, encoding: 'utf8' });
  const paths = output.trim().split(/\r?\n/).filter(Boolean);
  const sources = [];
  for (const relativePath of paths) {
    const source = relativePath.endsWith('.tex')
      ? latexSource(root, relativePath)
      : relativePath.endsWith('.mdx')
        ? mdxSource(root, relativePath)
        : null;
    if (source) sources.push(source);
  }

  sources.sort((left, right) => asciiCompare(left.route, right.route));
  const routes = sources.map(({ route }) => route);
  if (new Set(routes).size !== routes.length) {
    throw new Error(`Duplicate discovered public route: ${routes.join(', ')}`);
  }
  if (!sources.length) throw new Error('No tracked public sources were discovered.');
  return Object.freeze(sources.map((source) => Object.freeze({
    ...source,
    ...(source.kind === 'article' ? { classificationProvenance: 'canonical-source-metadata' } : {}),
  })));
}

export function discoverTrackedArticleSources(root) {
  const sources = discoverTrackedPublicSources(root).filter(({ kind }) => kind === 'article');
  if (!sources.length) throw new Error('No tracked article sources were discovered.');
  return Object.freeze(sources);
}
