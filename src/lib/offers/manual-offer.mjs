import { z } from 'zod';

import { normalizedOfferSchema } from './schema.mjs';
import { evaluateSourcePolicy } from './source-policy.mjs';

const identifier = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const manualOfferInputSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  offerId: z.string().min(1).max(256),
  canonicalProductId: identifier,
  merchantId: identifier,
  merchantProductId: z.string().min(1).max(256),
  price: z.object({ amount: z.number().positive(), currency: z.string().regex(/^[A-Z]{3}$/) }).strict(),
  condition: z.enum(['new', 'open-box', 'refurbished', 'used']),
  quantity: z.number().int().positive(),
  bundle: z.string().min(1).max(256),
  fulfillment: z.array(z.enum(['pickup', 'shipping', 'delivery'])).max(3),
  observedAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
  reviewerId: identifier,
  sourcePolicyId: identifier,
  evidenceId: identifier,
  displayAllowed: z.literal(true),
  archiveAllowed: z.literal(false),
  pickupVerified: z.boolean().nullable(),
  storeId: z.string().min(1).max(256).nullable(),
  availabilityState: z.enum(['available', 'unavailable', 'limited', 'unknown']),
}).strict();

export function reviewManualOffer(input, { canonicalProducts, policies, runtimeBySource, mappingResolver, now = new Date() }) {
  const manual = manualOfferInputSchema.parse(input);
  const product = canonicalProducts.find((candidate) => candidate.productId === manual.canonicalProductId && candidate.status === 'published');
  if (!product) throw new Error('Manual offer references an unknown or unavailable canonical product.');
  const policy = policies.get(manual.sourcePolicyId);
  if (!policy || policy.legalBasis.type !== 'reviewed-manual') throw new Error('Manual offer requires an approved reviewed-manual source policy.');
  if (!policy.scope.merchantIds.includes(manual.merchantId)) throw new Error('Manual-offer source policy is not authorized for merchant.');
  if (evaluateSourcePolicy(policy, runtimeBySource[manual.sourcePolicyId], now) !== 'healthy') throw new Error('Manual-offer source policy is not active.');
  if (policy.storage.price.allowed !== true || policy.storage.productIdentifier.allowed !== true) throw new Error('Manual-offer source policy prohibits required field storage.');
  if (manual.storeId !== null && policy.storage.storeIdentifier.allowed !== true) throw new Error('Manual-offer source policy prohibits store identifier storage.');
  if (manual.availabilityState !== 'unknown' && policy.storage.availability.allowed !== true) throw new Error('Manual-offer source policy prohibits availability storage.');
  if (Date.parse(manual.observedAt) > now.valueOf()) throw new Error('Manual offer observation cannot be in the future.');
  const retentionCeilings = [policy.refresh.hardExpirySeconds, policy.storage.productIdentifier.maximumSeconds, policy.storage.price.maximumSeconds];
  if (manual.storeId !== null) retentionCeilings.push(policy.storage.storeIdentifier.maximumSeconds);
  if (manual.availabilityState !== 'unknown') retentionCeilings.push(policy.storage.availability.maximumSeconds);
  const maximumRetentionSeconds = Math.min(...retentionCeilings.filter((value) => value !== null));
  if (Date.parse(manual.expiresAt) > Date.parse(manual.observedAt) + maximumRetentionSeconds * 1000) throw new Error('Manual offer exceeds policy storage retention or hard expiration.');
  if (Date.parse(manual.expiresAt) <= now.valueOf()) throw new Error('Manual offer is expired.');
  const mapping = mappingResolver(manual.merchantId, manual.merchantProductId);
  if (!mapping || mapping.canonicalProductId !== manual.canonicalProductId || mapping.status !== 'active') throw new Error('Manual offer lacks an active canonical merchant mapping.');
  if (!policy.matching.acceptedConfidence.includes(mapping.matchConfidence)) throw new Error('Manual offer mapping confidence is not approved by policy.');
  if (!mapping.reviewedBy || !mapping.reviewedAt || Date.parse(mapping.reviewedAt) > now.valueOf()) throw new Error('Manual offer mapping lacks a current identified review.');
  let mappingEvidence;
  try { mappingEvidence = typeof mapping.matchEvidenceJson === 'string' ? JSON.parse(mapping.matchEvidenceJson) : mapping.matchEvidenceJson; } catch { throw new Error('Manual offer mapping evidence is malformed.'); }
  if (!mappingEvidence?.reviewed || !Array.isArray(mappingEvidence.evidenceIds) || mappingEvidence.evidenceIds.length === 0) throw new Error('Manual offer mapping lacks reviewed evidence.');
  if (mapping.matchConfidence === 'exact-retailer-sku' && mappingEvidence.retailerSku !== manual.merchantProductId) throw new Error('Manual offer retailer SKU evidence does not match.');
  if (manual.availabilityState !== 'unknown' && manual.pickupVerified !== true) throw new Error('Manual availability must remain unknown unless explicitly verified.');
  const offer = normalizedOfferSchema.parse({
    schemaVersion: '1.0.0', offerId: manual.offerId, canonicalProductId: manual.canonicalProductId,
    merchantId: manual.merchantId, merchantProductId: manual.merchantProductId, storeId: manual.storeId,
    price: manual.price, condition: manual.condition, quantity: manual.quantity, bundle: manual.bundle,
    fulfillment: manual.fulfillment, pickupVerified: manual.pickupVerified, shippingCost: null,
    membershipRequired: null, couponRequired: null, subscriptionRequired: null, tradeInRequired: null,
    financingRequired: null, observedAt: manual.observedAt, expiresAt: manual.expiresAt,
    sourceId: manual.sourcePolicyId, sourceMethod: 'reviewed-manual', matchConfidence: mapping.matchConfidence,
    relationship: 'unpaid', displayRestrictions: ['manual-observation', `evidence:${manual.evidenceId}`],
    availabilityState: manual.availabilityState,
  });
  return Object.freeze({
    offer,
    review: { offerId: manual.offerId, canonicalProductId: manual.canonicalProductId, sourceId: manual.sourcePolicyId, reviewerId: manual.reviewerId, evidenceId: manual.evidenceId, observedAt: manual.observedAt, expiresAt: manual.expiresAt, status: 'approved-expiring' },
  });
}

export function manualOfferStatements(db, reviewed) {
  const { offer, review } = reviewed;
  const normalized = JSON.stringify(offer);
  return [
    db.prepare(`INSERT INTO manual_offer_reviews (
      offer_id, canonical_product_id, source_id, reviewer_id, evidence_id,
      normalized_offer_json, observed_at, expires_at, status
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
    ON CONFLICT(offer_id) DO UPDATE SET canonical_product_id=excluded.canonical_product_id,
      source_id=excluded.source_id, reviewer_id=excluded.reviewer_id,
      evidence_id=excluded.evidence_id, normalized_offer_json=excluded.normalized_offer_json,
      observed_at=excluded.observed_at, expires_at=excluded.expires_at, status=excluded.status`).bind(
      review.offerId, review.canonicalProductId, review.sourceId, review.reviewerId, review.evidenceId,
      normalized, review.observedAt, review.expiresAt, review.status,
    ),
    db.prepare(`INSERT INTO offer_snapshots (
      offer_id, canonical_product_id, merchant_id, source_id, normalized_offer_json,
      observed_at, expires_at, idempotency_key
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
    ON CONFLICT(offer_id) DO UPDATE SET canonical_product_id=excluded.canonical_product_id,
      merchant_id=excluded.merchant_id, source_id=excluded.source_id,
      normalized_offer_json=excluded.normalized_offer_json,
      observed_at=excluded.observed_at, expires_at=excluded.expires_at,
      idempotency_key=excluded.idempotency_key`).bind(
      offer.offerId, offer.canonicalProductId, offer.merchantId, offer.sourceId, normalized,
      offer.observedAt, offer.expiresAt, `${offer.sourceId}:${offer.offerId}:${offer.observedAt}`,
    ),
  ];
}

export async function saveReviewedManualOffer(db, reviewed) {
  if (!db || typeof db.batch !== 'function') throw new Error('A D1-compatible batch API is required.');
  return db.batch(manualOfferStatements(db, reviewed));
}

export { manualOfferInputSchema };
