import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  compileDirectiveLine,
  validateMarkdown,
  validateResearchDirectives,
} from '../scripts/publishing/article-compiler.mjs';

const fixture = readFileSync(new URL('./fixtures/publishing/research-rendering.md', import.meta.url), 'utf8');
const manifest = {
  sourceIds: [],
  researchPacketIds: ['electricity-il-vs-us'],
  productIds: [],
  destinationIds: [],
  productGroupIds: [],
  mediaIds: [],
  linkPreviewIds: [],
  priceClaims: [],
  presentationBlocks: [],
};

test('governed research fixture validates and compiles all four static render modes', () => {
  const analysis = validateMarkdown(fixture, manifest, 'research-rendering.md');
  assert.equal(analysis.directives.length, 4);
  assert.equal(validateResearchDirectives(analysis.directives, manifest, 'research-rendering.md'), true);
  const output = fixture.split('\n').map((line) => compileDirectiveLine(line)).join('\n');
  assert.match(output, /<ResearchBlock kind="summary" packetId="electricity-il-vs-us" \/>/);
  assert.match(output, /<ResearchBlock kind="table" packetId="electricity-il-vs-us" blockId="evidence" \/>/);
  assert.match(output, /<ResearchBlock kind="chart" packetId="electricity-il-vs-us" blockId="trend" \/>/);
  assert.match(output, /<ResearchBlock kind="source-note" packetId="electricity-il-vs-us" \/>/);
});

test('research renderer rejects a missing table or unsupported packet claim', () => {
  const bad = validateMarkdown('::research-table{packet="electricity-il-vs-us" table="missing"}', manifest, 'bad-research.md');
  assert.throws(() => validateResearchDirectives(bad.directives, manifest, 'bad-research.md'), /missing research table/);
});
