import { z } from 'zod';

export const OFFER_SCHEMA_VERSION = '1.0.0';
export const identifier = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const boundedText = z.string().trim().min(1).max(256).refine((value) => !/[\u0000-\u001f\u007f<>{}`]/.test(value), 'Unsafe text');
const instant = z.iso.datetime({ offset: true });
const triState = z.boolean().nullable();

export const adapterHealthStates = Object.freeze([
  'disabled', 'initializing', 'healthy', 'degraded', 'quota-limited',
  'budget-exhausted', 'authentication-failed', 'terms-review-required',
  'policy-disabled', 'provider-outage', 'malformed-response', 'mapping-error', 'retired',
]);
export const adapterHealthState = z.enum(adapterHealthStates);
export const publicSourceStatusesSchema = z.array(z.object({
  sourceId: identifier,
  status: adapterHealthState,
}).strict()).max(25);

export const matchConfidenceValues = Object.freeze([
  'exact-retailer-sku', 'exact-gtin', 'exact-mpn-brand', 'exact-asin-child',
  'verified-model-variant', 'probable', 'unresolved', 'rejected',
]);
export const comparableMatchConfidence = new Set(matchConfidenceValues.slice(0, 5));
export const matchConfidence = z.enum(matchConfidenceValues);

export const normalizedOfferSchema = z.object({
  schemaVersion: z.literal(OFFER_SCHEMA_VERSION),
  offerId: z.string().trim().min(1).max(256),
  canonicalProductId: identifier,
  merchantId: identifier,
  merchantProductId: boundedText,
  storeId: boundedText.nullable(),
  price: z.object({ amount: z.number().positive(), currency: z.string().regex(/^[A-Z]{3}$/) }).strict(),
  condition: z.enum(['new', 'open-box', 'refurbished', 'used']),
  quantity: z.number().int().positive(),
  bundle: boundedText,
  fulfillment: z.array(z.enum(['pickup', 'shipping', 'delivery'])).max(3),
  pickupVerified: triState,
  shippingCost: z.number().nonnegative().nullable(),
  membershipRequired: triState,
  couponRequired: triState,
  subscriptionRequired: triState,
  tradeInRequired: triState,
  financingRequired: triState,
  observedAt: instant,
  expiresAt: instant,
  sourceId: identifier,
  sourceMethod: z.enum(['official-api', 'licensed-feed', 'reviewed-public-dataset', 'reviewed-manual', 'fixture']),
  matchConfidence,
  relationship: z.enum(['unpaid', 'affiliate-pending', 'affiliate-approved-disabled', 'affiliate-approved-preview', 'affiliate-approved-public', 'sponsored', 'retired']),
  displayRestrictions: z.array(boundedText).max(20),
  availabilityState: z.enum(['available', 'unavailable', 'limited', 'unknown']),
}).strict().superRefine((offer, context) => {
  if (Date.parse(offer.expiresAt) <= Date.parse(offer.observedAt)) {
    context.addIssue({ code: 'custom', path: ['expiresAt'], message: 'Offer expiration must follow observation time.' });
  }
  if (!comparableMatchConfidence.has(offer.matchConfidence)) {
    context.addIssue({ code: 'custom', path: ['matchConfidence'], message: 'Public offers require exact or reviewed match evidence.' });
  }
  if (offer.fulfillment.includes('pickup') && offer.storeId === null) {
    context.addIssue({ code: 'custom', path: ['storeId'], message: 'Pickup offers require an exact store ID.' });
  }
});

export const offerQuerySchema = z.object({
  productId: identifier,
  zip: z.string().regex(/^\d{5}$/).optional(),
  radiusMiles: z.coerce.number().int().min(1).max(50).default(25),
  fulfillment: z.enum(['pickup', 'shipping', 'delivery']).optional(),
  condition: z.enum(['new', 'open-box', 'refurbished', 'used']).default('new'),
}).strict();

export function isOfferCurrent(offer, now = new Date()) {
  return Date.parse(normalizedOfferSchema.parse(offer).expiresAt) > now.valueOf();
}

export function suppressExpiredOffers(offers, now = new Date()) {
  return offers.map((offer) => normalizedOfferSchema.parse(offer)).filter((offer) => Date.parse(offer.expiresAt) > now.valueOf());
}
