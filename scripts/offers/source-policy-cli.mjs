#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { compileSourcePolicies } from '../../src/lib/offers/source-policy-compiler.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const [command, ...rest] = process.argv.slice(2);
if (command !== 'check' || rest.length > 0) throw new Error('Usage: source-policy-cli.mjs check');
const compiled = compileSourcePolicies(root);
process.stdout.write(`Source-policy check passed: ${compiled.policies.length} policies.\n`);
