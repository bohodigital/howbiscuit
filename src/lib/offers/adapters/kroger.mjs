import { normalizedOfferSchema } from '../schema.mjs';
import { sourcePolicySchema } from '../source-policy.mjs';

export const KROGER_SOURCE_ID = 'kroger';
export const KROGER_MERCHANT_ID = 'kroger';
export const KROGER_API_ORIGIN = 'https://api.kroger.com';
export const KROGER_CREDENTIAL_SECRETS = Object.freeze(['KROGER_CLIENT_ID', 'KROGER_CLIENT_SECRET']);
export const KROGER_SELECTED_STORE_ID = '53100516';

const providerProductIdPattern = /^\d{13}$/;
const storeIdPattern = /^\d{5,16}$/;
const zipPattern = /^\d{5}$/;

function compact(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function folded(value) {
  return compact(value)
    .toLocaleLowerCase('en-US')
    .replaceAll('®', '')
    .replaceAll('&', 'and')
    .replace(/['’]/g, '');
}

function safeText(value, label, maximum = 120) {
  const text = compact(value);
  if (!text || text.length > maximum || /[\u0000-\u001f\u007f<>{}`]/.test(text)) throw new Error(`Kroger ${label} is malformed.`);
  return text;
}

function providerProductId(value) {
  const id = String(value ?? '');
  if (!providerProductIdPattern.test(id)) throw new Error('Kroger response has an invalid product identifier.');
  return id;
}

function storeId(value) {
  const id = String(value ?? '');
  if (!storeIdPattern.test(id)) throw new Error('Kroger response has an invalid store identifier.');
  return id;
}

function request(pathname, query = {}, extras = {}) {
  if (!pathname.startsWith('/v1/') || pathname.includes('..')) throw new Error('Kroger request path is not fixed.');
  return Object.freeze({
    origin: KROGER_API_ORIGIN,
    pathname,
    method: extras.method || 'GET',
    query: Object.freeze({ ...query }),
    form: extras.form ? Object.freeze({ ...extras.form }) : undefined,
    credentialSecretNames: KROGER_CREDENTIAL_SECRETS,
    credentialPlacement: extras.credentialPlacement || 'server-transport-redacted-bearer',
  });
}

export function krogerTokenRequest() {
  return request('/v1/connect/oauth2/token', {}, {
    method: 'POST',
    form: { grant_type: 'client_credentials', scope: 'product.compact' },
    credentialPlacement: 'server-transport-redacted-basic-auth',
  });
}

export function krogerLocationSearchRequest(zip, radiusMiles = 10, limit = 10) {
  if (!zipPattern.test(String(zip ?? ''))) throw new Error('Kroger store lookup requires a five-digit ZIP code.');
  if (!Number.isInteger(radiusMiles) || radiusMiles < 1 || radiusMiles > 50) throw new Error('Kroger store radius is outside the supported range.');
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error('Kroger store result limit is outside the supported range.');
  return request('/v1/locations', {
    'filter.zipCode.near': zip,
    'filter.radiusInMiles': radiusMiles,
    'filter.limit': limit,
  });
}

export function krogerProductRequest(productIdInput, selectedStoreId) {
  return request(`/v1/products/${providerProductId(productIdInput)}`, {
    'filter.locationId': storeId(selectedStoreId),
  });
}

export function krogerMappingsFromCatalog(catalogInput) {
  const catalog = catalogInput && typeof catalogInput === 'object' ? catalogInput : {};
  if (!Array.isArray(catalog.products) || !Array.isArray(catalog.merchantDestinations)) throw new Error('Canonical product catalog is required.');
  const destinations = new Map(catalog.merchantDestinations
    .filter((destination) => destination.status === 'published' && destination.relationship === 'unpaid' && folded(destination.merchant) === 'kroger')
    .map((destination) => [destination.productId, destination]));
  const mappings = new Map();
  const seen = new Set();
  for (const product of catalog.products) {
    if (product.status !== 'published') continue;
    const retailerMappings = product.manufacturerIdentifiers?.retailerSkus?.filter((entry) => folded(entry.merchant) === 'kroger') || [];
    if (retailerMappings.length === 0) continue;
    if (retailerMappings.length !== 1) throw new Error(`Canonical product ${product.id} must have one Kroger product identifier.`);
    const merchantProductId = providerProductId(retailerMappings[0].sku);
    if (seen.has(merchantProductId)) throw new Error(`Duplicate Kroger product identifier ${merchantProductId}.`);
    const destination = destinations.get(product.id);
    if (!destination || destination.exactVariant !== product.exactVariant) throw new Error(`Canonical product ${product.id} lacks an exact unpaid Kroger destination.`);
    seen.add(merchantProductId);
    mappings.set(product.id, Object.freeze({
      canonicalProductId: product.id,
      merchantId: KROGER_MERCHANT_ID,
      merchantProductId,
      brand: product.brand,
      model: product.model,
      exactVariant: product.exactVariant,
      expectedPackage: product.variantAttributes.package,
      expectedUnitSize: product.variantAttributes['unit-size'] || null,
      expectedNetWeight: product.variantAttributes['net-weight'] || null,
      market: product.variantAttributes.market,
      destinationId: destination.id,
      directUrl: destination.exactUrl,
      matchConfidence: 'exact-retailer-sku',
    }));
  }
  return mappings;
}

export function normalizeKrogerLocations(payload) {
  if (!payload || !Array.isArray(payload.data)) throw new Error('Kroger location response is malformed.');
  return payload.data.map((raw) => {
    const departments = Array.isArray(raw.departments) ? raw.departments : [];
    return Object.freeze({
      storeId: storeId(raw.locationId),
      name: safeText(raw.name, 'store name'),
      chain: safeText(raw.chain, 'store chain'),
      pickupSupported: departments.some((department) => /pickup/i.test(compact(department.name))),
    });
  });
}

export function selectKrogerStore(stores, selectedStoreId, expectedChain = null) {
  const exactId = storeId(selectedStoreId);
  const selected = stores.find((candidate) => candidate.storeId === exactId);
  if (!selected) return null;
  if (expectedChain && folded(selected.chain) !== folded(expectedChain)) throw new Error('Kroger selected store banner does not match the governed store profile.');
  return selected;
}

export function krogerCoverageDisclosure({ requestedZip, stores, selectedStore }) {
  if (!zipPattern.test(String(requestedZip ?? ''))) throw new Error('Kroger coverage disclosure requires a valid ZIP code.');
  const checkedStoreIds = stores.map((store) => store.storeId).sort();
  return Object.freeze({
    coverage: selectedStore ? 'selected-store-only' : 'selected-store-not-returned',
    requestedZip,
    selectedStoreId: selectedStore?.storeId || null,
    selectedBanner: selectedStore?.chain || null,
    checkedStoreIds: Object.freeze(checkedStoreIds),
    disclosure: selectedStore
      ? `Kroger-family coverage is limited to selected store ${selectedStore.storeId}; nearby stores were not priced.`
      : 'The governed selected Kroger-family store was not returned for this ZIP; no local price is available.',
  });
}

export function normalizeKrogerAisles(aislesInput) {
  if (aislesInput == null) return [];
  if (!Array.isArray(aislesInput)) throw new Error('Kroger aisle response is malformed.');
  return aislesInput.slice(0, 5).map((aisle) => Object.freeze({
    description: safeText(aisle.description, 'aisle description', 80),
    number: safeText(aisle.number, 'aisle number', 24),
  }));
}

function canonicalSize(value) {
  return folded(value)
    .replace(/fluid ounces?/g, 'fl oz')
    .replace(/ounces?/g, 'oz')
    .replace(/\bcount\b/g, 'ct');
}

function assertExactProduct(raw, mapping) {
  if (!raw || typeof raw !== 'object') throw new Error('Kroger product response is malformed.');
  if (providerProductId(raw.productId) !== mapping.merchantProductId || providerProductId(raw.upc) !== mapping.merchantProductId) {
    throw new Error('Kroger returned a near-match product identifier.');
  }
  if (folded(raw.brand) !== folded(mapping.brand)) throw new Error('Kroger returned a brand mismatch.');
  if (!folded(raw.description).includes(folded(mapping.model))) throw new Error('Kroger returned a model mismatch.');
  if (!Array.isArray(raw.items) || raw.items.length !== 1) throw new Error('Kroger product response has an ambiguous package list.');
  const item = raw.items[0];
  if (providerProductId(item.itemId) !== mapping.merchantProductId) throw new Error('Kroger returned an item identifier mismatch.');
  const size = canonicalSize(item.size);
  if (mapping.expectedNetWeight && !size.includes(canonicalSize(mapping.expectedNetWeight))) throw new Error('Kroger returned a package-size mismatch.');
  if (mapping.expectedUnitSize && !size.includes(canonicalSize(mapping.expectedUnitSize))) throw new Error('Kroger returned a unit-size mismatch.');
  if (mapping.expectedUnitSize) {
    const expectedCount = String(mapping.expectedPackage).match(/\d+/)?.[0];
    if (!expectedCount || !new RegExp(`\\b${expectedCount}\\s*(?:pk|pack|ct)\\b`).test(size)) throw new Error('Kroger returned a pack-count mismatch.');
  }
  return item;
}

function availability(stockLevel) {
  if (stockLevel == null || stockLevel === '') return 'unknown';
  const value = compact(stockLevel).toUpperCase();
  if (['HIGH', 'MEDIUM'].includes(value)) return 'available';
  if (value === 'LOW') return 'limited';
  if (['TEMPORARILY_OUT_OF_STOCK', 'OUT_OF_STOCK'].includes(value)) return 'unavailable';
  return 'unknown';
}

function fulfillment(value) {
  if (!value || typeof value !== 'object') throw new Error('Kroger fulfillment response is malformed.');
  for (const key of ['curbside', 'delivery', 'shipToHome', 'inStore']) {
    if (![true, false, null, undefined].includes(value[key])) throw new Error('Kroger fulfillment response is malformed.');
  }
  return [value.curbside === true ? 'pickup' : null, value.delivery === true ? 'delivery' : null, value.shipToHome === true ? 'shipping' : null].filter(Boolean);
}

function offerPrice(priceInput) {
  if (!priceInput || !Number.isFinite(priceInput.regular) || priceInput.regular <= 0) throw new Error('Kroger response has no usable price.');
  if (priceInput.promo != null && (!Number.isFinite(priceInput.promo) || priceInput.promo <= 0 || priceInput.promo > priceInput.regular)) {
    throw new Error('Kroger response has an invalid promotional price.');
  }
  return priceInput.promo ?? priceInput.regular;
}

function expiration(policy, observedAt) {
  const limits = [
    policy.refresh.normalTtlSeconds,
    policy.refresh.hardExpirySeconds,
    policy.storage.price.maximumSeconds,
    policy.storage.availability.maximumSeconds,
  ].filter(Number.isFinite);
  return new Date(observedAt.valueOf() + Math.min(...limits) * 1000).toISOString();
}

export function normalizeKrogerProduct(payload, mapping, selectedStore, policyInput, now = new Date()) {
  const policy = sourcePolicySchema.parse(policyInput);
  if (!selectedStore || !selectedStore.pickupSupported) throw new Error('Kroger selected store is unavailable or lacks governed pickup support.');
  const raw = payload?.data;
  const item = assertExactProduct(raw, mapping);
  const observedAt = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(observedAt.valueOf())) throw new Error('Kroger observation time is invalid.');
  const modes = fulfillment(item.fulfillment);
  const stock = availability(item.inventory?.stockLevel);
  const aisles = normalizeKrogerAisles(raw.aisleLocations);
  const restrictions = [
    `Kroger price tied to selected store ${selectedStore.storeId}`,
    'Coverage limited to one selected Kroger-family store',
    ...aisles.map((aisle) => `${aisle.description}: ${aisle.number}`),
  ];
  return normalizedOfferSchema.parse({
    schemaVersion: '1.0.0',
    offerId: `kroger:${mapping.merchantProductId}:${selectedStore.storeId}:new`,
    canonicalProductId: mapping.canonicalProductId,
    merchantId: mapping.merchantId,
    merchantProductId: mapping.merchantProductId,
    storeId: selectedStore.storeId,
    price: { amount: offerPrice(item.price), currency: 'USD' },
    condition: 'new',
    quantity: 1,
    bundle: mapping.expectedPackage,
    fulfillment: modes,
    pickupVerified: modes.includes('pickup') ? true : item.fulfillment.curbside === false ? false : null,
    shippingCost: null,
    membershipRequired: null,
    couponRequired: null,
    subscriptionRequired: null,
    tradeInRequired: false,
    financingRequired: null,
    observedAt: observedAt.toISOString(),
    expiresAt: expiration(policy, observedAt),
    sourceId: KROGER_SOURCE_ID,
    sourceMethod: 'official-api',
    matchConfidence: mapping.matchConfidence,
    relationship: 'unpaid',
    displayRestrictions: restrictions,
    availabilityState: stock,
  });
}

export function classifyKrogerFailure(error) {
  if (error?.code === 'KROGER_AUTHENTICATION_FAILED' || [401, 403].includes(error?.status)) return 'authentication-failed';
  if (error?.code === 'KROGER_QUOTA_EXCEEDED' || error?.status === 429) return 'quota-limited';
  if (Number(error?.status) >= 500) return 'provider-outage';
  if (/near-match|brand mismatch|model mismatch|identifier mismatch|package-size mismatch|unit-size mismatch|pack-count mismatch|banner does not match/i.test(error?.message || '')) return 'mapping-error';
  if (/malformed|ambiguous package|no usable price|invalid promotional price|invalid .*identifier/i.test(error?.message || '')) return 'malformed-response';
  return 'provider-outage';
}

export function createKrogerAdapter({ executeRequest, catalog, policy: policyInput, selectedStoreId = KROGER_SELECTED_STORE_ID, selectedChain = 'MARIANOS', now = () => new Date() }) {
  const policy = sourcePolicySchema.parse(policyInput);
  if (policy.sourceId !== KROGER_SOURCE_ID) throw new Error('Kroger adapter requires the Kroger source policy.');
  const mappings = krogerMappingsFromCatalog(catalog);
  let healthState = typeof executeRequest === 'function' ? 'healthy' : 'authentication-failed';
  let lastCoverage = null;
  return Object.freeze({
    sourceId: KROGER_SOURCE_ID,
    async health() { return healthState; },
    async coverage() { return lastCoverage; },
    async lookup(query) {
      try {
        const mapping = mappings.get(query.productId);
        if (!mapping || query.condition !== 'new') return [];
        if (!query.zip) {
          lastCoverage = Object.freeze({ coverage: 'zip-required', selectedStoreId: null, checkedStoreIds: Object.freeze([]), disclosure: 'A ZIP code and explicit store selection are required for Kroger prices.' });
          return [];
        }
        if (typeof executeRequest !== 'function') throw Object.assign(new Error('Kroger request transport is unavailable.'), { code: 'KROGER_AUTHENTICATION_FAILED' });
        const locationPayload = await executeRequest(krogerLocationSearchRequest(query.zip, Math.min(query.radiusMiles || 10, 50), 10));
        const stores = normalizeKrogerLocations(locationPayload);
        const selectedStore = selectKrogerStore(stores, selectedStoreId, selectedChain);
        lastCoverage = krogerCoverageDisclosure({ requestedZip: query.zip, stores, selectedStore });
        if (!selectedStore) return [];
        const productPayload = await executeRequest(krogerProductRequest(mapping.merchantProductId, selectedStore.storeId));
        const offer = normalizeKrogerProduct(productPayload, mapping, selectedStore, policy, now());
        healthState = 'healthy';
        return query.fulfillment && !offer.fulfillment.includes(query.fulfillment) ? [] : [offer];
      } catch (error) {
        healthState = classifyKrogerFailure(error);
        throw error;
      }
    },
  });
}
