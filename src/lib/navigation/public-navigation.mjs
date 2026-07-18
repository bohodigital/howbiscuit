import {
  isPublishableGuide,
  topicPublicationModeForRegistry,
} from '../public-content/model.mjs';

function compareGuides(left, right) {
  const leftDate = left.publishedDate ?? '';
  const rightDate = right.publishedDate ?? '';
  if (leftDate !== rightDate) return rightDate.localeCompare(leftDate);
  return left.route.localeCompare(right.route);
}

export function buildPublicNavigation({ taxonomy, registry }) {
  if (!taxonomy || !Array.isArray(taxonomy.PUBLIC_CATEGORIES)) {
    throw new Error('The accepted public taxonomy is required.');
  }
  if (!Array.isArray(registry)) throw new Error('The normalized public-content registry is required.');

  const categories = taxonomy.PUBLIC_CATEGORIES.map((category) => {
    const topicLabels = category.topics.flatMap((topic) => {
      const mode = topicPublicationModeForRegistry({
        registry,
        categoryId: category.id,
        topicId: topic.id,
        taxonomy,
      });
      return mode === 'hidden'
        ? []
        : [{ id: topic.id, label: topic.label, mode }];
    });
    const guideLinks = registry
      .filter((record) => (
        isPublishableGuide(record)
        && record.searchEligible
        && record.categoryId === category.id
      ))
      .sort(compareGuides)
      .slice(0, 2)
      .map((record) => ({
        href: record.route,
        title: record.title,
        description: record.description,
        topicId: record.topicId,
      }));

    return Object.freeze({
      id: category.id,
      label: category.label,
      description: category.description,
      href: category.implemented ? category.route : null,
      topicLabels: Object.freeze(topicLabels),
      guideLinks: Object.freeze(guideLinks),
    });
  });

  return Object.freeze({
    home: Object.freeze({ label: 'How Biscuit', href: '/' }),
    categories: Object.freeze(categories),
    allGuides: Object.freeze({ label: taxonomy.ALL_GUIDES_TARGET.label, href: '/articles/' }),
  });
}
