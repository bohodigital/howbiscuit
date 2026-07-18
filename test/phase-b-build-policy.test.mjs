import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertFullPagefindLane,
  assertPiPagefindSkipAllowed,
  REQUIRED_PI_PAGE_SIZE,
} from '../scripts/lib/pagefind-platform-policy.mjs';
import { loadTypeScriptModule } from '../scripts/lib/load-typescript-module.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const taxonomy = await loadTypeScriptModule(path.join(root, 'src/config/public-taxonomy.ts'));

test('Phase C declares every active build integration as a direct dependency', () => {
  for (const dependency of ['@astrojs/mdx', '@astrojs/rss', 'pagefind']) {
    assert.ok(Object.hasOwn(packageJson.dependencies, dependency), `${dependency} must be a direct dependency`);
  }
  assert.equal(Object.hasOwn(packageJson.dependencies, '@astrojs/sitemap'), false);
});

test('normal build and QA lanes run the explicit Pagefind build and reject skip leakage', () => {
  assert.match(packageJson.scripts.build, /scripts\/build-static\.mjs/);
  assert.match(packageJson.scripts.test, /npm run build/);
  assert.match(packageJson.scripts.qa, /npm run test/);
  assert.doesNotMatch(packageJson.scripts.qa, /astro build/);
  const buildScript = readFileSync(path.join(root, 'scripts', 'build-static.mjs'), 'utf8');
  assert.match(buildScript, /data-pagefind-body/);
  assert.match(buildScript, /\.pf_fragment/);
  assert.match(buildScript, /pagefindUrlFromFragment/);
  assert.match(buildScript, /assertSetsEqual\(eligibleRoutes, indexedRoutes/);
  assert.match(packageJson.scripts['build:sites'], /--verify-sites-package/);
  assert.match(
    packageJson.scripts['build:sites'],
    /prepare-sites-build\.mjs.*--finalize-sites-package.*--verify-sites-package/,
  );
  assert.match(buildScript, /sitemap route set/);
  assert.match(buildScript, /llms\.txt/);

  assert.doesNotThrow(() => assertFullPagefindLane({ skipRequested: false, lane: 'build' }));
  assert.throws(
    () => assertFullPagefindLane({ skipRequested: true, lane: 'build' }),
    /may not skip Pagefind/i,
  );
});

test('the Pagefind skip is restricted to Linux ARM64 with a 16 KiB page size', () => {
  assert.equal(REQUIRED_PI_PAGE_SIZE, 16384);
  assert.doesNotThrow(() => assertPiPagefindSkipAllowed({
    platform: 'linux',
    arch: 'arm64',
    pageSize: 16384,
  }));
  for (const candidate of [
    { platform: 'win32', arch: 'x64', pageSize: 4096 },
    { platform: 'linux', arch: 'x64', pageSize: 4096 },
    { platform: 'linux', arch: 'arm64', pageSize: 4096 },
  ]) {
    assert.throws(() => assertPiPagefindSkipAllowed(candidate), /Linux ARM64.*16384/i);
  }
});

test('the Sites worker owns host and legacy redirects before delegating static assets', async () => {
  const redirectSource = readFileSync(path.join(root, 'public', '_redirects'), 'utf8');
  const rules = taxonomy.parseSitesRedirectRules(redirectSource);
  assert.throws(
    () => taxonomy.parseSitesRedirectRules('https://www.howbiscuit.com/* /home/ 301'),
    /root-relative path/i,
  );
  assert.throws(
    () => taxonomy.parseSitesRedirectRules('/legacy/:splat /home/ 301'),
    /root-relative path/i,
  );
  assert.throws(
    () => taxonomy.parseSitesRedirectRules('/legacy/* /home/:splat 301'),
    /fixed root-relative destination/i,
  );
  assert.throws(
    () => taxonomy.parseSitesRedirectRules('/legacy/* /home/ 302'),
    /permanent 301/i,
  );
  const workerSource = taxonomy.buildSitesWorkerSource(redirectSource);
  const workerModule = await import(`data:text/javascript;base64,${Buffer.from(workerSource).toString('base64')}`);
  const assetRequests = [];
  const env = {
    ASSETS: {
      fetch(request) {
        assetRequests.push(request.url);
        return new Response('asset', { status: 200 });
      },
    },
  };

  async function assertSingleHop(requestUrl, expectedLocation) {
    const response = await workerModule.default.fetch(new Request(requestUrl), env);
    assert.equal(response.status, 301, requestUrl);
    assert.equal(response.headers.get('location'), expectedLocation, requestUrl);
    const follow = await workerModule.default.fetch(new Request(expectedLocation), env);
    assert.equal(follow.status, 200, `${requestUrl} must reach an asset after one redirect`);
    assert.equal(follow.headers.get('location'), null, `${requestUrl} must not redirect twice`);
  }

  assert.equal(rules.length, 12);
  for (const { from, to } of rules) {
    const sourcePath = from.replace('*', 'contract-probe/');
    await assertSingleHop(
      `https://howbiscuit.com${sourcePath}?ref=phase-c`,
      `https://howbiscuit.com${to}?ref=phase-c`,
    );
    await assertSingleHop(
      `https://www.howbiscuit.com${sourcePath}?ref=phase-c`,
      `https://howbiscuit.com${to}?ref=phase-c`,
    );
  }

  await assertSingleHop(
    'https://www.howbiscuit.com/articles/?ref=phase-c',
    'https://howbiscuit.com/articles/?ref=phase-c',
  );
  await assertSingleHop(
    'https://preview.example.test/make-do/?ref=phase-c',
    'https://preview.example.test/home/?ref=phase-c',
  );

  const ordinary = await workerModule.default.fetch(
    new Request('https://howbiscuit.com/articles/?ref=phase-c'),
    env,
  );
  assert.equal(ordinary.status, 200);
  assert.equal(ordinary.headers.get('location'), null);
  assert.ok(assetRequests.includes('https://howbiscuit.com/articles/?ref=phase-c'));
});
