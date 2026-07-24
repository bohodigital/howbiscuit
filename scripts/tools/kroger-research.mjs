#!/usr/bin/env node
import { readAcceptedPointer, stableJson, validateRelease } from '../data/release-lib.mjs';

const [command = 'status', ...args] = process.argv.slice(2);
const valueFor = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const release = validateRelease(readAcceptedPointer().releaseId, { requireAccepted: true });
const d = release.datasets;

if (command === 'status') {
  process.stdout.write(`${stableJson({
    surface: 'private-command-line-workflow',
    releaseId: release.manifest.releaseId,
    locations: d.merchantLocations,
    approvedExactMappings: d.merchantMappings.filter(({ approved, matchConfidence }) => approved && matchConfidence.startsWith('exact-')).length,
    unresolvedCandidates: d.unresolvedMappings.length,
    observations: d.offerObservations.length,
    observationsWithPrice: d.offerObservations.filter(({ priceAmount }) => priceAmount !== null).length,
    availabilityStates: [...new Set(d.offerObservations.map(({ availability }) => availability))],
    publicLivePriceActivation: false,
  })}`);
} else if (command === 'query-plan') {
  const term = valueFor('--term');
  const location = valueFor('--location') ?? 'kroger-location-53100516';
  if (!/^[A-Za-z0-9][A-Za-z0-9 .&'-]{1,60}$/.test(term ?? '')) throw new Error('A bounded product term of 2–61 safe characters is required.');
  const locationRecord = d.merchantLocations.find(({ id }) => id === location);
  if (!locationRecord) throw new Error('Only governed merchant locations may be queried.');
  process.stdout.write(`${stableJson({
    schemaVersion: '1.0.0',
    brokerOnly: true,
    providerId: 'kroger',
    operation: 'search_products',
    parameters: { term, location_id: locationRecord.merchantLocationId, limit: 20 },
    allowedResponseFields: ['productId', 'upc', 'brand', 'description', 'size', 'price', 'fulfillment', 'inventory'],
    customerAuthorization: false,
    writesCanonicalProducts: false,
    next: 'Execute through the Local1 broker, ingest the sanitized envelope into a new immutable release, and review exact identity fields before approval.',
  })}`);
} else if (command === 'review') {
  process.stdout.write(`${stableJson({
    approvedMappings: d.merchantMappings,
    unresolvedCandidates: d.unresolvedMappings,
    observations: d.offerObservations,
    rules: [
      'Approve only exact retailer SKU or exact GTIN identity.',
      'Never relax a probable match into an approval.',
      'Missing price or inventory remains unknown; unavailable requires an explicit provider inventory state.',
      'Canonical product creation requires a separate explicit approval record.',
    ],
  })}`);
} else if (command === 'packet-candidate') {
  const packet = release.packets.find(({ id }) => id === (valueFor('--packet') ?? 'kroger-staple-basket'));
  if (!packet || !packet.sourceIds.includes('kroger')) throw new Error('A governed Kroger packet is required.');
  process.stdout.write(`${stableJson({ state: 'review-candidate-only', packet, canonicalWritePerformed: false })}`);
} else {
  throw new Error('Usage: kroger-research.mjs status|query-plan|review|packet-candidate');
}
