import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DATA_SCHEMA_VERSION = '2.0.0';
export const IMPORTER_VERSION = 'howbiscuit-data-importer-v2';
export const BROKER_SCHEMA_VERSION = '1.0.0';
export const ALLOWED_PROVIDERS = Object.freeze([
  'hud',
  'eia',
  'fooddata',
  'mymarketnews',
  'nass',
  'kroger',
]);
export const DATASET_FILES = Object.freeze({
  geographyRelationships: 'geography-relationships.json',
  energyObservations: 'energy-observations.json',
  foods: 'food-identities.json',
  foodNutrients: 'food-nutrients.json',
  marketReports: 'market-report-definitions.json',
  marketObservations: 'market-report-observations.json',
  agriculturalStatistics: 'agricultural-statistics.json',
  merchantLocations: 'merchant-locations.json',
  merchantMappings: 'merchant-product-mappings.json',
  offerObservations: 'retailer-offer-observations.json',
  unresolvedMappings: 'unresolved-mapping-candidates.json',
});

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const releaseRoot = path.join(repositoryRoot, 'data', 'releases');
export const acceptedPointerPath = path.join(releaseRoot, 'accepted.json');
export const promotionLockPath = path.join(releaseRoot, '.promotion.lock');

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function digest(value) {
  const body = typeof value === 'string' ? value : canonicalJson(value);
  return createHash('sha256').update(body).digest('hex');
}

export function stableJson(value) {
  const sort = (item) => {
    if (Array.isArray(item)) return item.map(sort);
    if (item && typeof item === 'object') {
      return Object.fromEntries(Object.keys(item).sort().map((key) => [key, sort(item[key])]));
    }
    return item;
  };
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIsoDate(value, label) {
  assert(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value), `${label}: UTC retrieval timestamp required`);
  assert(!Number.isNaN(new Date(value).valueOf()), `${label}: invalid retrieval timestamp`);
}

function scanSensitive(value, label) {
  const serialized = JSON.stringify(value);
  assert(!/(authorization|access[_-]?token|client[_-]?secret|api[_-]?key|password)/i.test(serialized), `${label}: credential-shaped field rejected`);
  assert(!/https?:\/\/[^/\s]+:[^@\s]+@/i.test(serialized), `${label}: credential-bearing URL rejected`);
}

export function validateBrokerEnvelope(envelope, label = 'broker envelope') {
  assert(envelope && typeof envelope === 'object' && !Array.isArray(envelope), `${label}: object required`);
  const expected = [
    'schemaVersion', 'providerId', 'operation', 'parameters', 'retrievedAt', 'source',
    'quota', 'warnings', 'truncated', 'records', 'contentDigest',
  ].sort();
  assert(JSON.stringify(Object.keys(envelope).sort()) === JSON.stringify(expected), `${label}: unexpected or missing fields`);
  assert(envelope.schemaVersion === BROKER_SCHEMA_VERSION, `${label}: unsupported schemaVersion`);
  assert(ALLOWED_PROVIDERS.includes(envelope.providerId), `${label}: unknown provider`);
  assert(typeof envelope.operation === 'string' && /^[a-z][a-z0-9_.-]{1,79}$/.test(envelope.operation), `${label}: invalid operation`);
  assert(envelope.parameters && typeof envelope.parameters === 'object' && !Array.isArray(envelope.parameters), `${label}: bounded public parameters required`);
  assert(Object.keys(envelope.parameters).length <= 20, `${label}: too many parameters`);
  assertIsoDate(envelope.retrievedAt, label);
  assert(envelope.source?.attribution && envelope.source?.documentationUrl?.startsWith('https://'), `${label}: source attribution and HTTPS documentation required`);
  assert(envelope.quota && typeof envelope.quota === 'object' && !Array.isArray(envelope.quota), `${label}: quota object required`);
  assert(Array.isArray(envelope.warnings) && envelope.warnings.length <= 50, `${label}: bounded warnings required`);
  assert(typeof envelope.truncated === 'boolean', `${label}: truncation state required`);
  assert(Array.isArray(envelope.records) && envelope.records.length <= 2_000, `${label}: records must be bounded to 2,000`);
  assert(envelope.records.every((record) => record && typeof record === 'object' && !Array.isArray(record)), `${label}: flat record objects required`);
  assert(envelope.records.every((record) => Object.values(record).every((value) => value === null || ['string', 'number', 'boolean'].includes(typeof value))), `${label}: unexpected nested field`);
  scanSensitive(envelope, label);
  const unsigned = { ...envelope };
  delete unsigned.contentDigest;
  assert(envelope.contentDigest === digest(unsigned), `${label}: content digest mismatch`);
  return envelope;
}

export function releaseDirectory(releaseId) {
  assert(/^[a-z0-9]+(?:[a-z0-9.-]*[a-z0-9])?$/.test(releaseId), 'Invalid release ID');
  const target = path.join(releaseRoot, releaseId);
  assert(path.dirname(target) === releaseRoot, 'Release path escaped release root');
  return target;
}

export function readAcceptedPointer() {
  assert(existsSync(acceptedPointerPath), 'No accepted release pointer; promote a validated release.');
  const pointer = JSON.parse(readFileSync(acceptedPointerPath, 'utf8'));
  assert(pointer.schemaVersion === '1.0.0' && typeof pointer.releaseId === 'string', 'Invalid accepted release pointer');
  return pointer;
}

export function loadRelease(releaseId = readAcceptedPointer().releaseId) {
  const target = releaseDirectory(releaseId);
  const manifest = JSON.parse(readFileSync(path.join(target, 'manifest.json'), 'utf8'));
  const datasets = Object.fromEntries(Object.entries(DATASET_FILES).map(([key, filename]) => [
    key,
    JSON.parse(readFileSync(path.join(target, 'datasets', filename), 'utf8')),
  ]));
  const packets = JSON.parse(readFileSync(path.join(target, 'research', 'packets.json'), 'utf8'));
  return { target, manifest, datasets, packets };
}

export function validateRelease(releaseId, { requireAccepted = false } = {}) {
  const release = loadRelease(releaseId);
  const { manifest, datasets, packets, target } = release;
  assert(manifest.schemaVersion === DATA_SCHEMA_VERSION, `${releaseId}: unsupported release schema`);
  assert(manifest.releaseId === releaseId, `${releaseId}: manifest identity mismatch`);
  assert(['validated', 'published'].includes(manifest.status), `${releaseId}: release is not eligible`);
  assert(manifest.approval?.state === 'approved', `${releaseId}: release is not approved`);
  assert(manifest.importerVersion === IMPORTER_VERSION, `${releaseId}: importer mismatch`);
  assert(!manifest.retiredAt, `${releaseId}: retired release rejected`);
  assert(Object.keys(DATASET_FILES).every((key) => Array.isArray(datasets[key])), `${releaseId}: dataset missing`);
  const recordIds = new Set();
  for (const [datasetId, records] of Object.entries(datasets)) {
    const expected = manifest.datasets.find((entry) => entry.datasetId === datasetId);
    assert(expected, `${releaseId}: ${datasetId} missing manifest`);
    assert(expected.recordCount === records.length, `${releaseId}: ${datasetId} row-count mismatch`);
    assert(expected.contentDigest === digest(records), `${releaseId}: ${datasetId} digest mismatch`);
    for (const record of records) {
      assert(typeof record.id === 'string' && record.id.length > 2, `${releaseId}: ${datasetId} record ID missing`);
      assert(!recordIds.has(record.id), `${releaseId}: duplicate record ID ${record.id}`);
      recordIds.add(record.id);
    }
  }
  for (const source of manifest.sources) {
    const envelopePath = path.join(target, source.envelopePath);
    const envelope = validateBrokerEnvelope(JSON.parse(readFileSync(envelopePath, 'utf8')), `${releaseId}/${source.sourceId}`);
    assert(source.envelopeDigest === digest(envelope), `${releaseId}: ${source.sourceId} envelope digest mismatch`);
    assert(source.releaseMembership === true && source.approvalState === 'approved', `${releaseId}: inactive source in manifest`);
  }
  assert(Array.isArray(packets) && packets.length >= 25, `${releaseId}: at least 25 research packets required`);
  for (const packet of packets) {
    assert(packet.schemaVersion === '2.0.0', `${packet.id}: Research Packet v2 required`);
    assert(packet.releaseId === releaseId, `${packet.id}: release mismatch`);
    assert(packet.status === 'validated' && packet.approval?.state === 'approved', `${packet.id}: packet is not publishable`);
    assert(Array.isArray(packet.claims) && packet.claims.length > 0, `${packet.id}: substantive claims required`);
    assert(packet.claims.every((claim) => claim.text !== packet.researchQuestion && claim.evidenceRecordIds?.length), `${packet.id}: question-only or unsupported claim`);
    assert(packet.evidenceRecordIds.every((id) => recordIds.has(id)), `${packet.id}: missing evidence record`);
  }
  if (requireAccepted) assert(readAcceptedPointer().releaseId === releaseId, `${releaseId}: not the accepted release`);
  return release;
}

export function withPromotionLock(callback) {
  mkdirSync(releaseRoot, { recursive: true });
  let descriptor;
  try {
    descriptor = openSync(promotionLockPath, 'wx', 0o600);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Another data promotion is in progress.');
    throw error;
  }
  try {
    return callback();
  } finally {
    closeSync(descriptor);
    rmSync(promotionLockPath, { force: true });
  }
}

export function promoteRelease(releaseId, { reason = 'validated-release-promotion' } = {}) {
  return withPromotionLock(() => {
    const release = validateRelease(releaseId);
    const previous = existsSync(acceptedPointerPath) ? readAcceptedPointer().releaseId : null;
    const pointer = {
      schemaVersion: '1.0.0',
      releaseId,
      previousReleaseId: previous === releaseId ? release.manifest.previousReleaseId ?? null : previous,
      promotedAt: release.manifest.approval.approvedAt,
      reason,
      releaseDigest: digest(release.manifest),
    };
    const temporary = `${acceptedPointerPath}.${process.pid}.tmp`;
    writeFileSync(temporary, stableJson(pointer), { mode: 0o644, flag: 'wx' });
    renameSync(temporary, acceptedPointerPath);
    return pointer;
  });
}
