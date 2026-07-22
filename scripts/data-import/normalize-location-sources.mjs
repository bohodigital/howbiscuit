#!/usr/bin/env node
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { buildNormalizedLocationArtifacts } from '../../src/lib/location/source-normalizer.mjs';

function argumentsFrom(argv) {
  const options = { check: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--check') options.check = true;
    else if (['--census-raw', '--hud-county-raw', '--hud-cbsa-raw', '--census-vintage', '--hud-vintage', '--retrieved-at', '--out-dir'].includes(value)) options[value.slice(2)] = argv[++index];
    else throw new Error(`Unknown argument: ${value}`);
  }
  for (const key of ['census-raw', 'hud-county-raw', 'hud-cbsa-raw', 'census-vintage', 'hud-vintage', 'retrieved-at']) if (!options[key]) throw new Error(`--${key} is required.`);
  if (!options.check && !options['out-dir']) throw new Error('--out-dir is required unless --check is used.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options['retrieved-at'])) throw new Error('--retrieved-at must be YYYY-MM-DD.');
  return options;
}
function safeRead(file) {
  const resolved = path.resolve(file);
  const stat = lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128 * 1024 * 1024) throw new Error(`${file}: unsafe raw artifact.`);
  return readFileSync(resolved);
}

const options = argumentsFrom(process.argv.slice(2));
const artifacts = buildNormalizedLocationArtifacts({
  censusRaw: safeRead(options['census-raw']), hudCountyRaw: safeRead(options['hud-county-raw']), hudCbsaRaw: safeRead(options['hud-cbsa-raw']),
  censusVintage: options['census-vintage'], hudVintage: options['hud-vintage'], retrievedAt: options['retrieved-at'],
});
if (options.check) {
  process.stdout.write(`Location source normalization check passed: ${artifacts.censusManifest.rowCounts.accepted} Census row(s), ${artifacts.hudManifest.rowCounts.accepted} HUD row(s).\n`);
} else {
  const outputDirectory = path.resolve(options['out-dir']);
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(path.join(outputDirectory, 'census-normalized.json'), artifacts.censusBytes, { flag: 'wx' });
  writeFileSync(path.join(outputDirectory, 'census-manifest.json'), `${JSON.stringify(artifacts.censusManifest, null, 2)}\n`, { flag: 'wx' });
  writeFileSync(path.join(outputDirectory, 'hud-normalized.json'), artifacts.hudBytes, { flag: 'wx' });
  writeFileSync(path.join(outputDirectory, 'hud-manifest.json'), `${JSON.stringify(artifacts.hudManifest, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`Wrote four provenance-bound artifacts to ${outputDirectory}.\n`);
}
