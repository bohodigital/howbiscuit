import { assertAdapter } from './adapter.mjs';
import { circuitState, quotaState, requestFingerprint } from './quota.mjs';
import { adapterHealthState, normalizedOfferSchema, offerQuerySchema } from './schema.mjs';
import { evaluateSourcePolicy } from './source-policy.mjs';

const MAX_CLOCK_SKEW_MILLISECONDS = 5 * 60 * 1000;

function coverageStatus(coverage, sourceId, status) {
  coverage.push({ sourceId, status });
}

function mappingAllowsOffer(mapping, offer, policy, now) {
  if (!mapping || mapping.status !== 'active') return false;
  if (mapping.canonicalProductId !== offer.canonicalProductId) return false;
  if (mapping.matchConfidence !== offer.matchConfidence) return false;
  if (!policy.matching.acceptedConfidence.includes(mapping.matchConfidence)) return false;
  if (typeof mapping.reviewedBy !== 'string' || !mapping.reviewedBy.trim()) return false;
  if (!mapping.reviewedAt || Number.isNaN(Date.parse(mapping.reviewedAt)) || Date.parse(mapping.reviewedAt) > now.valueOf()) return false;
  try {
    const evidence = typeof mapping.matchEvidenceJson === 'string' ? JSON.parse(mapping.matchEvidenceJson) : mapping.matchEvidenceJson;
    if (!evidence || typeof evidence !== 'object' || evidence.reviewed !== true || !Array.isArray(evidence.evidenceIds) || evidence.evidenceIds.length === 0) return false;
    if (mapping.matchConfidence === 'exact-retailer-sku') return evidence.retailerSku === offer.merchantProductId;
    if (mapping.matchConfidence === 'exact-gtin') return /^\d{8,14}$/.test(evidence.gtin || '');
    if (mapping.matchConfidence === 'exact-mpn-brand') return Boolean(evidence.mpn && evidence.brand);
    if (mapping.matchConfidence === 'exact-asin-child') return /^[A-Z0-9]{10}$/.test(evidence.asinChild || '');
    return mapping.matchConfidence === 'verified-model-variant' && Boolean(evidence.model && evidence.exactVariant);
  } catch {
    return false;
  }
}

function controlsAreValid(controls) {
  if (!controls || typeof controls.reserve !== 'function' || typeof controls.recordSuccess !== 'function' || typeof controls.recordFailure !== 'function') return false;
  const usageFields = ['monthlyCostUsd', 'monthlyRequests', 'dailyRequests', 'currentSecondRequests', 'projectedRequestCostUsd'];
  if (!controls.usage || usageFields.some((field) => !Number.isFinite(controls.usage[field]) || controls.usage[field] < 0)) return false;
  return controls.circuit && Number.isInteger(controls.circuit.consecutiveFailures) && controls.circuit.consecutiveFailures >= 0;
}

async function persistFailureOrLatch(controls, sourceId, status, failClosedSources) {
  try {
    if (await controls.recordFailure(status) !== true) throw new Error('Failure state was not persisted.');
    return true;
  } catch {
    failClosedSources.add(sourceId);
    return false;
  }
}

export function enforceOfferPolicy(offerInput, policy, now = new Date(), mode = 'fixture-only') {
  const offer = normalizedOfferSchema.parse(offerInput);
  const observedAt = Date.parse(offer.observedAt);
  if (observedAt > now.valueOf() + MAX_CLOCK_SKEW_MILLISECONDS) return null;
  if (mode === 'fixture-only' && (policy.legalBasis.type !== 'fixture' || offer.sourceMethod !== 'fixture' || offer.relationship !== 'unpaid')) return null;
  const policyExpiry = observedAt + policy.refresh.hardExpirySeconds * 1000;
  const effectiveExpiry = Math.min(Date.parse(offer.expiresAt), policyExpiry);
  if (effectiveExpiry <= now.valueOf()) return null;
  return Object.freeze({ ...offer, expiresAt: new Date(effectiveExpiry).toISOString() });
}

export async function lookupOffers({
  query: queryInput,
  catalog,
  adapters,
  policies,
  runtimeBySource = {},
  controlResolver,
  mappingResolver,
  now = new Date(),
  maximumAdapters = 4,
  mode = 'fixture-only',
  failClosedSources = new Set(),
}) {
  const query = offerQuerySchema.parse(queryInput);
  const product = catalog.find((candidate) => candidate.productId === query.productId);
  if (!product || product.status !== 'published') throw new Error('Unknown or unavailable canonical product.');
  if (adapters.length > maximumAdapters) throw new Error('Adapter fan-out limit exceeded.');
  if (typeof controlResolver !== 'function' || typeof mappingResolver !== 'function') throw new Error('Offer controls and mapping authority are required.');

  const coverage = [];
  const offers = [];
  for (const adapterInput of adapters) {
    const adapter = assertAdapter(adapterInput);
    if (failClosedSources.has(adapter.sourceId)) {
      coverageStatus(coverage, adapter.sourceId, 'degraded');
      continue;
    }
    const policy = policies.get(adapter.sourceId);
    if (!policy) {
      coverageStatus(coverage, adapter.sourceId, 'policy-disabled');
      continue;
    }
    const policyState = evaluateSourcePolicy(policy, runtimeBySource[adapter.sourceId], now);
    if (policyState !== 'healthy') {
      coverageStatus(coverage, adapter.sourceId, policyState);
      continue;
    }
    if (mode === 'fixture-only' && policy.legalBasis.type !== 'fixture') {
      coverageStatus(coverage, adapter.sourceId, 'policy-disabled');
      continue;
    }

    const controls = await controlResolver(adapter.sourceId, query);
    if (!controlsAreValid(controls)) {
      coverageStatus(coverage, adapter.sourceId, 'policy-disabled');
      continue;
    }
    const circuit = circuitState(controls.circuit, policy, now);
    if (circuit === 'open') {
      coverageStatus(coverage, adapter.sourceId, 'degraded');
      continue;
    }
    const quota = quotaState(policy, controls.usage);
    if (quota !== 'available') {
      coverageStatus(coverage, adapter.sourceId, quota);
      continue;
    }

    let health;
    try {
      health = adapterHealthState.parse(await adapter.health());
    } catch {
      await persistFailureOrLatch(controls, adapter.sourceId, 'malformed-response', failClosedSources);
      coverageStatus(coverage, adapter.sourceId, 'malformed-response');
      continue;
    }
    if (health !== 'healthy') {
      await persistFailureOrLatch(controls, adapter.sourceId, health, failClosedSources);
      coverageStatus(coverage, adapter.sourceId, health);
      continue;
    }
    const fingerprint = await requestFingerprint({ sourceId: adapter.sourceId, ...query });
    if (await controls.reserve(fingerprint) !== true) {
      coverageStatus(coverage, adapter.sourceId, 'quota-limited');
      continue;
    }

    try {
      const results = await adapter.lookup(query);
      const accepted = [];
      for (const candidate of results) {
        const offer = enforceOfferPolicy(candidate, policy, now, mode);
        if (!offer || offer.sourceId !== adapter.sourceId || offer.canonicalProductId !== query.productId) continue;
        const mapping = await mappingResolver(offer.merchantId, offer.merchantProductId);
        if (!mappingAllowsOffer(mapping, offer, policy, now)) continue;
        accepted.push(offer);
      }
      if (await controls.recordSuccess() !== true) throw new Error('Success state was not persisted.');
      offers.push(...accepted);
      coverageStatus(coverage, adapter.sourceId, 'healthy');
    } catch {
      await persistFailureOrLatch(controls, adapter.sourceId, 'provider-outage', failClosedSources);
      coverageStatus(coverage, adapter.sourceId, 'provider-outage');
    }
  }

  return Object.freeze({
    schemaVersion: '1.0.0',
    canonicalProductId: query.productId,
    location: query.zip ? { zip: query.zip, metroSlug: null } : null,
    checkedAt: now.toISOString(),
    coverage,
    offers,
    fallbacks: [],
  });
}
