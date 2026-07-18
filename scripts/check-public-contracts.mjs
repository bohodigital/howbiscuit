import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadTypeScriptModule } from './lib/load-typescript-module.mjs';
import {
  createPublicDocumentRegistry,
  topicPublicationModeForRegistry,
} from '../src/lib/public-content/model.mjs';
import { discoverTrackedPublicSources } from '../src/lib/public-content/source-adapter.mjs';
import { PHASE_C_DOCUMENT_ROUTES } from '../src/lib/public-content/pagefind-policy.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const taxonomy = await loadTypeScriptModule(path.join(root, 'src', 'config', 'public-taxonomy.ts'));
const sources = discoverTrackedPublicSources(root);
const publicRegistry = createPublicDocumentRegistry({ sources, taxonomy });
const registry = publicRegistry.filter(({ kind }) => kind === 'article');

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

invariant(taxonomy.PUBLIC_CATEGORIES.length === 5, 'Phase C requires exactly five categories.');
invariant(taxonomy.PUBLIC_CATEGORIES.every(({ implemented }) => implemented === true), 'Every Phase C category must be active.');
invariant(taxonomy.PUBLIC_CATEGORIES.flatMap(({ topics }) => topics).every(({ implemented }) => implemented === true), 'Every taxonomy topic must use the active threshold policy.');
invariant(taxonomy.ALL_GUIDES_TARGET.implemented === true && taxonomy.ALL_GUIDES_TARGET.label === 'All Guides', 'All Guides must be active at /articles/.');
invariant(taxonomy.TARGET_ROUTE_CONTRACTS.every(({ implemented }) => implemented === true), 'Every Phase C target route contract must be marked implemented.');
invariant(taxonomy.findTargetRedirectChains().length === 0, 'Phase C redirects must be direct.');
invariant(taxonomy.HOST_CONTRACT.target.implemented === true, 'The source host contract must remain explicit.');
invariant(
  taxonomy.HOST_CONTRACT.sourceDeclared.mechanism === 'sites-worker'
    && taxonomy.HOST_CONTRACT.sourceDeclared.sourcePath === 'scripts/build-static.mjs',
  'The supported Sites Worker must own the source host redirect contract.',
);
invariant(!existsSync(path.join(root, 'src', 'data', 'site-taxonomy.mjs')), 'The legacy navigation taxonomy must be removed.');
invariant(!existsSync(path.join(root, 'src', 'lib', 'public-content', 'classification-manifest.mjs')), 'The temporary classification manifest must be removed.');
invariant(
  JSON.stringify(publicRegistry.map(({ route }) => route)) === JSON.stringify([...PHASE_C_DOCUMENT_ROUTES].sort()),
  'Every Phase C document route must come from the normalized public registry.',
);

const expected = new Map([
  ['/articles/how-does-baking-powder-work/', ['kitchen', 'food-science', 'guide']],
  ['/articles/why-are-some-answers-better-than-others/', [null, null, 'editorial-standard']],
  ['/articles/why-salt-melts-ice/', ['home', 'heating-cooling', 'guide']],
]);
invariant(registry.length === expected.size, 'Exactly three real articles must be normalized.');
for (const record of registry) {
  const classification = expected.get(record.route);
  invariant(classification, `Unexpected article route: ${record.route}`);
  invariant(record.categoryId === classification[0] && record.topicId === classification[1] && record.articleType === classification[2], `Classification mismatch: ${record.route}`);
  invariant(record.provenance.categoryId === 'canonical-source-metadata', `Classification is not source-owned: ${record.route}`);
  invariant(record.answerSummary.length >= 40, `Direct answer is missing: ${record.route}`);
  invariant(record.sourceNotes.state === 'structured' && record.sourceNotes.items.length > 0, `Structured sources are missing: ${record.route}`);
  invariant(record.relatedContent.state === 'structured', `Structured related routes are missing: ${record.route}`);
  invariant(record.disclosure.state === 'no-paid-links', `Paid-link state is missing: ${record.route}`);
}

const topicModes = Object.fromEntries(taxonomy.PUBLIC_CATEGORIES.flatMap((category) => category.topics.map((topic) => [
  `${category.id}/${topic.id}`,
  topicPublicationModeForRegistry({ registry, categoryId: category.id, topicId: topic.id, taxonomy }),
])));
invariant(topicModes['home/heating-cooling'] === 'filter', 'Salt must activate the Home heating/cooling category filter.');
invariant(topicModes['kitchen/food-science'] === 'filter', 'Baking powder must activate the Kitchen food-science category filter.');
invariant(Object.entries(topicModes).every(([ref, mode]) => ['home/heating-cooling', 'kitchen/food-science'].includes(ref) ? mode === 'filter' : mode === 'hidden'), 'Zero-guide topics must remain hidden.');

const redirectLines = readFileSync(path.join(root, 'public', '_redirects'), 'utf8').trim().split(/\r?\n/).filter(Boolean);
const expectedRedirectLines = [
  '/make-do/ /home/ 301',
  '/cook/ /kitchen/ 301',
  '/buying-guides/ /shop/ 301',
  '/research-writing/ /editorial-policy/ 301',
  '/home-tech/gaming-pcs/ /home-tech/ 301',
  '/home-tech/laptops/ /home-tech/ 301',
  '/home-tech/streaming-tvs/ /home-tech/ 301',
  '/home-tech/wifi-routers/ /home-tech/ 301',
  '/home-tech/smart-home/ /home-tech/ 301',
  '/home-tech/privacy-security/ /home-tech/ 301',
  '/cooking/* /kitchen/ 301',
  '/make-do-lab/* /home/ 301',
];
invariant(JSON.stringify(redirectLines) === JSON.stringify(expectedRedirectLines), 'The deployed redirect matrix differs from the exact Phase C contract.');
const redirectSource = readFileSync(path.join(root, 'public', '_redirects'), 'utf8');
const redirectRules = taxonomy.parseSitesRedirectRules(redirectSource);
const exactTargets = new Map(redirectLines.flatMap((line) => {
  const [from, to] = line.split(/\s+/);
  return from.startsWith('/') && !from.includes('*') ? [[from, to]] : [];
}));
for (const [from, to] of exactTargets) {
  invariant(!exactTargets.has(to), `The deployed redirect matrix contains a chain: ${from} -> ${to}.`);
}

const workerSource = taxonomy.buildSitesWorkerSource(redirectSource);
const workerModule = await import(`data:text/javascript;base64,${Buffer.from(workerSource).toString('base64')}`);
const assetRequests = [];
const workerEnv = {
  ASSETS: {
    fetch(request) {
      assetRequests.push(request.url);
      return new Response('asset', { status: 200 });
    },
  },
};
async function assertSingleHop(requestUrl, expectedLocation) {
  const response = await workerModule.default.fetch(new Request(requestUrl), workerEnv);
  invariant(response.status === 301, `${requestUrl} must return 301.`);
  invariant(response.headers.get('location') === expectedLocation, `${requestUrl} returned the wrong Location header.`);
  const follow = await workerModule.default.fetch(new Request(expectedLocation), workerEnv);
  invariant(follow.status === 200 && follow.headers.get('location') === null, `${requestUrl} must reach static assets after one redirect.`);
}
for (const { from, to } of redirectRules) {
  const sourcePath = from.replace('*', 'contract-probe/');
  await assertSingleHop(`https://howbiscuit.com${sourcePath}?ref=contract`, `https://howbiscuit.com${to}?ref=contract`);
  await assertSingleHop(`https://www.howbiscuit.com${sourcePath}?ref=contract`, `https://howbiscuit.com${to}?ref=contract`);
}
await assertSingleHop(
  'https://www.howbiscuit.com/articles/?ref=contract',
  'https://howbiscuit.com/articles/?ref=contract',
);
await assertSingleHop(
  'https://preview.example.test/make-do/?ref=contract',
  'https://preview.example.test/home/?ref=contract',
);
const ordinaryResponse = await workerModule.default.fetch(
  new Request('https://howbiscuit.com/articles/?ref=contract'),
  workerEnv,
);
invariant(ordinaryResponse.status === 200 && ordinaryResponse.headers.get('location') === null, 'A current apex route must delegate without redirecting.');
invariant(assetRequests.includes('https://howbiscuit.com/articles/?ref=contract'), 'The Sites worker did not delegate a current route to static assets.');

console.log(JSON.stringify({
  contractVersion: taxonomy.PUBLIC_TAXONOMY_CONTRACT_VERSION,
  documentRoutes: PHASE_C_DOCUMENT_ROUTES.length,
  normalizedDocuments: publicRegistry.length,
  categories: taxonomy.PUBLIC_CATEGORIES.length,
  articles: registry.length,
  topicModes,
  redirectChains: 0,
  workerRedirectRules: redirectRules.length,
  workerHostCanonicalization: 'www-to-apex',
  classifications: 'canonical-source-metadata',
}, null, 2));
