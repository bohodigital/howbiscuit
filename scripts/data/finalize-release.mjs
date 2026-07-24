#!/usr/bin/env node
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import {
  DATASET_FILES,
  digest,
  readAcceptedPointer,
  releaseDirectory,
  releaseRoot,
  stableJson,
  validateBrokerEnvelope,
  validateRelease,
} from './release-lib.mjs';

const FOOD_ID_REPLACEMENTS = new Map([
  ['fdc-2758998', 'fdc-169736'],
  ['fdc-746782', 'fdc-171265'],
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function writeJson(target, value) {
  writeFileSync(target, stableJson(value));
}

function replaceEvidenceIds(value) {
  if (Array.isArray(value)) return value.map(replaceEvidenceIds);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceEvidenceIds(item)]));
  }
  return typeof value === 'string' ? FOOD_ID_REPLACEMENTS.get(value) ?? value : value;
}

function normalizeFooddata(envelope) {
  const foods = envelope.records
    .filter(({ recordType }) => recordType === 'food')
    .map((record) => ({
      id: `fdc-${record.fdcId}`,
      sourceId: 'usda-fooddata-central',
      fdcId: record.fdcId,
      description: record.description,
      dataType: record.dataType,
      publicationDate: record.publicationDate,
      foodCategory: record.foodCategory,
      classification: 'generic',
      retrievedAt: record.retrievedAt,
    }))
    .sort((a, b) => a.fdcId - b.fdcId);
  const foodIds = new Set(foods.map(({ id }) => id));
  const foodNutrients = envelope.records
    .filter(({ recordType }) => recordType === 'nutrient')
    .map((record) => ({
      id: `fdc-${record.fdcId}-nutrient-${record.nutrientId}`,
      sourceId: 'usda-fooddata-central',
      foodId: `fdc-${record.fdcId}`,
      nutrientId: record.nutrientId,
      nutrientName: record.nutrientName,
      amount: record.amount,
      unit: record.unitName,
      basis: record.basis,
      retrievedAt: record.retrievedAt,
    }))
    .filter(({ foodId }) => foodIds.has(foodId))
    .sort((a, b) => a.foodId.localeCompare(b.foodId) || a.nutrientId - b.nutrientId);
  assert(foods.length >= 15 && foodNutrients.length >= 75, 'FoodData refresh did not meet identity and nutrient coverage floors.');
  return { foods, foodNutrients, normalized: [...foods, ...foodNutrients] };
}

function normalizeAvailability(stockLevel) {
  if (['HIGH', 'LOW'].includes(stockLevel)) return 'available';
  if (['TEMPORARILY_OUT_OF_STOCK', 'OUT_OF_STOCK'].includes(stockLevel)) return 'unavailable';
  return 'unknown';
}

function normalizeSize(value) {
  return String(value).toLowerCase().replaceAll(/\s+/g, '');
}

function quantityFields(size, description) {
  const pack = String(size).match(/^(\d+)\s*pk\s*\/\s*(.+)$/i);
  if (pack) {
    const count = Number.parseInt(pack[1], 10);
    const each = pack[2];
    const amount = Number.parseFloat(each);
    return {
      count,
      totalQuantity: Number.isFinite(amount)
        ? `${Number((count * amount).toFixed(3))} ${each.replace(/^[\d.]+\s*/, '')}`
        : `${count} × ${each}`,
      variety: description,
    };
  }
  if (/^1\s+dozen$/i.test(size)) return { count: 12, totalQuantity: '12 eggs', variety: description };
  return { count: 1, totalQuantity: String(size), variety: description };
}

function normalizeKroger(envelope, datasets) {
  const byProduct = new Map(envelope.records.map((record) => [record.productId, record]));
  const observedAt = envelope.retrievedAt;
  const expiresAt = new Date(new Date(observedAt).valueOf() + 6 * 60 * 60 * 1_000).toISOString();
  const reviewExpiresAt = new Date(new Date(observedAt).valueOf() + 90 * 24 * 60 * 60 * 1_000).toISOString();
  datasets.merchantMappings = datasets.merchantMappings.map((mapping) => {
    const record = byProduct.get(mapping.merchantProductId);
    assert(record, `${mapping.id}: exact product was absent from the bounded Kroger refresh.`);
    assert(record.itemId === mapping.merchantProductId, `${mapping.id}: item identity mismatch.`);
    const refreshed = {
      ...mapping,
      brand: record.brand,
      displayName: record.description,
      packageSize: record.size,
      ...quantityFields(record.size, record.description),
      evidenceSource: 'Local1 public data broker / Kroger Public APIs',
      identityEvidence: `Broker product search matched exact Kroger product and item ID ${record.productId}, brand ${record.brand}, title ${record.description}, and package size ${record.size}.`,
      retrievedAt: observedAt,
      reviewer: 'owner-authorized-handoff3.1-production-window',
      approvedAt: observedAt.slice(0, 10),
      reviewExpiresAt,
    };
    const digestInput = { ...refreshed };
    delete digestInput.mappingDigest;
    refreshed.mappingDigest = digest(digestInput);
    return refreshed;
  });
  const offerObservations = datasets.merchantMappings.map((mapping) => {
    const record = byProduct.get(mapping.merchantProductId);
    assert(normalizeSize(record.size) === normalizeSize(mapping.packageSize), `${mapping.id}: package size mismatch.`);
    const fulfillmentModes = [
      record.curbside && 'pickup',
      record.delivery && 'delivery',
      record.inStore && 'in-store',
      record.shipToHome && 'shipping',
    ].filter(Boolean);
    const promotional = Number.isFinite(record.promotionalPrice) ? record.promotionalPrice : null;
    const regular = Number.isFinite(record.regularPrice) ? record.regularPrice : null;
    return {
      id: `kroger-observation-53100516-${mapping.merchantProductId}-${observedAt.slice(0, 10)}`,
      sourceId: 'kroger',
      mappingId: mapping.id,
      locationId: 'kroger-location-53100516',
      observedAt,
      expiresAt,
      regularPrice: regular,
      promotionalPrice: promotional,
      priceAmount: promotional ?? regular,
      priceType: promotional !== null ? 'promotional' : regular !== null ? 'regular' : null,
      currency: promotional !== null || regular !== null ? 'USD' : null,
      availability: normalizeAvailability(record.stockLevel),
      providerInventoryState: record.stockLevel,
      fulfillmentModes,
      itemSize: record.size,
      publicationState: 'internal-only',
      limitation: 'Dated internal research observation for one governed Mariano’s location; public live price comparison remains disabled.',
    };
  }).sort((a, b) => a.mappingId.localeCompare(b.mappingId));
  assert(offerObservations.length >= 25, 'Kroger refresh did not meet the exact offer-observation floor.');
  const normalized = [
    ...datasets.merchantLocations,
    ...datasets.merchantMappings,
    ...offerObservations,
    ...datasets.unresolvedMappings,
  ];
  return { offerObservations, normalized };
}

function addFoodCompositionEvidence(packet, nutrients, foodIds) {
  const names = new Set(['Energy', 'Protein', 'Sodium, Na']);
  const selected = nutrients.filter((row) => foodIds.includes(row.foodId) && names.has(row.nutrientName));
  if (!selected.length) return packet;
  packet.evidenceRecordIds = [...new Set([...packet.evidenceRecordIds, ...selected.map(({ id }) => id)])];
  packet.claims[0].evidenceRecordIds = [...new Set([...packet.claims[0].evidenceRecordIds, ...selected.map(({ id }) => id)])];
  packet.claims[0].classification = 'food-composition';
  packet.claims[0].text = `${packet.claims[0].text} Complete energy, protein, and sodium observations are labeled per 100 g.`;
  packet.claims[0].limitations = [...new Set([
    ...packet.claims[0].limitations,
    'FoodData nutrient amounts are generic food-composition values per 100 g, not branded-product or serving claims.',
  ])];
  packet.tables = [{
    id: 'nutrients',
    title: `${packet.title} nutrient evidence`,
    columns: ['foodId', 'nutrientName', 'amount', 'unit', 'basis'],
    recordIds: selected.map(({ id }) => id),
  }];
  return packet;
}

function refreshPackets(packets, releaseId, refreshedAt, datasets, refreshedSources) {
  const next = replaceEvidenceIds(packets).map((packet) => {
    packet.releaseId = releaseId;
    packet.generatedAt = refreshedAt;
    packet.staleness.assessedAt = refreshedAt;
    packet.approval.approvedAt = refreshedAt;
    for (const sourceId of packet.sourceIds) {
      if (!refreshedSources.has(sourceId)) continue;
      packet.sourceRetrievalDates[sourceId] = refreshedAt;
      for (const note of packet.citationNotes) {
        if (note.sourceId === sourceId) note.note = `${sourceId} data retrieved ${refreshedAt}.`;
      }
    }
    packet.claims = packet.claims.map((claim) => ({
      ...claim,
      text: claim.text
        .replaceAll('FDC 2758998', 'FDC 169736')
        .replaceAll('Pasta, spaghetti, dry, enriched', 'Pasta, dry, enriched')
        .replaceAll('FDC 746782', 'FDC 171265'),
    }));
    return packet;
  });
  const byId = new Map(next.map((packet) => [packet.id, packet]));
  addFoodCompositionEvidence(byId.get('baking-staples-identities'), datasets.foodNutrients, [
    'fdc-789890', 'fdc-746784', 'fdc-173468', 'fdc-175040', 'fdc-172804',
  ]);
  addFoodCompositionEvidence(byId.get('pantry-staples-identities'), datasets.foodNutrients, [
    'fdc-168877', 'fdc-173904', 'fdc-169736', 'fdc-175188', 'fdc-170051', 'fdc-169593',
  ]);
  addFoodCompositionEvidence(byId.get('dairy-staples-identities'), datasets.foodNutrients, [
    'fdc-173410', 'fdc-171265', 'fdc-171287',
  ]);
  const availability = byId.get('kroger-availability-boundary');
  if (availability) {
    const evidence = datasets.offerObservations.slice(0, 5);
    availability.evidenceRecordIds = evidence.map(({ id }) => id);
    availability.claims[0].evidenceRecordIds = evidence.map(({ id }) => id);
    availability.claims[0].classification = 'retailer-price-observation';
    availability.claims[0].text = `At ${refreshedAt}, the governed Kroger refresh returned explicit store-scoped price, fulfillment, and inventory fields for ${datasets.offerObservations.length} exact mappings. These dated observations remain internal-only; missing or unsupported fields remain unknown.`;
    availability.claims[0].limitations = [
      'One governed store and one observation time; this is not a current public availability or price-comparison claim.',
    ];
    availability.observationDates = [refreshedAt];
    availability.tables = [{
      id: 'observations',
      title: 'Kroger dated internal observations',
      columns: ['mappingId', 'observedAt', 'priceAmount', 'currency', 'availability', 'fulfillmentModes', 'itemSize'],
      recordIds: evidence.map(({ id }) => id),
    }];
  }
  return next;
}

function sourceEntry(sourceId, providerId, operation, envelope, normalized) {
  return {
    sourceId,
    sourceFamilyId: providerId,
    providerId,
    operation,
    schemaVersion: '1.0.0',
    importerVersion: 'howbiscuit-data-importer-v2',
    retrievedAt: envelope.retrievedAt,
    envelopePath: `sources/${sourceId}/source-envelope.json`,
    envelopeDigest: digest(envelope),
    normalizedDigest: digest(normalized),
    recordCount: normalized.length,
    releaseMembership: true,
    approvalState: 'approved',
  };
}

export function finalizeStagedRelease(releaseId) {
  const target = releaseDirectory(releaseId);
  assert(!existsSync(target), `Immutable release ${releaseId} already exists.`);
  const acceptedId = readAcceptedPointer().releaseId;
  const accepted = validateRelease(acceptedId, { requireAccepted: true });
  const staging = path.join(releaseRoot, '.staging', releaseId);
  const build = path.join(staging, 'build');
  assert(existsSync(staging), `${releaseId}: no staged broker envelopes.`);
  rmSync(build, { recursive: true, force: true });
  cpSync(accepted.target, build, { recursive: true });

  const datasets = structuredClone(accepted.datasets);
  let packets = structuredClone(accepted.packets);
  const sourceUpdates = new Map();
  const refreshedSources = new Set();
  const retrievalDates = [];

  const foodEnvelopePath = path.join(staging, 'fooddata', 'source-envelope.json');
  if (existsSync(foodEnvelopePath)) {
    const envelope = validateBrokerEnvelope(JSON.parse(readFileSync(foodEnvelopePath, 'utf8')));
    const normalized = normalizeFooddata(envelope);
    datasets.foods = normalized.foods;
    datasets.foodNutrients = normalized.foodNutrients;
    retrievalDates.push(envelope.retrievedAt);
    refreshedSources.add('usda-fooddata-central');
    sourceUpdates.set('usda-fooddata-central', { envelope, normalized: normalized.normalized, providerId: 'fooddata', operation: 'fooddata_get_batch' });
  }

  const krogerEnvelopePath = path.join(staging, 'kroger', 'source-envelope.json');
  if (existsSync(krogerEnvelopePath)) {
    const envelope = validateBrokerEnvelope(JSON.parse(readFileSync(krogerEnvelopePath, 'utf8')));
    const normalized = normalizeKroger(envelope, datasets);
    datasets.offerObservations = normalized.offerObservations;
    retrievalDates.push(envelope.retrievedAt);
    refreshedSources.add('kroger');
    sourceUpdates.set('kroger', { envelope, normalized: normalized.normalized, providerId: 'kroger', operation: 'search_products' });
  }

  assert(sourceUpdates.size > 0, `${releaseId}: no supported staged source.`);
  const refreshedAt = retrievalDates.sort().at(-1);
  packets = refreshPackets(packets, releaseId, refreshedAt, datasets, refreshedSources);

  for (const [datasetId, filename] of Object.entries(DATASET_FILES)) {
    writeJson(path.join(build, 'datasets', filename), datasets[datasetId]);
  }
  writeJson(path.join(build, 'research', 'packets.json'), packets);

  const manifest = JSON.parse(readFileSync(path.join(build, 'manifest.json'), 'utf8'));
  manifest.releaseId = releaseId;
  manifest.previousReleaseId = acceptedId;
  manifest.rollbackReleaseId = acceptedId;
  manifest.createdAt = refreshedAt;
  manifest.validatedAt = refreshedAt;
  manifest.status = 'published';
  manifest.approval = {
    state: 'approved',
    approvedAt: refreshedAt,
    reviewer: 'owner-authorized-handoff3.1-production-window',
  };
  manifest.limitations = [
    'Kroger observations are dated, single-location, internal research evidence; public live price comparison remains disabled.',
  ];
  manifest.datasets = Object.entries(DATASET_FILES).map(([datasetId, filename]) => ({
    datasetId,
    filename: `datasets/${filename}`,
    recordCount: datasets[datasetId].length,
    contentDigest: digest(datasets[datasetId]),
  }));
  manifest.research = { packetCount: packets.length, contentDigest: digest(packets) };

  for (const [sourceId, update] of sourceUpdates) {
    const entry = sourceEntry(sourceId, update.providerId, update.operation, update.envelope, update.normalized);
    const index = manifest.sources.findIndex((source) => source.sourceId === sourceId);
    assert(index >= 0, `${sourceId}: source manifest entry missing.`);
    manifest.sources[index] = entry;
    const sourceTarget = path.join(build, 'sources', sourceId);
    mkdirSync(sourceTarget, { recursive: true });
    writeJson(path.join(sourceTarget, 'source-envelope.json'), update.envelope);
    writeJson(path.join(sourceTarget, 'normalized.json'), update.normalized);
    writeJson(path.join(sourceTarget, 'manifest.json'), entry);
    writeJson(path.join(sourceTarget, 'query-plan.json'), sourceId === 'usda-fooddata-central'
      ? {
          schemaVersion: '1.0.0',
          brokerOnly: true,
          providerId: 'fooddata',
          operation: 'fooddata_get',
          maximumRecords: 2_000,
          execution: {
            brokerApiId: 'data_gov',
            brokerOperation: 'fooddata_get',
            parameterName: 'fdc_id',
          },
          parameters: {
            fdcIds: datasets.foods.map(({ fdcId }) => fdcId).sort((a, b) => a - b).join(','),
            perRequestLimit: 1,
          },
        }
      : {
          schemaVersion: '1.0.0',
          brokerOnly: true,
          providerId: 'kroger',
          operation: 'search_products',
          maximumRecords: 2_000,
          execution: {
            brokerApiId: 'kroger',
            brokerOperation: 'search_products',
            batchSize: 10,
          },
          parameters: {
            locationId: '53100516',
            productIds: datasets.merchantMappings.map(({ merchantProductId }) => merchantProductId).sort().join(','),
            perRequestLimit: 50,
          },
        });
  }
  writeJson(path.join(build, 'manifest.json'), manifest);

  const machineDiff = {
    schemaVersion: '1.0.0',
    from: acceptedId,
    to: releaseId,
    datasets: manifest.datasets.map((entry) => {
      const prior = accepted.manifest.datasets.find(({ datasetId }) => datasetId === entry.datasetId);
      return {
        datasetId: entry.datasetId,
        from: prior.recordCount,
        to: entry.recordCount,
        change: entry.recordCount - prior.recordCount,
        fromDigest: prior.contentDigest,
        toDigest: entry.contentDigest,
      };
    }),
  };
  writeJson(path.join(build, 'diff.json'), machineDiff);
  writeFileSync(path.join(build, 'diff.md'), [
    `# Data release diff: ${acceptedId} → ${releaseId}`,
    '',
    '| Dataset | Before | After | Change |',
    '| --- | ---: | ---: | ---: |',
    ...machineDiff.datasets.map((row) => `| ${row.datasetId} | ${row.from} | ${row.to} | ${row.change >= 0 ? '+' : ''}${row.change} |`),
    '',
    `Refreshed sources: ${[...refreshedSources].sort().join(', ')}`,
    '',
  ].join('\n'));

  renameSync(build, target);
  try {
    const release = validateRelease(releaseId);
    rmSync(staging, { recursive: true, force: true });
    return {
      releaseId,
      previousReleaseId: acceptedId,
      releaseDigest: digest(release.manifest),
      recordCount: Object.values(release.datasets).flat().length,
      packetCount: release.packets.length,
      refreshedSources: [...refreshedSources].sort(),
    };
  } catch (error) {
    rmSync(target, { recursive: true, force: true });
    throw error;
  }
}
