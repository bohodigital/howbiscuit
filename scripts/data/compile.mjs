#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  digest,
  readAcceptedPointer,
  repositoryRoot,
  stableJson,
  validateRelease,
} from './release-lib.mjs';

const check = process.argv.includes('--check');
const accepted = readAcceptedPointer();
const { manifest, datasets, packets } = validateRelease(accepted.releaseId, { requireAccepted: true });
const generatedRoot = path.join(repositoryRoot, 'src', 'generated', 'data');
const packetRoot = path.join(repositoryRoot, 'docs', 'research', 'packets');
const sourceMetadata = Object.fromEntries(manifest.sources.map((source) => {
  const envelope = JSON.parse(readFileSync(path.join(repositoryRoot, 'data', 'releases', accepted.releaseId, source.envelopePath), 'utf8'));
  return [source.sourceId, {
    provider: envelope.source.attribution,
    sourceFamilyId: source.sourceFamilyId,
    retrievedAt: envelope.retrievedAt,
    url: envelope.source.documentationUrl,
    operation: envelope.operation,
    truncated: envelope.truncated,
  }];
}));
const release = {
  schemaVersion: manifest.schemaVersion,
  releaseId: manifest.releaseId,
  releaseDigest: digest(manifest),
  status: manifest.status,
  createdAt: manifest.createdAt,
  sourceCommit: manifest.sourceCommit,
  sources: sourceMetadata,
  datasets,
  manifests: manifest.datasets.map((entry) => ({
    datasetId: entry.datasetId,
    recordCount: entry.recordCount,
    digest: entry.contentDigest,
  })),
  limitations: manifest.limitations,
};
const packetBundle = {
  schemaVersion: '2.0.0',
  releaseId: manifest.releaseId,
  releaseDigest: digest(manifest),
  packets,
};

function emit(file, body) {
  if (check) {
    if (!existsSync(file) || readFileSync(file, 'utf8') !== body) {
      throw new Error(`${path.relative(repositoryRoot, file)} is stale; run npm run data:compile.`);
    }
    return;
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, body);
}

emit(path.join(generatedRoot, 'release.v1.json'), stableJson(release));
emit(path.join(generatedRoot, 'research-packets.v1.json'), stableJson(packetBundle));

const recordById = new Map(Object.values(datasets).flat().map((record) => [record.id, record]));
const expectedPacketFiles = new Set();
for (const packet of packets) {
  const filename = `${packet.id}.md`;
  expectedPacketFiles.add(filename);
  const evidenceRows = packet.evidenceRecordIds.map((id) => {
    const record = recordById.get(id);
    return `- \`${id}\`: ${record.description ?? record.title ?? record.metric ?? record.seriesId ?? record.commodity ?? record.geographyType ?? 'approved evidence record'}`;
  }).join('\n');
  const sourceRows = packet.citationNotes.map(({ sourceId, note }) => `- **${sourceId}:** ${note}`).join('\n');
  const claimRows = packet.claims.map((claim) => [
    `### ${claim.classification}`,
    '',
    claim.text,
    '',
    `Evidence: ${claim.evidenceRecordIds.map((id) => `\`${id}\``).join(', ')}`,
    '',
    `Limitations: ${claim.limitations.join(' ')}`,
  ].join('\n')).join('\n\n');
  const tableRows = packet.tables.map((table) => `- \`${table.id}\` — ${table.title}; ${table.recordIds.length} evidence row(s)`).join('\n') || '- None';
  const chartRows = packet.charts.map((chart) => `- \`${chart.id}\` — ${chart.title}; x: \`${chart.xField}\`, y: \`${chart.yField}\``).join('\n') || '- None';
  emit(path.join(packetRoot, filename), [
    `# ${packet.title}`,
    '',
    `Packet ID: \`${packet.id}\``,
    `Release: \`${packet.releaseId}\``,
    `Status: **${packet.status} / ${packet.approval.state}**`,
    `Reviewer: \`${packet.approval.reviewer}\``,
    `Generated: ${packet.generatedAt}`,
    `Review due: ${packet.reviewDueAt}`,
    '',
    '## Research question',
    '',
    packet.researchQuestion,
    '',
    '## Proposed factual claims',
    '',
    claimRows,
    '',
    '## Evidence records',
    '',
    evidenceRows,
    '',
    '## Citation-ready source notes',
    '',
    sourceRows,
    '',
    '## Suggested tables',
    '',
    tableRows,
    '',
    '## Suggested charts',
    '',
    chartRows,
    '',
    '## Freshness and disclosure',
    '',
    `Cadence: ${packet.updateCadence}. Staleness: ${packet.staleness.state} as of ${packet.staleness.assessedAt}.`,
    '',
    packet.disclosure,
    '',
    packet.unsupportedClaimWarnings.map((warning) => `- ${warning}`).join('\n'),
    '',
  ].join('\n'));
}

if (existsSync(packetRoot)) {
  const stale = readdirSync(packetRoot).filter((filename) => filename.endsWith('.md') && !expectedPacketFiles.has(filename));
  if (check && stale.length) throw new Error(`Stale research packet output: ${stale.join(', ')}`);
  if (!check) for (const filename of stale) rmSync(path.join(packetRoot, filename));
}

process.stdout.write(`Data release ${check ? 'check' : 'compile'} passed: ${Object.values(datasets).flat().length} records, ${packets.length} Research Packet v2 records, 6 provider families, Best Buy excluded.\n`);
