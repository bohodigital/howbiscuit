#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { compileSourcePolicies } from '../../src/lib/offers/source-policy-compiler.mjs';
import {
  ALLOWED_PROVIDERS,
  DATASET_FILES,
  digest,
  loadRelease,
  promoteRelease,
  readAcceptedPointer,
  releaseDirectory,
  repositoryRoot,
  stableJson,
  validateBrokerEnvelope,
  validateRelease,
  withPromotionLock,
} from './release-lib.mjs';

const [command = 'status', ...args] = process.argv.slice(2);
const valueFor = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const accepted = () => validateRelease(readAcceptedPointer().releaseId, { requireAccepted: true });

function sourceFamilyCount(manifest) {
  return new Set(manifest.sources.map(({ sourceFamilyId }) => sourceFamilyId)).size;
}

function releaseSummary(release) {
  return {
    releaseId: release.manifest.releaseId,
    releaseDigest: digest(release.manifest),
    status: release.manifest.status,
    sourceCommit: release.manifest.sourceCommit,
    providerFamilies: [...new Set(release.manifest.sources.map(({ sourceFamilyId }) => sourceFamilyId))].sort(),
    sourceIds: release.manifest.sources.map(({ sourceId }) => sourceId).sort(),
    recordCount: Object.values(release.datasets).flat().length,
    packetCount: release.packets.length,
    limitations: release.manifest.limitations,
  };
}

if (command === 'status') {
  process.stdout.write(`${stableJson(releaseSummary(accepted()))}`);
} else if (command === 'coverage') {
  const release = accepted();
  const d = release.datasets;
  process.stdout.write([
    `${sourceFamilyCount(release.manifest)}/6 provider families through ${release.manifest.sources.length} separated source policies`,
    `${d.geographyRelationships.length} HUD relationships (${new Set(d.geographyRelationships.filter(({ residentialRatio }) => residentialRatio < 1).map(({ zip }) => zip)).size} ambiguous ZIPs)`,
    `${d.energyObservations.length} EIA observations`,
    `${d.foods.length} FoodData identities and ${d.foodNutrients.length} complete nutrients`,
    `${d.marketReports.length} Market News definitions and ${d.marketObservations.length} observations`,
    `${d.agriculturalStatistics.length} NASS statistics`,
    `${d.merchantMappings.filter(({ approved }) => approved).length} approved exact Kroger mappings`,
    `${d.merchantLocations.length} governed Kroger location and ${d.offerObservations.length} internal unknown-state observations`,
    `${release.packets.length}/25 Research Packet v2 records`,
    'Best Buy: explicitly excluded',
    '',
  ].join('\n'));
} else if (command === 'list-sources') {
  process.stdout.write(`${accepted().manifest.sources.map((source) => `${source.sourceId}\t${source.sourceFamilyId}\t${source.operation}`).join('\n')}\n`);
} else if (command === 'validate') {
  const release = accepted();
  const policies = compileSourcePolicies(repositoryRoot).policies;
  const active = policies.filter((policy) => policy.lifecycle === 'active' && policy.releaseMembership);
  const excluded = policies.filter((policy) => policy.lifecycle === 'excluded');
  if (sourceFamilyCount(release.manifest) !== 6) throw new Error('Expected six approved provider families.');
  if (!excluded.some(({ sourceId }) => sourceId === 'best-buy')) throw new Error('Best Buy must remain explicitly excluded.');
  if (release.datasets.foodNutrients.some((row) => !row.nutrientName || !row.unit || !row.basis)) throw new Error('Incomplete FoodData nutrients rejected.');
  for (const zip of new Set(release.datasets.geographyRelationships.map(({ zip }) => zip))) {
    const county = release.datasets.geographyRelationships.filter((row) => row.zip === zip && row.geographyType === 'county');
    const total = county.reduce((sum, row) => sum + row.residentialRatio, 0);
    if (county.length && Math.abs(total - 1) > 0.000001) throw new Error(`${zip}: HUD county residential weights total ${total}.`);
  }
  if (!release.datasets.agriculturalStatistics.some(({ classification }) => classification === 'forecast')) throw new Error('NASS forecast classification missing.');
  if (!release.datasets.agriculturalStatistics.some(({ classification }) => classification === 'final')) throw new Error('NASS final classification missing.');
  if (release.datasets.merchantMappings.filter(({ approved, matchConfidence }) => approved && matchConfidence.startsWith('exact-')).length < 25) throw new Error('At least 25 exact Kroger mappings required.');
  if (release.datasets.offerObservations.some(({ priceAmount, availability }) => priceAmount === null && availability !== 'unknown')) throw new Error('Missing Kroger fields must normalize to unknown.');
  if (active.length < release.manifest.sources.length) throw new Error('Release source policies are incomplete.');
  process.stdout.write(`Data validation passed for ${release.manifest.releaseId}: ${active.length} active source policies, ${release.packets.length} packets, Best Buy excluded.\n`);
} else if (command === 'plan') {
  const release = accepted();
  process.stdout.write(`${stableJson({
    schemaVersion: '1.0.0',
    baseReleaseId: release.manifest.releaseId,
    brokerOnly: true,
    plans: release.manifest.sources.map((source) => JSON.parse(readFileSync(path.join(release.target, 'sources', source.sourceId, 'query-plan.json'), 'utf8'))),
  })}`);
} else if (command === 'import') {
  const provider = valueFor('--provider');
  const envelopePath = valueFor('--envelope');
  const releaseId = valueFor('--release');
  if (!ALLOWED_PROVIDERS.includes(provider) || !envelopePath || !releaseId) throw new Error('Usage: data:import -- --provider <provider> --envelope <path> --release <new-release-id>');
  const target = releaseDirectory(releaseId);
  if (existsSync(target)) throw new Error(`Immutable release ${releaseId} already exists.`);
  const envelope = validateBrokerEnvelope(JSON.parse(readFileSync(path.resolve(envelopePath), 'utf8')));
  if (envelope.providerId !== provider) throw new Error('Provider argument differs from envelope.');
  const staging = path.join(repositoryRoot, 'data', 'releases', '.staging', releaseId, provider);
  mkdirSync(staging, { recursive: true });
  writeFileSync(path.join(staging, 'source-envelope.json'), stableJson(envelope), { flag: 'wx' });
  writeFileSync(path.join(staging, 'import-receipt.json'), stableJson({ schemaVersion: '1.0.0', provider, operation: envelope.operation, envelopeDigest: digest(envelope), importedAt: envelope.retrievedAt, state: 'validated-staging' }), { flag: 'wx' });
  process.stdout.write(`Validated ${provider} envelope into isolated staging for ${releaseId}; no accepted release was mutated.\n`);
} else if (command === 'refresh' || command === 'refresh-all') {
  const provider = command === 'refresh' ? valueFor('--provider') : null;
  if (provider && !ALLOWED_PROVIDERS.includes(provider)) throw new Error(`Unknown provider: ${provider}`);
  const plans = accepted().manifest.sources.filter((source) => !provider || source.sourceFamilyId === provider).map((source) => path.join(source.sourceId, 'query-plan.json'));
  process.stdout.write(`${stableJson({ state: 'broker-envelope-required', twoStepWorkflow: true, provider: provider ?? 'all', queryPlans: plans, next: 'Run the listed bounded plans through the Local1 broker, then npm run data:import with a new immutable release ID.' })}`);
} else if (command === 'diff') {
  const from = validateRelease(valueFor('--from'));
  const to = validateRelease(valueFor('--to'));
  const datasets = Object.keys(DATASET_FILES).map((datasetId) => ({
    datasetId,
    from: from.datasets[datasetId].length,
    to: to.datasets[datasetId].length,
    change: to.datasets[datasetId].length - from.datasets[datasetId].length,
    fromDigest: digest(from.datasets[datasetId]),
    toDigest: digest(to.datasets[datasetId]),
  }));
  process.stdout.write(`${stableJson({ schemaVersion: '1.0.0', from: from.manifest.releaseId, to: to.manifest.releaseId, datasets })}`);
} else if (command === 'promote') {
  const releaseId = valueFor('--release');
  if (!releaseId) throw new Error('Usage: data:promote -- --release <release-id>');
  process.stdout.write(`${stableJson(promoteRelease(releaseId))}`);
} else if (command === 'rollback') {
  const releaseId = valueFor('--release');
  if (!releaseId) throw new Error('Usage: data:rollback -- --release <release-id>');
  validateRelease(releaseId);
  const pointer = withPromotionLock(() => {
    const previous = readAcceptedPointer();
    const next = {
      schemaVersion: '1.0.0',
      releaseId,
      previousReleaseId: previous.releaseId,
      promotedAt: new Date().toISOString(),
      reason: 'operator-requested-rollback',
      releaseDigest: digest(loadRelease(releaseId).manifest),
    };
    const temporary = path.join(repositoryRoot, 'data', 'releases', `.accepted.${process.pid}.tmp`);
    writeFileSync(temporary, stableJson(next), { flag: 'wx' });
    renameSync(temporary, path.join(repositoryRoot, 'data', 'releases', 'accepted.json'));
    return next;
  });
  process.stdout.write(`${stableJson(pointer)}`);
} else {
  throw new Error('Usage: cli.mjs status|coverage|list-sources|validate|plan|import|refresh|refresh-all|diff|promote|rollback');
}
