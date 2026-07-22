#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { buildCatalogProjection } from '../../src/lib/offers/catalog-projection.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function parseArguments(argv) {
  const parsed = { check: false, dryRun: false, commit: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--check') parsed.check = true;
    else if (argument === '--dry-run') parsed.dryRun = true;
    else if (argument === '--commit') parsed.commit = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!parsed.commit) throw new Error('--commit <sha-or-ref> is required.');
  if (!parsed.check && !parsed.dryRun) throw new Error('Use --check or --dry-run. D1 mutation is available only through the authenticated operational runner.');
  return parsed;
}

function resolveCommit(value) {
  return execFileSync('git', ['rev-parse', '--verify', `${value}^{commit}`], { cwd: root, encoding: 'utf8' }).trim();
}

const options = parseArguments(process.argv.slice(2));
const sourceCommit = resolveCommit(options.commit);
const catalog = JSON.parse(execFileSync('git', ['show', `${sourceCommit}:src/generated/publishing/products.v1.json`], { cwd: root, encoding: 'utf8' }));
const projection = buildCatalogProjection(catalog, { sourceCommit, syncedAt: '1970-01-01T00:00:00.000Z' });

if (options.dryRun) process.stdout.write(`${JSON.stringify(projection, null, 2)}\n`);
else process.stdout.write(`Catalog projection check passed: ${projection.rows.length} products, digest ${projection.catalogIdentityDigest}.\n`);
