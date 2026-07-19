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

export function resolvePublicNavigationState({ currentPath, navigation, registry }) {
  if (typeof currentPath !== 'string' || !currentPath.startsWith('/')) {
    throw new Error('A root-relative current path is required.');
  }
  if (!navigation || !Array.isArray(navigation.categories) || !navigation.allGuides) {
    throw new Error('Normalized public navigation is required.');
  }
  if (!Array.isArray(registry)) throw new Error('The normalized article registry is required.');

  const path = currentPath === '/' || currentPath.endsWith('/') ? currentPath : `${currentPath}/`;
  const currentArticle = registry.find((record) => record.route === path);
  const categoryRoute = navigation.categories.find((category) => category.href === path);
  const topicCategory = navigation.categories.find((category) => category.topicLabels.some((topic) => (
    topic.mode === 'standalone' && topic.href === path
  )));
  const activeCategoryId = categoryRoute?.id ?? topicCategory?.id ?? currentArticle?.categoryId ?? null;

  return Object.freeze({
    home: path === '/' ? 'page' : undefined,
    allGuides: path === navigation.allGuides.href
      ? 'page'
      : currentArticle && activeCategoryId === null ? 'true' : undefined,
    categories: Object.freeze(Object.fromEntries(navigation.categories.map((category) => [
      category.id,
      category.id === activeCategoryId ? (path === category.href ? 'page' : 'true') : undefined,
    ]))),
  });
}
