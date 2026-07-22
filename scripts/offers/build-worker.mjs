import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { build } from 'esbuild';

const output = path.resolve('dist/offers-worker/index.mjs');
await mkdir(path.dirname(output), { recursive: true });

const result = await build({
  entryPoints: ['workers/offers/src/index.mjs'],
  outfile: output,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  sourcemap: false,
  legalComments: 'none',
  metafile: true,
});

const bundle = await readFile(output, 'utf8');
if (/\bnode:/.test(bundle)) throw new Error('Offer Worker bundle contains a Node-only import.');
if (!Object.keys(result.metafile.outputs).some((name) => path.resolve(name) === output)) {
  throw new Error('Offer Worker bundle was not emitted at the governed output path.');
}

console.log(`Offer Worker bundle: ${path.relative(process.cwd(), output)}`);
