export function buildPublicNavigation({ taxonomy, categoryViews }) {
  if (!taxonomy || !Array.isArray(taxonomy.PUBLIC_CATEGORIES)) {
    throw new Error('The accepted public taxonomy is required.');
  }
  if (!Array.isArray(categoryViews)) throw new Error('Normalized category views are required.');

  const categories = categoryViews.map((category) => Object.freeze({
    id: category.id,
    label: category.label,
    description: category.description,
    href: category.route,
    topicLabels: Object.freeze(category.topics.map((topic) => Object.freeze({
      id: topic.id,
      label: topic.label,
      mode: topic.mode,
      count: topic.count,
      href: topic.mode === 'standalone' ? topic.route : `${category.route}#topic-${topic.id}`,
    }))),
    guideLinks: Object.freeze(category.latestGuides.slice(0, 2).map((record) => Object.freeze({
      href: record.route,
      title: record.title,
      description: record.description,
      topicId: record.topicId,
    }))),
  }));

  return Object.freeze({
    home: Object.freeze({ label: 'How Biscuit', href: '/' }),
    categories: Object.freeze(categories),
    allGuides: Object.freeze({ label: taxonomy.ALL_GUIDES_TARGET.label, href: taxonomy.ALL_GUIDES_TARGET.route }),
  });
}
