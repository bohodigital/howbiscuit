#!/usr/bin/env node
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { repositoryRoot } from '../data/release-lib.mjs';
import { compileToolPackages, emitToolPackages } from './compiler.mjs';

const [command = 'validate', ...args] = process.argv.slice(2);
const valueFor = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};

if (command === 'validate') {
  const payload = compileToolPackages();
  process.stdout.write(`Validated ${payload.tools.length} governed tool package(s) against runtime and JSON Schema contracts.\n`);
} else if (command === 'compile' || command === 'check') {
  const payload = emitToolPackages({ check: command === 'check' });
  process.stdout.write(`${command === 'check' ? 'Checked' : 'Compiled'} ${payload.tools.length} static-first tool package(s).\n`);
} else if (command === 'list') {
  const payload = compileToolPackages();
  process.stdout.write(`${payload.tools.map((tool) => `${tool.id}\t${tool.publicationStatus}\t${tool.canonicalRoute}\t${tool.title}`).join('\n')}\n`);
} else if (command === 'new') {
  const slug = valueFor('--slug');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug ?? '')) throw new Error('Usage: tool:new -- --slug <slug>');
  const target = path.join(repositoryRoot, 'content', 'tools', slug);
  if (existsSync(target)) throw new Error(`${slug}: tool package already exists`);
  mkdirSync(target, { recursive: false });
  throw new Error(`Created ${path.relative(repositoryRoot, target)}. Add manifest.yaml, tool-definition.json, and content.md from docs/tools/operator-runbook.md before validation.`);
} else if (command === 'retire') {
  const slug = valueFor('--slug');
  if (!slug) throw new Error('Usage: tool:retire -- --slug <slug>');
  throw new Error('Published tool packages are governed content. Retirement requires a reviewed manifest change in a new commit; no in-place retirement bypass is provided.');
} else if (command === 'qa') {
  const payload = emitToolPackages({ check: true });
  for (const tool of payload.tools) {
    if (tool.definition.providerCallsOnPageLoad || tool.definition.transmitsInput) throw new Error(`${tool.id}: unsafe runtime behavior`);
    if (!tool.rows.length) throw new Error(`${tool.id}: substantive static rows required`);
    if (tool.definition.inputs.some(({ options, maximumOptions }) => options.length > maximumOptions)) throw new Error(`${tool.id}: unbounded input`);
    if (tool.noJavaScriptFallback !== 'complete-static-table') throw new Error(`${tool.id}: no-JavaScript fallback missing`);
  }
  process.stdout.write(`Tool QA passed: ${payload.tools.length} public static tools, bounded local inputs, complete tables, zero provider calls.\n`);
} else {
  throw new Error('Usage: cli.mjs validate|compile|check|list|new|retire|qa');
}
