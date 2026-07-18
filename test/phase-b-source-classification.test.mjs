import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { discoverTrackedArticleSources } from '../src/lib/public-content/source-adapter.mjs';
import { ACCEPTED_LATEX_CLASSIFICATION_ROUTES } from '../src/lib/public-content/latex-classification-bridge.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sources = discoverTrackedArticleSources(root);

test('accepted classifications are source-owned except for the exact Phase B LaTeX bridge', () => {
  assert.equal(existsSync(path.join(root, 'src', 'lib', 'public-content', 'classification-manifest.mjs')), false);
  assert.deepEqual(ACCEPTED_LATEX_CLASSIFICATION_ROUTES, ['/articles/why-salt-melts-ice/']);
  assert.deepEqual(Object.fromEntries(sources.map((source) => [source.route, {
    categoryId: source.categoryId,
    topicId: source.topicId,
    articleType: source.articleType,
    editorialClassification: source.editorialClassification,
    editorialPriority: source.editorialPriority,
  }])), {
    '/articles/how-does-baking-powder-work/': {
      categoryId: 'kitchen',
      topicId: 'food-science',
      articleType: 'guide',
      editorialClassification: 'not-separately-declared',
      editorialPriority: 0,
    },
    '/articles/why-are-some-answers-better-than-others/': {
      categoryId: null,
      topicId: null,
      articleType: 'editorial-standard',
      editorialClassification: 'editorial-standard',
      editorialPriority: 0,
    },
    '/articles/why-salt-melts-ice/': {
      categoryId: 'home',
      topicId: 'heating-cooling',
      articleType: 'guide',
      editorialClassification: 'not-separately-declared',
      editorialPriority: 0,
    },
  });
  assert.deepEqual(sources.filter(({ sourceKind }) => sourceKind === 'latex').map(({ route }) => route), ACCEPTED_LATEX_CLASSIFICATION_ROUTES);
});
