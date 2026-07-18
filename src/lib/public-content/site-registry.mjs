import * as taxonomy from '../../config/public-taxonomy.ts';
import { buildPublicNavigation } from '../navigation/public-navigation.mjs';
import { createPublicContentRegistry } from './model.mjs';
import { discoverTrackedArticleSources } from './source-adapter.mjs';

let cachedRoot;
let cachedValue;

export function getPublicSiteData(root = process.cwd()) {
  if (cachedValue && cachedRoot === root) return cachedValue;
  const registry = createPublicContentRegistry({
    sources: discoverTrackedArticleSources(root),
    taxonomy,
  });
  cachedRoot = root;
  cachedValue = Object.freeze({
    taxonomy,
    registry,
    navigation: buildPublicNavigation({ taxonomy, registry }),
  });
  return cachedValue;
}
