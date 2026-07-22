import { normalizedOfferSchema } from '../schema.mjs';
import { sourcePolicySchema } from '../source-policy.mjs';

export const BEST_BUY_SOURCE_ID = 'best-buy';
export const BEST_BUY_MERCHANT_ID = 'best-buy';
export const BEST_BUY_API_ORIGIN = 'https://api.bestbuy.com';
export const BEST_BUY_CREDENTIAL_SECRET = 'BEST_BUY_API_KEY';

const skuPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;
const zipPattern = /^\d{5}$/;

function asSku(value) {
  const sku = String(value ?? '');
  if (!skuPattern.test(sku)) throw new Error('Best Buy response has an invalid SKU.');
  return sku;
}

function instant(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error('Best Buy observation time is invalid.');
  return date;
}

function expiration(policy, observedAt, kind = 'price') {
  const limits = [policy.refresh.normalTtlSeconds, policy.refresh.hardExpirySeconds];
  const fieldLimit = policy.storage[kind]?.maximumSeconds;
  if (Number.isFinite(fieldLimit)) limits.push(fieldLimit);
  return new Date(observedAt.valueOf() + Math.min(...limits) * 1000).toISOString();
}

function request(pathname, query = {}) {
  if (!pathname.startsWith('/') || pathname.includes('..')) throw new Error('Best Buy request path is not fixed.');
  return Object.freeze({
    origin: BEST_BUY_API_ORIGIN,
    pathname,
    query: Object.freeze({ ...query }),
    credentialSecretName: BEST_BUY_CREDENTIAL_SECRET,
    credentialPlacement: 'server-transport-redacted-query',
  });
}

export function bestBuyProductRequest(skuInput) {
  const sku = asSku(skuInput);
  return request(`/v1/products/${sku}.json`, {
    format: 'json',
    show: 'sku,modelNumber,name,salePrice,regularPrice,onlineAvailability,inStoreAvailability,inStorePickup,onlineAvailabilityUpdateDate,url',
  });
}

export function bestBuyOpenBoxRequest(skuInput) {
  return request(`/beta/products/${asSku(skuInput)}/openBox`);
}

export function bestBuyAvailabilityRequest(skuInput, zip) {
  if (!zipPattern.test(zip)) throw new Error('Best Buy pickup lookup requires a five-digit ZIP code.');
  return request(`/v1/products/${asSku(skuInput)}/stores.json`, { postalCode: zip });
}

export function bestBuyMappingsFromCatalog(catalogInput) {
  const catalog = catalogInput && typeof catalogInput === 'object' ? catalogInput : {};
  if (!Array.isArray(catalog.products) || !Array.isArray(catalog.merchantDestinations)) throw new Error('Canonical product catalog is required.');
  const destinations = new Map(catalog.merchantDestinations
    .filter((destination) => destination.status === 'published' && destination.relationship === 'unpaid' && destination.merchant.toLowerCase() === 'best buy')
    .map((destination) => [destination.productId, destination]));
  const byProductId = new Map();
  const seenSkus = new Set();
  for (const product of catalog.products) {
    if (product.status !== 'published') continue;
    const retailerMappings = product.manufacturerIdentifiers?.retailerSkus?.filter((mapping) => mapping.merchant.toLowerCase() === 'best buy') || [];
    if (retailerMappings.length === 0) continue;
    if (retailerMappings.length !== 1) throw new Error(`Canonical product ${product.id} must have one Best Buy SKU.`);
    const merchantProductId = asSku(retailerMappings[0].sku);
    if (seenSkus.has(merchantProductId)) throw new Error(`Duplicate Best Buy SKU ${merchantProductId}.`);
    const destination = destinations.get(product.id);
    if (!destination || destination.exactVariant !== product.exactVariant) throw new Error(`Canonical product ${product.id} lacks an exact unpaid Best Buy destination.`);
    seenSkus.add(merchantProductId);
    byProductId.set(product.id, Object.freeze({
      canonicalProductId: product.id,
      merchantId: BEST_BUY_MERCHANT_ID,
      merchantProductId,
      modelNumbers: Object.freeze([...new Set([product.model, product.manufacturerIdentifiers.mpn].filter(Boolean))]),
      exactVariant: product.exactVariant,
      expectedPackage: product.variantAttributes.package,
      market: product.variantAttributes.market,
      destinationId: destination.id,
      directUrl: destination.exactUrl,
      matchConfidence: 'exact-retailer-sku',
    }));
  }
  return byProductId;
}

function assertExactProduct(raw, mapping, expectedCondition = 'new') {
  if (!raw || typeof raw !== 'object') throw new Error('Best Buy response is malformed.');
  if (asSku(raw.sku) !== mapping.merchantProductId) throw new Error('Best Buy returned a near-match SKU.');
  if (!mapping.modelNumbers.includes(String(raw.modelNumber || '').trim())) throw new Error('Best Buy returned a model mismatch.');
  if (raw.bundle != null && String(raw.bundle).trim().toLowerCase() !== String(mapping.expectedPackage).trim().toLowerCase()) throw new Error('Best Buy returned a bundle mismatch.');
  if (raw.market != null && String(raw.market).toUpperCase() !== mapping.market) throw new Error('Best Buy returned a market mismatch.');
  if (raw.condition != null && String(raw.condition).trim().toLowerCase() !== expectedCondition) throw new Error('Best Buy returned a condition mismatch.');
}

function price(raw) {
  if (!Number.isFinite(raw.salePrice) || raw.salePrice <= 0) throw new Error('Best Buy response has no usable price.');
  return raw.salePrice;
}

function baseOffer({ mapping, amount, observedAt, expiresAt, condition, suffix, fulfillment, storeId = null, pickupVerified = null, availabilityState, restrictions = [] }) {
  return normalizedOfferSchema.parse({
    schemaVersion: '1.0.0',
    offerId: `best-buy:${mapping.merchantProductId}:${suffix}`,
    canonicalProductId: mapping.canonicalProductId,
    merchantId: mapping.merchantId,
    merchantProductId: mapping.merchantProductId,
    storeId,
    price: { amount, currency: 'USD' },
    condition,
    quantity: 1,
    bundle: mapping.expectedPackage,
    fulfillment,
    pickupVerified,
    shippingCost: null,
    membershipRequired: null,
    couponRequired: null,
    subscriptionRequired: null,
    tradeInRequired: null,
    financingRequired: null,
    observedAt: observedAt.toISOString(),
    expiresAt,
    sourceId: BEST_BUY_SOURCE_ID,
    sourceMethod: 'official-api',
    matchConfidence: mapping.matchConfidence,
    relationship: 'unpaid',
    displayRestrictions: ['Best Buy attribution required', ...restrictions],
    availabilityState,
  });
}

export function normalizeBestBuyProduct(raw, mapping, policyInput, now = new Date()) {
  const policy = sourcePolicySchema.parse(policyInput);
  assertExactProduct(raw, mapping);
  const observedAt = instant(now);
  const online = raw.onlineAvailability;
  if (online !== true && online !== false && online !== null && online !== undefined) throw new Error('Best Buy online availability is malformed.');
  return baseOffer({
    mapping,
    amount: price(raw),
    observedAt,
    expiresAt: expiration(policy, observedAt),
    condition: 'new',
    suffix: 'online:new',
    fulfillment: online === true ? ['shipping'] : [],
    availabilityState: online === true ? 'available' : online === false ? 'unavailable' : 'unknown',
  });
}

export function normalizeBestBuyPickup(productRaw, availabilityRaw, mapping, policyInput, now = new Date()) {
  const policy = sourcePolicySchema.parse(policyInput);
  assertExactProduct(productRaw, mapping);
  if (!availabilityRaw || !Array.isArray(availabilityRaw.stores)) throw new Error('Best Buy pickup response is malformed.');
  const observedAt = instant(now);
  const expiresAt = expiration(policy, observedAt, 'availability');
  return availabilityRaw.stores.map((store) => {
    const storeId = asSku(store.storeID ?? store.storeId);
    return baseOffer({
      mapping,
      amount: price(productRaw),
      observedAt,
      expiresAt,
      condition: 'new',
      suffix: `${storeId}:new`,
      fulfillment: ['pickup'],
      storeId,
      pickupVerified: true,
      availabilityState: store.lowStock === true ? 'limited' : 'available',
      restrictions: store.lowStock === true ? ['Low stock reported'] : [],
    });
  });
}

export function normalizeBestBuyOpenBox(payload, mapping, policyInput, now = new Date()) {
  const policy = sourcePolicySchema.parse(policyInput);
  if (!payload || !Array.isArray(payload.results)) throw new Error('Best Buy open-box response is malformed.');
  const observedAt = instant(now);
  const expiresAt = expiration(policy, observedAt);
  const result = payload.results.find((candidate) => String(candidate.sku) === mapping.merchantProductId);
  if (!result) return [];
  if (!Array.isArray(result.offers)) throw new Error('Best Buy open-box offers are malformed.');
  return result.offers.map((offer, index) => {
    const providerCondition = String(offer.condition || '').toLowerCase();
    if (!['excellent', 'certified'].includes(providerCondition)) throw new Error('Best Buy returned an unsupported open-box condition.');
    const amount = offer.prices?.current;
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Best Buy open-box response has no usable price.');
    return baseOffer({
      mapping,
      amount,
      observedAt,
      expiresAt,
      condition: 'open-box',
      suffix: `open-box:${providerCondition}:${index}`,
      fulfillment: ['shipping'],
      availabilityState: 'available',
      restrictions: [`Best Buy open-box condition: ${providerCondition}`],
    });
  });
}

export function classifyBestBuyFailure(error) {
  if (error?.code === 'BEST_BUY_AUTHENTICATION_FAILED' || error?.status === 401) return 'authentication-failed';
  if (error?.code === 'BEST_BUY_QUOTA_EXCEEDED' || error?.status === 429) return 'quota-limited';
  if (Number(error?.status) >= 500) return 'provider-outage';
  if (/near-match|model mismatch|bundle mismatch|market mismatch|condition mismatch/i.test(error?.message || '')) return 'mapping-error';
  if (/malformed|no usable price|invalid SKU|unsupported open-box condition/i.test(error?.message || '')) return 'malformed-response';
  return 'provider-outage';
}

export function createBestBuyAdapter({ executeRequest, catalog, policy: policyInput, now = () => new Date() }) {
  const policy = sourcePolicySchema.parse(policyInput);
  if (policy.sourceId !== BEST_BUY_SOURCE_ID) throw new Error('Best Buy adapter requires the Best Buy source policy.');
  const mappings = bestBuyMappingsFromCatalog(catalog);
  let healthState = typeof executeRequest === 'function' ? 'healthy' : 'authentication-failed';
  return Object.freeze({
    sourceId: BEST_BUY_SOURCE_ID,
    async health() { return healthState; },
    async lookup(query) {
      try {
        const mapping = mappings.get(query.productId);
        if (!mapping) return [];
        if (typeof executeRequest !== 'function') throw Object.assign(new Error('Best Buy request transport is unavailable.'), { code: 'BEST_BUY_AUTHENTICATION_FAILED' });
        if (query.condition === 'open-box') {
          const response = await executeRequest(bestBuyOpenBoxRequest(mapping.merchantProductId));
          const offers = normalizeBestBuyOpenBox(response, mapping, policy, now());
          healthState = 'healthy';
          return offers;
        }
        if (query.condition !== 'new') return [];
        const product = await executeRequest(bestBuyProductRequest(mapping.merchantProductId));
        const offers = [normalizeBestBuyProduct(product, mapping, policy, now())];
        if (query.zip && (!query.fulfillment || query.fulfillment === 'pickup')) {
          const availability = await executeRequest(bestBuyAvailabilityRequest(mapping.merchantProductId, query.zip));
          offers.push(...normalizeBestBuyPickup(product, availability, mapping, policy, now()));
        }
        healthState = 'healthy';
        return query.fulfillment ? offers.filter((offer) => offer.fulfillment.includes(query.fulfillment)) : offers;
      } catch (error) {
        healthState = classifyBestBuyFailure(error);
        throw error;
      }
    },
  });
}
