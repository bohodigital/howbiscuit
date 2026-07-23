export const GOOGLE_FUEL_SOURCE_ID = 'google-places-fuel';
export const GOOGLE_PLACES_ORIGIN = 'https://places.googleapis.com';
export const GOOGLE_PLACES_CREDENTIAL_SECRET = 'GOOGLE_PLACES_API_KEY';

const placeIdPattern = /^[A-Za-z0-9_-]{10,200}$/;
const fuelTypes = new Set(['DIESEL', 'DIESEL_PLUS', 'REGULAR_UNLEADED', 'MIDGRADE', 'PREMIUM', 'SP91', 'SP91_E10', 'SP92', 'SP95', 'SP95_E10', 'SP98', 'SP99', 'SP100', 'LPG', 'E80', 'E85', 'E100', 'METHANE', 'BIO_DIESEL', 'TRUCK_DIESEL']);

function placeId(value) {
  const id = String(value ?? '');
  if (!placeIdPattern.test(id)) throw new Error('Google Places request has an invalid place ID.');
  return id;
}

function safeText(value, label, maximum = 160) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!text || text.length > maximum || /[\u0000-\u001f\u007f<>{}`]/.test(text)) throw new Error(`Google Places ${label} is malformed.`);
  return text;
}

function mapsUri(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !/(^|\.)google\.com$/.test(url.hostname) || !url.pathname.startsWith('/maps')) throw new Error('Google Places Maps URI is malformed.');
  return url.href;
}

export function googlePlaceFuelRequest(placeIdInput) {
  const id = placeId(placeIdInput);
  return Object.freeze({
    origin: GOOGLE_PLACES_ORIGIN,
    pathname: `/v1/places/${id}`,
    method: 'GET',
    headers: Object.freeze({ 'X-Goog-FieldMask': 'id,displayName,googleMapsUri,fuelOptions,attributions' }),
    credentialSecretName: GOOGLE_PLACES_CREDENTIAL_SECRET,
    credentialPlacement: 'server-transport-redacted-x-goog-api-key',
  });
}

function money(value) {
  if (!value || value.currencyCode !== 'USD' || !/^-?\d+$/.test(String(value.units ?? '')) || !Number.isInteger(value.nanos) || Math.abs(value.nanos) >= 1_000_000_000) {
    throw new Error('Google Places fuel price money value is malformed.');
  }
  const amount = Number(value.units) + value.nanos / 1_000_000_000;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100) throw new Error('Google Places fuel price is outside the supported range.');
  return Math.round(amount * 1_000_000) / 1_000_000;
}

export function normalizeGoogleFuelResponse(payload, requestedPlaceId, checkedAtInput = new Date()) {
  const checkedAt = checkedAtInput instanceof Date ? checkedAtInput : new Date(checkedAtInput);
  if (Number.isNaN(checkedAt.valueOf())) throw new Error('Google Places fuel check time is invalid.');
  const exactPlaceId = placeId(requestedPlaceId);
  if (!payload || placeId(payload.id) !== exactPlaceId) throw new Error('Google Places returned a place mismatch.');
  if (!payload.fuelOptions || !Array.isArray(payload.fuelOptions.fuelPrices)) throw new Error('Google Places fuel response is malformed.');
  const seen = new Set();
  const maximumAge = 7 * 24 * 60 * 60 * 1000;
  const prices = payload.fuelOptions.fuelPrices.flatMap((entry) => {
    if (!fuelTypes.has(entry.type) || seen.has(entry.type)) throw new Error('Google Places fuel type is malformed or duplicated.');
    seen.add(entry.type);
    const reportedAt = new Date(entry.updateTime);
    if (Number.isNaN(reportedAt.valueOf()) || reportedAt.valueOf() > checkedAt.valueOf() + 5 * 60 * 1000) throw new Error('Google Places fuel update time is malformed.');
    const amount = money(entry.price);
    if (checkedAt.valueOf() - reportedAt.valueOf() > maximumAge) return [];
    return [Object.freeze({ fuelType: entry.type, price: Object.freeze({ amount, currency: 'USD' }), reportedAt: reportedAt.toISOString() })];
  });
  const thirdPartyAttributions = Array.isArray(payload.attributions) ? payload.attributions.map((entry) => Object.freeze({
    provider: safeText(entry.provider, 'third-party attribution'),
    providerUri: mapsUri(entry.providerUri),
  })) : [];
  return Object.freeze({
    schemaVersion: '1.0.0',
    sourceId: GOOGLE_FUEL_SOURCE_ID,
    placeId: exactPlaceId,
    stationName: safeText(payload.displayName?.text, 'station name'),
    googleMapsUri: mapsUri(payload.googleMapsUri),
    checkedAt: checkedAt.toISOString(),
    prices: Object.freeze(prices),
    attribution: Object.freeze({ provider: 'Google Maps', thirdParty: Object.freeze(thirdPartyAttributions) }),
    retention: 'ephemeral-response-only',
    disclosure: 'Last known fuel prices from Google Maps. Verify at the station before purchase.',
  });
}

export function classifyGoogleFuelFailure(error) {
  if (error?.code === 'GOOGLE_AUTHENTICATION_FAILED' || [401, 403].includes(error?.status)) return 'authentication-failed';
  if (error?.code === 'GOOGLE_BUDGET_EXHAUSTED') return 'budget-exhausted';
  if (error?.status === 429) return 'quota-limited';
  if (Number(error?.status) >= 500) return 'provider-outage';
  if (/place mismatch/i.test(error?.message || '')) return 'mapping-error';
  if (/malformed|outside the supported range|duplicated/i.test(error?.message || '')) return 'malformed-response';
  return 'provider-outage';
}
