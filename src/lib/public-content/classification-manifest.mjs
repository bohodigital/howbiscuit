/**
 * Temporary Phase A migration classifications.
 *
 * This is intentionally not a content registry: source-owned titles, descriptions,
 * dates, formats, feed flags, evidence, and read times are forbidden here. The
 * executable adapter joins these missing classifications to the discovered tracked
 * article sources and fails unless both route sets match exactly. Phase B should move
 * accepted classifications into canonical content metadata and then delete this file.
 */
export const ARTICLE_CLASSIFICATION_MANIFEST = Object.freeze({
  '/articles/how-does-baking-powder-work/': Object.freeze({
    categoryId: 'kitchen',
    topicId: 'food-science',
    articleType: 'guide',
    editorialClassification: 'not-separately-declared',
    editorialPriority: 0,
    testingState: 'not-declared',
    sourceNotesState: 'legacy-body',
    relatedContentState: 'legacy-body',
    disclosureState: 'not-declared',
    rationale: 'The article explains ingredient chemistry and failure mechanisms, so Kitchen and Food Science are the approved defensible classification.',
  }),
  '/articles/why-are-some-answers-better-than-others/': Object.freeze({
    categoryId: null,
    topicId: null,
    articleType: 'editorial-standard',
    editorialClassification: 'editorial-standard',
    editorialPriority: 0,
    testingState: 'not-declared',
    sourceNotesState: 'legacy-body',
    relatedContentState: 'legacy-body',
    disclosureState: 'not-declared',
    rationale: 'The owner-approved handoff identifies this as an Editorial Standard and expressly forbids fabricating a commercial category for it.',
  }),
  '/articles/why-salt-melts-ice/': Object.freeze({
    categoryId: 'home',
    topicId: 'heating-cooling',
    articleType: 'guide',
    editorialClassification: 'not-separately-declared',
    editorialPriority: 0,
    testingState: 'not-declared',
    sourceNotesState: 'legacy-body',
    relatedContentState: 'legacy-body',
    disclosureState: 'not-declared',
    rationale: 'The practical intent is cold-weather de-icing around a home, making Home and Apartment plus Heating and Cooling more specific than general repairs.',
  }),
});
