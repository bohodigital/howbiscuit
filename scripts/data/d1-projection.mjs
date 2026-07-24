#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  DATASET_FILES,
  digest,
  readAcceptedPointer,
  repositoryRoot,
  stableJson,
  validateRelease,
} from './release-lib.mjs';

const [command = 'sync', ...args] = process.argv.slice(2);
const flag = (name) => args.includes(name);
const valueFor = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertSourceCommit(manifest) {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
  const ancestor = execFileSync('git', ['merge-base', '--is-ancestor', manifest.sourceCommit, head], { cwd: repositoryRoot });
  assert(ancestor.length === 0, `${manifest.releaseId}: source commit is not an ancestor of HEAD`);
}

function openDatabase(databasePath) {
  const database = new DatabaseSync(databasePath);
  database.exec('PRAGMA foreign_keys = ON');
  const hasReleaseTable = database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name='dataset_releases'").get().count;
  if (!hasReleaseTable) database.exec(readFileSync(path.join(repositoryRoot, 'drizzle', '0004_h3_content_data.sql'), 'utf8'));
  return database;
}

const deleteOrder = [
  'research_packet_sources',
  'retailer_offer_observations',
  'market_report_observations',
  'food_nutrient_observations',
  'unresolved_mapping_candidates',
  'research_packets',
  'merchant_product_mappings',
  'merchant_locations',
  'agricultural_statistics',
  'market_report_definitions',
  'food_identities',
  'energy_observations',
  'geography_relationships',
  'content_dataset_manifests',
];

function projectionCounts(release) {
  const d = release.datasets;
  return {
    content_dataset_manifests: Object.keys(DATASET_FILES).length,
    geography_relationships: d.geographyRelationships.length,
    energy_observations: d.energyObservations.length,
    food_identities: d.foods.length,
    food_nutrient_observations: d.foodNutrients.length,
    market_report_definitions: d.marketReports.length,
    market_report_observations: d.marketObservations.length,
    agricultural_statistics: d.agriculturalStatistics.length,
    merchant_locations: d.merchantLocations.length,
    merchant_product_mappings: d.merchantMappings.length,
    retailer_offer_observations: d.offerObservations.length,
    research_packets: release.packets.length,
    research_packet_sources: release.packets.reduce((sum, packet) => sum + packet.evidenceRecordIds.length, 0),
    unresolved_mapping_candidates: d.unresolvedMappings.length,
  };
}

function insertRows(database, release, { failAfter = null } = {}) {
  const { manifest, datasets, packets } = release;
  const releaseDigest = digest(manifest);
  const sourceCommitMarker = `${manifest.sourceCommit}@sha256:${releaseDigest}`;
  const sourceById = new Map(manifest.sources.map((source) => [source.sourceId, source]));
  const recordById = new Map(Object.values(datasets).flat().map((record) => [record.id, record]));
  let stage = 0;
  const checkpoint = (name) => {
    stage += 1;
    if (failAfter === stage || failAfter === name) throw new Error(`Injected projection failure after ${name}`);
  };

  for (const table of deleteOrder) database.exec(`DELETE FROM ${table}`);
  checkpoint('clear-previous-projection');
  database.prepare(`INSERT INTO dataset_releases (
    release_id, schema_version, status, source_commit, created_at, validated_at
  ) VALUES (?, ?, 'draft', ?, ?, ?)
  ON CONFLICT(release_id) DO UPDATE SET
    schema_version=excluded.schema_version, status='draft', source_commit=excluded.source_commit,
    created_at=excluded.created_at, validated_at=excluded.validated_at`).run(
    manifest.releaseId, manifest.schemaVersion, sourceCommitMarker, manifest.createdAt, manifest.validatedAt,
  );
  checkpoint('draft-release');

  const manifestInsert = database.prepare(`INSERT INTO content_dataset_manifests (
    dataset_id, release_id, source_id, record_type, record_count, retrieved_at, content_digest
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  for (const entry of manifest.datasets) {
    const records = datasets[entry.datasetId];
    const sourceId = records[0]?.sourceId ?? 'none';
    const retrievedAt = sourceById.get(sourceId)?.retrievedAt ?? manifest.createdAt;
    manifestInsert.run(entry.datasetId, manifest.releaseId, sourceId, entry.datasetId, entry.recordCount, retrievedAt, entry.contentDigest);
  }
  checkpoint('dataset-manifests');

  const geographyInsert = database.prepare('INSERT INTO geography_relationships VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const row of datasets.geographyRelationships) geographyInsert.run(row.id, manifest.releaseId, row.zip, row.geographyType, row.geographyId, row.city, row.state, row.residentialRatio, row.sourceId);
  checkpoint('geography');

  const energyInsert = database.prepare('INSERT INTO energy_observations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const row of datasets.energyObservations) energyInsert.run(row.id, manifest.releaseId, row.seriesId, row.geographyId, row.period, row.value, row.unit, row.frequency, row.sourceId);
  checkpoint('energy');

  const foodInsert = database.prepare('INSERT INTO food_identities VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const row of datasets.foods) foodInsert.run(row.id, manifest.releaseId, row.fdcId, row.description, row.dataType, row.publicationDate, row.sourceId);
  const nutrientInsert = database.prepare('INSERT INTO food_nutrient_observations VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  for (const row of datasets.foodNutrients) nutrientInsert.run(row.id, manifest.releaseId, row.foodId, row.nutrientId, row.nutrientName, row.amount, row.unit, row.sourceId);
  checkpoint('food');

  const reportInsert = database.prepare('INSERT INTO market_report_definitions VALUES (?, ?, ?, ?, ?, ?)');
  for (const row of datasets.marketReports) reportInsert.run(row.id, manifest.releaseId, row.title, row.marketType, row.unitBasis, row.sourceId);
  const marketInsert = database.prepare('INSERT INTO market_report_observations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const row of datasets.marketObservations) marketInsert.run(row.id, manifest.releaseId, row.reportId, row.reportDate, row.commodity, row.geography, row.metric, row.valueMin, row.valueMax, row.unitBasis, row.sourceId);
  checkpoint('market');

  const statisticInsert = database.prepare('INSERT INTO agricultural_statistics VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const row of datasets.agriculturalStatistics) statisticInsert.run(row.id, manifest.releaseId, row.commodity, row.statistic, row.geography, row.period, row.value, row.unit, row.suppressed ? 1 : 0, row.sourceRevisionAt, row.sourceId);
  checkpoint('agriculture');

  const locationInsert = database.prepare('INSERT INTO merchant_locations VALUES (?, ?, ?, ?, ?, ?)');
  for (const row of datasets.merchantLocations) locationInsert.run(row.id, manifest.releaseId, row.merchantId, row.merchantLocationId, row.postalCode, row.sourceId);
  const mappingInsert = database.prepare('INSERT INTO merchant_product_mappings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const row of datasets.merchantMappings) mappingInsert.run(row.id, manifest.releaseId, row.canonicalProductId, row.merchantId, row.merchantProductId, row.matchConfidence, row.identityEvidence, row.approved ? 1 : 0, row.sourceId);
  const offerInsert = database.prepare('INSERT INTO retailer_offer_observations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const row of datasets.offerObservations) offerInsert.run(row.id, manifest.releaseId, row.mappingId, row.observedAt, row.expiresAt, row.priceAmount, row.currency, row.availability, row.sourceId);
  const unresolvedInsert = database.prepare('INSERT INTO unresolved_mapping_candidates VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const row of datasets.unresolvedMappings) unresolvedInsert.run(row.id, manifest.releaseId, row.sourceId, row.merchantProductId, row.candidateProductId, row.reason, row.createdAt);
  checkpoint('merchant');

  const packetInsert = database.prepare('INSERT INTO research_packets VALUES (?, ?, ?, ?, ?)');
  const packetSourceInsert = database.prepare('INSERT INTO research_packet_sources VALUES (?, ?, ?, ?)');
  for (const packet of packets) {
    packetInsert.run(packet.id, manifest.releaseId, packet.title, packet.generatedAt, packet.status);
    for (const recordId of packet.evidenceRecordIds) {
      const sourceId = recordById.get(recordId).sourceId;
      packetSourceInsert.run(packet.id, sourceId, recordId, sourceById.get(sourceId)?.retrievedAt ?? manifest.createdAt);
    }
  }
  checkpoint('research');

  database.prepare("UPDATE dataset_releases SET status='published' WHERE release_id=? AND source_commit=?").run(manifest.releaseId, sourceCommitMarker);
  checkpoint('accepted-marker-last');
}

export function syncProjection(database, release, options = {}) {
  assertSourceCommit(release.manifest);
  database.exec('BEGIN IMMEDIATE');
  try {
    insertRows(database, release, options);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
  return verifyProjection(database, release);
}

export function verifyProjection(database, release) {
  const expected = projectionCounts(release);
  const marker = database.prepare('SELECT * FROM dataset_releases WHERE release_id=?').get(release.manifest.releaseId);
  assert(marker?.status === 'published', `${release.manifest.releaseId}: published projection marker missing`);
  assert(marker.source_commit === `${release.manifest.sourceCommit}@sha256:${digest(release.manifest)}`, `${release.manifest.releaseId}: release digest or source commit mismatch`);
  const actual = {};
  for (const table of Object.keys(expected)) {
    actual[table] = table === 'research_packet_sources'
      ? database.prepare('SELECT count(*) AS count FROM research_packet_sources AS source JOIN research_packets AS packet ON packet.packet_id=source.packet_id WHERE packet.release_id=?').get(release.manifest.releaseId).count
      : database.prepare(`SELECT count(*) AS count FROM ${table} WHERE release_id=?`).get(release.manifest.releaseId).count;
  }
  for (const [table, count] of Object.entries(expected)) assert(actual[table] === count, `${table}: expected ${count}, found ${actual[table]}`);
  const manifests = database.prepare('SELECT dataset_id, record_count, content_digest FROM content_dataset_manifests WHERE release_id=? ORDER BY dataset_id').all(release.manifest.releaseId);
  for (const entry of release.manifest.datasets) {
    const projected = manifests.find(({ dataset_id }) => dataset_id === entry.datasetId);
    assert(projected?.record_count === entry.recordCount && projected?.content_digest === entry.contentDigest, `${entry.datasetId}: projected manifest mismatch`);
  }
  return { releaseId: release.manifest.releaseId, releaseDigest: digest(release.manifest), status: marker.status, rowCounts: actual };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const releaseId = valueFor('--release') ?? readAcceptedPointer().releaseId;
  const release = validateRelease(releaseId);
  const databasePath = valueFor('--database') ?? ':memory:';
  const database = openDatabase(databasePath);
  try {
    if (command === 'sync' && flag('--dry-run')) {
      process.stdout.write(`${stableJson({ releaseId, database: databasePath, transaction: 'one atomic transaction', marker: 'dataset_releases.status=published written last', rowCounts: projectionCounts(release) })}`);
    } else if (command === 'sync' && flag('--check')) {
      const result = syncProjection(database, release);
      const before = database.prepare("SELECT count(*) AS count FROM dataset_releases WHERE status='published'").get().count;
      try {
        syncProjection(database, release, { failAfter: 'research' });
        throw new Error('Failure injection did not fail.');
      } catch (error) {
        if (!/Injected projection failure/.test(error.message)) throw error;
      }
      const after = database.prepare("SELECT count(*) AS count FROM dataset_releases WHERE status='published'").get().count;
      assert(before === after, 'Failed transaction changed the accepted projection marker.');
      process.stdout.write(`${stableJson({ ...result, failureRollbackVerified: true })}`);
    } else if (command === 'sync') {
      process.stdout.write(`${stableJson(syncProjection(database, release))}`);
    } else if (command === 'verify') {
      process.stdout.write(`${stableJson(verifyProjection(database, release))}`);
    } else {
      throw new Error('Usage: d1-projection.mjs sync|verify [--release <id>] [--database <sqlite-path>] [--dry-run|--check]');
    }
  } finally {
    database.close();
  }
}
