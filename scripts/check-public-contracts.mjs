import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadTypeScriptModule } from './lib/load-typescript-module.mjs';
import {
  createPublicContentRegistry,
  topicPublicationModeForRegistry,
} from '../src/lib/public-content/model.mjs';
import { discoverTrackedArticleSources } from '../src/lib/public-content/source-adapter.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const taxonomy = await loadTypeScriptModule(path.join(root, 'src', 'config', 'public-taxonomy.ts'));
const sources = discoverTrackedArticleSources(root);
const registry = createPublicContentRegistry({
  sources,
  taxonomy,
});

if (taxonomy.PUBLIC_CATEGORIES.length !== 5) {
  throw new Error(`Expected five target categories, found ${taxonomy.PUBLIC_CATEGORIES.length}.`);
}
if (taxonomy.TARGET_ROUTE_CONTRACTS.some(({ implemented }) => implemented !== false)) {
  throw new Error('Every Phase A target route must remain explicitly unimplemented.');
}
const redirectChains = taxonomy.findTargetRedirectChains();
if (redirectChains.length) {
  throw new Error(`Target redirect chains found: ${JSON.stringify(redirectChains)}`);
}

const targetTopicModes = Object.fromEntries(taxonomy.PUBLIC_CATEGORIES.flatMap((category) => (
  category.topics.map((topic) => [
    `${category.id}/${topic.id}`,
    topicPublicationModeForRegistry({
      registry,
      categoryId: category.id,
      topicId: topic.id,
      taxonomy,
    }),
  ])
)));

console.log(JSON.stringify({
  contractVersion: taxonomy.PUBLIC_TAXONOMY_CONTRACT_VERSION,
  targetCategoryCount: taxonomy.PUBLIC_CATEGORIES.length,
  targetTopicCount: Object.keys(targetTopicModes).length,
  discoveredArticleRoutes: registry.map(({ route }) => route),
  targetTopicModes,
  targetRoutesImplemented: false,
  redirectChains: 0,
}, null, 2));
