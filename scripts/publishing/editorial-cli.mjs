import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { loadTypeScriptModule } from '../lib/load-typescript-module.mjs';
import { editorialJsonSchemas, loadEditorialRecords, scoreIdeas } from './editorial-records.mjs';
import { stableJson } from './stable-json.mjs';

const root = process.cwd();
const [command] = process.argv.slice(2);
if (!['compile', 'check', 'score'].includes(command)) throw new Error('Usage: editorial-cli.mjs <compile|check|score>');
const taxonomy = await loadTypeScriptModule(path.join(root, 'src', 'config', 'public-taxonomy.ts'));
const editorial = await loadEditorialRecords(root, taxonomy);

if (command === 'score') {
  for (const result of scoreIdeas(editorial.ideas)) process.stdout.write(`${result.id}\t${result.totalScore}\n`);
  process.exit(0);
}

const output = {
  schemaVersion: '1.0.0',
  records: Object.fromEntries(['ideas', 'briefs', 'sources', 'testing', 'mediaRights', 'linkPreviews', 'approvals']
    .map((kind) => [kind, [...editorial[kind].values()].sort((a, b) => a.id.localeCompare(b.id, 'en'))])),
};
const files = new Map([
  [path.join(root, 'src', 'generated', 'publishing', 'editorial.v1.json'), stableJson(output)],
  [path.join(root, 'schemas', 'generated', 'editorial-records-v1.schema.json'), stableJson({ schemaVersion: '1.0.0', records: editorialJsonSchemas(editorial.schemas) })],
]);
let changed = false;
for (const [filePath, expected] of files) {
  if (command === 'check') {
    if (!existsSync(filePath) || readFileSync(filePath, 'utf8').replaceAll('\r\n', '\n') !== expected) {
      throw new Error(`${path.relative(root, filePath)}: generated editorial output is stale`);
    }
  } else {
    mkdirSync(path.dirname(filePath), { recursive: true });
    const current = existsSync(filePath) ? readFileSync(filePath, 'utf8').replaceAll('\r\n', '\n') : null;
    if (current !== expected) {
      writeFileSync(filePath, expected, 'utf8');
      changed = true;
    }
  }
}
process.stdout.write(`${command === 'check' ? 'Checked' : 'Compiled'} editorial records; ${changed ? 'outputs updated' : 'outputs current'}.\n`);
