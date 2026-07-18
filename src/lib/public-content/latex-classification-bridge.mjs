/**
 * Exact Phase B compatibility bridge for canonical LaTeX sources.
 *
 * The Phase B work order permits public-content adapter changes but does not
 * permit editing content/latex. Phase C explicitly owns that path and should
 * move this accepted classification into the TeX metadata, then delete this
 * bridge. No titles, descriptions, dates, or other source facts belong here.
 */
const LATEX_CLASSIFICATION_BY_ROUTE = Object.freeze({
  '/articles/why-salt-melts-ice/': Object.freeze({
    categoryId: 'home',
    topicId: 'heating-cooling',
    articleType: 'guide',
    editorialClassification: 'not-separately-declared',
    editorialPriority: 0,
  }),
});

export const ACCEPTED_LATEX_CLASSIFICATION_ROUTES = Object.freeze(
  Object.keys(LATEX_CLASSIFICATION_BY_ROUTE),
);

export function applyAcceptedLatexClassification(article) {
  if (!article?.metadata?.slug) throw new Error('Compiled LaTeX article metadata is required.');
  const route = `/articles/${article.metadata.slug}/`;
  const classification = LATEX_CLASSIFICATION_BY_ROUTE[route];
  if (!classification) throw new Error(`No accepted LaTeX classification exists for ${route}.`);
  return Object.freeze({
    ...article,
    metadata: Object.freeze({ ...article.metadata, ...classification }),
  });
}
