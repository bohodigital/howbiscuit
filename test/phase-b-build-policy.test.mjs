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

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

test('Phase B declares every build integration as a direct dependency', () => {
  for (const dependency of ['@astrojs/mdx', '@astrojs/sitemap', 'pagefind']) {
    assert.ok(Object.hasOwn(packageJson.dependencies, dependency), `${dependency} must be a direct dependency`);
  }
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
