import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import {
  assertFullPagefindLane,
  assertPiPagefindSkipAllowed,
} from './lib/pagefind-platform-policy.mjs';

const root = process.cwd();
const piSkipRequested = process.argv.includes('--pi-pagefind-skip');
const environmentSkipRequested = process.env.HOWBISCUIT_SKIP_PAGEFIND === '1';

function runNode(modulePath, args) {
  const result = spawnSync(process.execPath, [modulePath, ...args], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function collectFiles(directory, predicate) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(fullPath, predicate));
    else if (predicate(fullPath)) files.push(fullPath);
  }
  return files;
}

if (piSkipRequested) {
  if (!environmentSkipRequested) throw new Error('The guarded Pi build requires the wrapper-provided exception flag.');
  const pageSize = Number.parseInt(execFileSync('getconf', ['PAGESIZE'], { encoding: 'utf8' }).trim(), 10);
  assertPiPagefindSkipAllowed({ platform: process.platform, arch: process.arch, pageSize });
} else {
  assertFullPagefindLane({ skipRequested: environmentSkipRequested, lane: 'The normal build' });
}

runNode(path.join(root, 'node_modules', 'astro', 'bin', 'astro.mjs'), ['build']);

const htmlFiles = collectFiles(path.join(root, 'dist'), (filePath) => filePath.endsWith('.html'));
const eligibleHtmlFiles = htmlFiles.filter((filePath) => readFileSync(filePath, 'utf8').includes('data-pagefind-body'));
if (!eligibleHtmlFiles.length) throw new Error('The static artifact contains no Pagefind-eligible HTML pages.');

if (piSkipRequested) {
  console.log('Astro build passed; Pagefind binary execution skipped only for the verified Pi ARM64/16 KiB QA artifact.');
} else {
  runNode(path.join(root, 'node_modules', 'pagefind', 'lib', 'runner', 'bin.cjs'), [
    '--site',
    'dist',
    '--output-subdir',
    'pagefind',
  ]);
  const pagefindRoot = path.join(root, 'dist', 'pagefind');
  const pagefindEntry = path.join(pagefindRoot, 'pagefind.js');
  const fragments = existsSync(path.join(pagefindRoot, 'fragment'))
    ? collectFiles(path.join(pagefindRoot, 'fragment'), (filePath) => filePath.endsWith('.pf_fragment'))
    : [];
  if (!existsSync(pagefindEntry) || fragments.length !== eligibleHtmlFiles.length) {
    throw new Error(`Pagefind artifact mismatch: ${eligibleHtmlFiles.length} eligible HTML pages, ${fragments.length} indexed fragments.`);
  }
  console.log('Astro and Pagefind static build passed.');
}
