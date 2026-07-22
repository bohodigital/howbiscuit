#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const database = new DatabaseSync(':memory:');
database.exec(readFileSync(path.join(root, 'drizzle', '0001_h3_offer_foundation.sql'), 'utf8'));
const { count } = database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get();
if (count !== 19) throw new Error(`Expected 19 Handoff 3 runtime tables, found ${count}.`);
database.close();
process.stdout.write(`D1 migration check passed: ${count} runtime tables.\n`);
