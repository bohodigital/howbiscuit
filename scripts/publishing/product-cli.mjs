import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { loadTypeScriptModule } from '../lib/load-typescript-module.mjs';
import { loadEditorialRecords } from './editorial-records.mjs';
import { createPublicProductCatalog, loadProductRecords, productJsonSchemas } from './product-records.mjs';
import { stableJson } from './stable-json.mjs';

const root = process.cwd();
const [command] = process.argv.slice(2);
if (!['validate', 'compile', 'check'].includes(command)) throw new Error('Usage: product-cli.mjs <validate|compile|check>');
const taxonomy = await loadTypeScriptModule(path.join(root, 'src', 'config', 'public-taxonomy.ts'));
const editorial = await loadEditorialRecords(root, taxonomy);
const products = await loadProductRecords(root, editorial);
const count = ['products', 'productGroups', 'merchantDestinations', 'priceClaims', 'recommendationClaims']
  .reduce((total, kind) => total + products[kind].size, 0);
if (command === 'validate') {
  process.stdout.write(`Validated ${count} product-system record(s); production catalog contains ${products.products.size} product(s).\n`);
  process.exit(0);
}

const output = createPublicProductCatalog(products);
const files = new Map([
  [path.join(root, 'src', 'generated', 'publishing', 'products.v1.json'), stableJson(output)],
  [path.join(root, 'schemas', 'generated', 'product-records-v1.schema.json'), stableJson({ schemaVersion: '1.0.0', records: productJsonSchemas(products.schemas) })],
]);
let changed = false;
for (const [filePath, expected] of files) {
  if (command === 'check') {
    if (!existsSync(filePath) || readFileSync(filePath, 'utf8').replaceAll('\r\n', '\n') !== expected) throw new Error(`${path.relative(root, filePath)}: generated product output is stale`);
  } else {
    mkdirSync(path.dirname(filePath), { recursive: true });
    const current = existsSync(filePath) ? readFileSync(filePath, 'utf8').replaceAll('\r\n', '\n') : null;
    if (current !== expected) {
      writeFileSync(filePath, expected, 'utf8');
      changed = true;
    }
  }
}
process.stdout.write(`${command === 'check' ? 'Checked' : 'Compiled'} ${count} product-system record(s); ${changed ? 'outputs updated' : 'outputs current'}.\n`);
