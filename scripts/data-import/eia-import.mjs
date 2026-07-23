import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { compileEiaRegionalTrends, renderEiaRegionalTrendSvg } from '../../src/lib/fuel/eia.mjs';

const root = process.cwd();
const check = process.argv.slice(2).includes('--check');
const inputPath = path.join(root, 'data', 'eia', 'weekly-regular-gasoline-2026-07-20.json');
const jsonPath = path.join(root, 'src', 'generated', 'fuel', 'eia-regional-trends.v1.json');
const svgPath = path.join(root, 'src', 'generated', 'fuel', 'eia-regional-trends.v1.svg');
const input = JSON.parse(readFileSync(inputPath, 'utf8'));
const compiled = compileEiaRegionalTrends(input);
const expected = new Map([
  [jsonPath, `${JSON.stringify(compiled, null, 2)}\n`],
  [svgPath, renderEiaRegionalTrendSvg(input)],
]);

if (check) {
  for (const [filePath, contents] of expected) {
    if (readFileSync(filePath, 'utf8').replaceAll('\r\n', '\n') !== contents) throw new Error(`${path.relative(root, filePath)}: generated EIA output is stale`);
  }
  console.log(`EIA regional benchmark check passed: ${compiled.series.length} aggregate series through ${compiled.series[0].values.at(-1).period}.`);
} else {
  for (const [filePath, contents] of expected) {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents, 'utf8');
  }
  console.log(`EIA regional benchmark compiled: ${compiled.series.length} aggregate series through ${compiled.series[0].values.at(-1).period}.`);
}
