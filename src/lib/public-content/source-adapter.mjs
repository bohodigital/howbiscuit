import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
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

function latexSource(root, relativePath, taxonomy) {
  const compiled = compileLatexArticle(readFileSync(path.join(root, relativePath), 'utf8'), {
    sourcePath: relativePath,
    taxonomy,
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

function generatedArticleSources(root, generatedArticles = null) {
  const generatedPath = path.join(root, 'src', 'generated', 'publishing', 'articles.v1.json');
  if (generatedArticles === null && !existsSync(generatedPath)) return new Map();
  const payload = generatedArticles === null
    ? JSON.parse(readFileSync(generatedPath, 'utf8'))
    : { schemaVersion: '1.0.0', articles: generatedArticles };
  if (payload?.schemaVersion !== '1.0.0' || !Array.isArray(payload.articles)) {
    throw new Error('Generated publishing output must use NormalizedPublicArticleV1.');
  }
  return new Map(payload.articles.map((article) => {
    if (article?.kind !== 'article' || !['article-package', 'latex-article'].includes(article?.sourceKind)) {
      throw new Error('Generated publishing output contains an unsupported record.');
    }
    return [article.route, Object.freeze({
      kind: 'article',
      sourceKind: article.sourceKind,
      sourcePath: article.bodySourcePath,
      route: article.route,
      slug: article.slug,
      title: article.title,
      description: article.description,
      categoryId: article.categoryId,
      topicId: article.topicId,
      articleType: article.articleType,
      editorialClassification: article.editorialClassification,
      articleFormat: article.articleFormat,
      answerSummary: article.answerSummary,
      problemLabel: article.problemLabel,
      publishedDate: article.publishedDate,
      updatedDate: article.updatedDate,
      feed: article.feedEligible,
      featured: article.featured,
      editorialPriority: article.editorialPriority,
      readTime: article.readTime,
      evidence: article.evidence,
      testing: article.testing,
      sourceNotes: article.sourceNotes,
      relatedContent: article.relatedContent,
      disclosure: article.disclosure,
      draft: article.draft,
      preview: article.preview,
      thin: article.thin,
      redirectState: article.redirectState,
      retirementState: article.retirementState,
      normalizedSchemaVersion: article.schemaVersion,
      packageDigest: article.packageDigest,
    })];
  }));
}

export function discoverTrackedPublicSources(root, { taxonomy, generatedArticles = null, expectedGeneratedRoutes = [] } = {}) {
  const output = execFileSync('git', [
    'ls-files',
    '--',
    'src/content/docs',
    'content/latex/articles',
  ], { cwd: root, encoding: 'utf8' });
  const paths = output.trim().split(/\r?\n/).filter(Boolean);
  const generated = generatedArticleSources(root, generatedArticles);
  const generatedBySourcePath = new Map([...generated.values()].map((source) => [source.sourcePath, source]));
  const sources = [];
  for (const relativePath of paths) {
    const route = relativePath.endsWith('.mdx') ? routeFromMdxPath(relativePath) : null;
    const generatedSource = (route ? generated.get(route) : null) ?? generatedBySourcePath.get(relativePath);
    const source = generatedSource
      ? generatedSource
      : relativePath.endsWith('.tex')
      ? latexSource(root, relativePath, taxonomy)
      : relativePath.endsWith('.mdx')
        ? mdxSource(root, relativePath)
        : null;
    if (source) sources.push(source);
  }

  const discoveredRoutes = new Set(sources.map(({ route }) => route));
  const expected = new Set(expectedGeneratedRoutes);
  for (const route of generated.keys()) {
    if (!discoveredRoutes.has(route) && expected.has(route)) {
      sources.push(generated.get(route));
      discoveredRoutes.add(route);
    } else if (!discoveredRoutes.has(route)) {
      throw new Error(`Generated article has no renderable content entry: ${route}`);
    }
  }

  sources.sort((left, right) => asciiCompare(left.route, right.route));
  const routes = sources.map(({ route }) => route);
  if (new Set(routes).size !== routes.length) {
    throw new Error(`Duplicate discovered public route: ${routes.join(', ')}`);
  }
  if (!sources.length) throw new Error('No tracked public sources were discovered.');
  return Object.freeze(sources.map((source) => Object.freeze({
    ...source,
    ...(source.kind === 'article' ? { classificationProvenance: ['article-package', 'latex-article'].includes(source.sourceKind) ? 'normalized-article-package' : 'canonical-source-metadata' } : {}),
  })));
}

export function discoverTrackedArticleSources(root, { taxonomy } = {}) {
  const sources = discoverTrackedPublicSources(root, { taxonomy }).filter(({ kind }) => kind === 'article');
  if (!sources.length) throw new Error('No tracked article sources were discovered.');
  return Object.freeze(sources);
}
