import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import semver from 'semver';

import {
  assertSupportedNodeVersion,
  SUPPORTED_NODE_RANGE,
} from '../scripts/check-node-version.mjs';
import {
  assertFullPagefindLane,
  assertPiPagefindSkipAllowed,
  REQUIRED_PI_PAGE_SIZE,
} from '../scripts/lib/pagefind-platform-policy.mjs';
import { loadTypeScriptModule } from '../scripts/lib/load-typescript-module.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const packageLock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const taxonomy = await loadTypeScriptModule(path.join(root, 'src/config/public-taxonomy.ts'));

test('Phase C declares every active build integration as a direct dependency', () => {
  for (const dependency of ['@astrojs/mdx', '@astrojs/rss', 'pagefind']) {
    assert.ok(Object.hasOwn(packageJson.dependencies, dependency), `${dependency} must be a direct dependency`);
  }
  assert.equal(packageJson.dependencies.astro, '6.4.6');
  assert.equal(packageLock.packages['node_modules/astro'].version, '6.4.6');
  assert.equal(Object.hasOwn(packageJson.dependencies, '@astrojs/sitemap'), false);
});

test('the declared Node ranges match the default native TypeScript-loading contract', () => {
  const expectedRange = '^22.18.0 || ^24.0.0';

  assert.equal(packageJson.engines.node, expectedRange);
  assert.equal(SUPPORTED_NODE_RANGE, expectedRange);
  assert.equal(packageLock.packages[''].engines.node, packageJson.engines.node);
  assert.equal(packageJson.dependencies.semver, '7.8.5');
  assert.equal(packageLock.packages[''].dependencies.semver, packageJson.dependencies.semver);
  assert.equal(packageLock.packages['node_modules/semver'].version, packageJson.dependencies.semver);
  assert.equal(Object.hasOwn(packageJson.devDependencies ?? {}, 'semver'), false);
  assert.doesNotMatch(packageJson.scripts.test, /experimental-strip-types/);
  assert.deepEqual(
    Object.fromEntries(
      ['22.17.99', '22.18.0', '22.99.0', '23.0.0', '23.99.0', '24.0.0', '24.99.0', '25.0.0', '26.0.0'].map(
        (version) => [version, semver.satisfies(version, expectedRange)],
      ),
    ),
    {
      '22.17.99': false,
      '22.18.0': true,
      '22.99.0': true,
      '23.0.0': false,
      '23.99.0': false,
      '24.0.0': true,
      '24.99.0': true,
      '25.0.0': false,
      '26.0.0': false,
    },
  );
  for (const version of ['22.18.0', '22.99.0', '24.0.0', '24.99.0']) {
    assert.equal(assertSupportedNodeVersion(version), version);
  }
  for (const version of ['22.17.99', '23.0.0', '23.99.0', '25.0.0', '26.0.0']) {
    assert.throws(() => assertSupportedNodeVersion(version), /Unsupported Node\.js/);
  }
  assert.equal(packageJson.scripts.preinstall, 'node scripts/check-node-version.mjs');
  for (const scriptName of [
    'latex:compile',
    'latex:check',
    'contracts:check',
    'typecheck:contracts',
    'dev',
    'build',
    'build:sites',
    'preview',
    'check',
    'test',
    'lint:content',
    'qa',
    'qa:pi',
    'qa:pi:inner',
  ]) {
    assert.match(packageJson.scripts[scriptName], /^npm run runtime:check && /, `${scriptName} must fail closed first`);
  }
  assert.doesNotThrow(() => execFileSync(process.execPath, [path.join(root, 'scripts', 'check-node-version.mjs')], {
    cwd: root,
    stdio: 'pipe',
  }));
});

test('normal build and QA lanes run the explicit Pagefind build and reject skip leakage', () => {
  assert.match(packageJson.scripts.build, /scripts\/build-static\.mjs/);
  assert.match(packageJson.scripts.test, /npm run build/);
  assert.match(packageJson.scripts.qa, /npm run test/);
  assert.doesNotMatch(packageJson.scripts.qa, /astro build/);
  const buildScript = readFileSync(path.join(root, 'scripts', 'build-static.mjs'), 'utf8');
  assert.match(buildScript, /data-pagefind-body/);
  assert.match(buildScript, /\.pf_fragment/);
  assert.match(buildScript, /pagefindPayloadFromFragment/);
  assert.match(buildScript, /assertSetsEqual\(eligibleRoutes, indexedRoutes/);
  assert.match(buildScript, /Pagefind category filter differs/);
  assert.match(buildScript, /Pagefind type filter differs/);
  assert.match(buildScript, /Pagefind \$\{name\} metadata differs/);
  assert.match(packageJson.scripts['build:sites'], /--verify-sites-package/);
  assert.match(
    packageJson.scripts['build:sites'],
    /prepare-sites-build\.mjs.*--finalize-sites-package.*--verify-sites-package/,
  );
  assert.match(buildScript, /sitemap route set/);
  assert.match(buildScript, /assertSetsEqual\(new Set\(articleRoutes\), feedRoutes/);
  assert.match(buildScript, /assertSetsEqual\(expectedEligibleRoutes, llmsRoutes/);
  assert.match(buildScript, /_headers differs byte-for-byte/);
  assert.match(buildScript, /writeProductionPagesWorker/);
  assert.match(buildScript, /_worker\.js/);
  assert.match(buildScript, /production Cloudflare Pages Worker/);
  assert.match(buildScript, /must not expose the production _worker\.js as a client asset/);

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

test('the production Pages and Sites worker owns host and legacy redirects before delegating static assets', async () => {
  const redirectSource = readFileSync(path.join(root, 'public', '_redirects'), 'utf8');
  const headerSource = readFileSync(path.join(root, 'public', '_headers'), 'utf8');
  const rules = taxonomy.parseSitesRedirectRules(redirectSource);
  const securityHeaders = taxonomy.parseWorkerSecurityHeaders(headerSource);
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
  assert.deepEqual(securityHeaders, [
    { name: 'X-Content-Type-Options', value: 'nosniff' },
    { name: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { name: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ]);
  assert.throws(() => taxonomy.parseWorkerSecurityHeaders('/private/*\n  X-Test: value'), /one global/);
  assert.throws(() => taxonomy.parseWorkerSecurityHeaders('/*\nX-Test: value'), /indented/);
  assert.throws(() => taxonomy.parseWorkerSecurityHeaders('/*\n  X-Test: one\n  x-test: two'), /duplicated/);
  const workerSource = taxonomy.buildSitesWorkerSource(redirectSource, headerSource);
  assert.equal(readFileSync(path.join(root, 'dist', '_worker.js'), 'utf8'), workerSource);
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
    for (const { name, value } of securityHeaders) assert.equal(response.headers.get(name), value, `${requestUrl} ${name}`);
    const follow = await workerModule.default.fetch(new Request(expectedLocation), env);
    assert.equal(follow.status, 200, `${requestUrl} must reach an asset after one redirect`);
    assert.equal(follow.headers.get('location'), null, `${requestUrl} must not redirect twice`);
    for (const { name, value } of securityHeaders) assert.equal(follow.headers.get(name), value, `${expectedLocation} ${name}`);
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
