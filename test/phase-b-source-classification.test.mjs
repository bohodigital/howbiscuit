import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadTypeScriptModule } from '../scripts/lib/load-typescript-module.mjs';
import { discoverTrackedArticleSources } from '../src/lib/public-content/source-adapter.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const taxonomy = await loadTypeScriptModule(path.join(root, 'src', 'config', 'public-taxonomy.ts'));
const sources = discoverTrackedArticleSources(root, { taxonomy });

test('Phase C classifications and global article-service metadata are source-owned', () => {
  assert.equal(existsSync(path.join(root, 'src/lib/public-content/classification-manifest.mjs')), false);
  assert.deepEqual(Object.fromEntries(sources.map((source) => [source.route, [
    source.categoryId,
    source.topicId,
    source.articleType,
    source.editorialPriority,
  ]])), {
    '/articles/how-does-baking-powder-work/': ['kitchen', 'food-science', 'guide', 20],
    '/articles/why-are-some-answers-better-than-others/': [null, null, 'editorial-standard', 10],
    '/articles/why-salt-melts-ice/': ['home', 'heating-cooling', 'guide', 30],
  });
  assert.deepEqual(Object.fromEntries(sources.map(({ route, classificationProvenance }) => [route, classificationProvenance])), {
    '/articles/how-does-baking-powder-work/': 'normalized-article-package',
    '/articles/why-are-some-answers-better-than-others/': 'normalized-article-package',
    '/articles/why-salt-melts-ice/': 'normalized-article-package',
  });
  assert.ok(sources.every(({ answerSummary, sourceNotes, relatedContent, disclosure, testing }) => (
    answerSummary.length >= 40
    && sourceNotes.state === 'structured'
    && sourceNotes.items.length > 0
    && relatedContent.state === 'structured'
    && disclosure.state === 'no-paid-links'
    && testing.state
  )));
});
