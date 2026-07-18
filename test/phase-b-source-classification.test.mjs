import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { discoverTrackedArticleSources } from '../src/lib/public-content/source-adapter.mjs';
import { ARTICLE_CLASSIFICATION_MANIFEST } from '../src/lib/public-content/classification-manifest.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sources = discoverTrackedArticleSources(root);

test('the exact accepted Phase A classification manifest remains until Phase C can edit content paths', () => {
  assert.deepEqual(Object.keys(ARTICLE_CLASSIFICATION_MANIFEST).sort(), sources.map(({ route }) => route).sort());
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
  assert.ok(sources.every(({ classificationProvenance }) => classificationProvenance === 'accepted-phase-a-manifest'));
});
