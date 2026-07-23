import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { build } from 'esbuild';

const outputDirectory = path.resolve('dist/h3-workers');
await mkdir(outputDirectory, { recursive: true });

const result = await build({
  entryPoints: {
    offers: 'workers/offers/src/index.mjs',
    location: 'workers/location/src/index.mjs',
    events: 'workers/events/src/index.mjs',
    gas: 'workers/gas/src/index.mjs',
  },
  outdir: outputDirectory,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  sourcemap: false,
  legalComments: 'none',
  metafile: true,
});

for (const worker of ['offers', 'location', 'events', 'gas']) {
  const output = path.join(outputDirectory, `${worker}.js`);
  const bundle = await readFile(output, 'utf8');
  if (/\bnode:/.test(bundle)) throw new Error(`${worker} Worker bundle contains a Node-only import.`);
  if (!Object.keys(result.metafile.outputs).some((name) => path.resolve(name) === output)) {
    throw new Error(`${worker} Worker bundle was not emitted at the governed output path.`);
  }
}

console.log(`Handoff 3 Worker bundles: ${path.relative(process.cwd(), outputDirectory)}`);
