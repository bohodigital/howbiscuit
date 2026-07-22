#!/usr/bin/env node
import { readFileSync, lstatSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { compileLocationProfiles, validateDatasetArtifact } from '../../src/lib/location/compiler.mjs';

function parseArguments(argv) {
  const options = { check: false, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--check') options.check = true;
    else if (value === '--dry-run') options.dryRun = true;
    else if (['--census', '--census-manifest', '--hud', '--hud-manifest', '--metros'].includes(value)) options[value.slice(2)] = argv[++index];
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!options.check && !options.dryRun) throw new Error('Use --check or --dry-run; D1 mutation belongs to the authenticated importer.');
  for (const key of ['census', 'census-manifest', 'hud', 'hud-manifest', 'metros']) if (!options[key]) throw new Error(`--${key} is required.`);
  return options;
}
function safeRead(file) {
  const resolved = path.resolve(file);
  const stat = lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024 * 1024) throw new Error(`${file}: unsafe import artifact.`);
  return readFileSync(resolved);
}

const options = parseArguments(process.argv.slice(2));
const censusBytes = safeRead(options.census);
const hudBytes = safeRead(options.hud);
const censusManifest = validateDatasetArtifact(JSON.parse(safeRead(options['census-manifest'])), censusBytes);
const hudManifest = validateDatasetArtifact(JSON.parse(safeRead(options['hud-manifest'])), hudBytes);
const census = JSON.parse(censusBytes);
const hud = JSON.parse(hudBytes);
const metroProfiles = JSON.parse(safeRead(options.metros));
const compiled = compileLocationProfiles({ censusManifest, hudManifest, zctaRows: census.zctaRows, countyRows: hud.countyRows, cbsaRows: hud.cbsaRows, metroProfiles });
if (options.dryRun) process.stdout.write(`${JSON.stringify(compiled, null, 2)}\n`);
else process.stdout.write(`Location import check passed: ${compiled.profiles.length} ZIP profile(s), ${compiled.metroProfiles.length} metro profile(s).\n`);
