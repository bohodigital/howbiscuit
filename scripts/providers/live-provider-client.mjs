import { readFile } from 'node:fs/promises';

import yaml from 'js-yaml';

import {
  bestBuyMappingsFromCatalog,
  bestBuyProductRequest,
  classifyBestBuyFailure,
  normalizeBestBuyProduct,
} from '../../src/lib/offers/adapters/best-buy.mjs';
import {
  KROGER_SELECTED_STORE_ID,
  classifyKrogerFailure,
  krogerLocationSearchRequest,
  krogerMappingsFromCatalog,
  krogerProductRequest,
  normalizeKrogerLocations,
  normalizeKrogerProduct,
  selectKrogerStore,
} from '../../src/lib/offers/adapters/kroger.mjs';
import { compileEiaRegionalTrends } from '../../src/lib/fuel/eia.mjs';
import { parseHudCrosswalk } from '../../src/lib/location/source-normalizer.mjs';

const PROVIDERS = Object.freeze(['eia', 'hud-usps', 'best-buy', 'kroger']);
const TIMEOUT_MILLISECONDS = 15_000;
const KROGER_TEST_ZIP = '60647';
const HUD_TEST_ZIPS = Object.freeze(['60614', '46802', '61602']);
const EIA_SERIES = Object.freeze([
  { seriesId: 'PET.EMM_EPMR_PTE_NUS_DPG.W', id: 'us', area: 'United States', scope: 'national-average' },
  { seriesId: 'PET.EMM_EPMR_PTE_R20_DPG.W', id: 'midwest-padd-2', area: 'Midwest PADD 2', scope: 'regional-average' },
  { seriesId: 'PET.EMM_EPMR_PTE_YORD_DPG.W', id: 'chicago', area: 'Chicago', scope: 'city-average' },
]);

export class ProviderSmokeError extends Error {
  constructor(category, stage = null, detail = null) {
    super(category);
    this.name = 'ProviderSmokeError';
    this.category = category;
    this.stage = stage;
    this.detail = detail;
  }
}

function krogerMappingDetail(error) {
  const message = String(error?.message || '');
  for (const detail of ['brand', 'model', 'identifier', 'package-size', 'unit-size', 'pack-count']) {
    if (message.toLowerCase().includes(detail)) return detail;
  }
  return null;
}

function requireSecret(environment, name) {
  const value = environment[name];
  if (typeof value !== 'string' || !value || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new ProviderSmokeError('credential-missing');
  }
  return value;
}

function statusCategory(status) {
  if ([401, 403].includes(status)) return 'authentication-failed';
  if (status === 404) return 'not-found';
  if (status === 429) return 'quota-limited';
  if (status >= 500) return 'provider-outage';
  return 'provider-rejected';
}

export async function fetchJson({
  fetchImpl = fetch,
  origin,
  pathname,
  query = {},
  headers = {},
  method = 'GET',
  body,
}) {
  const url = new URL(pathname, origin);
  for (const [name, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const part of value) url.searchParams.append(name, part);
    } else if (value !== undefined && value !== null) {
      url.searchParams.set(name, String(value));
    }
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MILLISECONDS);
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers,
      body,
      signal: controller.signal,
      redirect: 'error',
    });
  } catch {
    throw new ProviderSmokeError('transport-failed');
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new ProviderSmokeError(statusCategory(response.status));
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('json')) throw new ProviderSmokeError('malformed-response');
  try {
    return await response.json();
  } catch {
    throw new ProviderSmokeError('malformed-response');
  }
}

function elapsed(started) {
  return Math.max(0, Math.round(performance.now() - started));
}

function result(provider, started, calls, accepted, extra = {}) {
  return Object.freeze({
    provider,
    testedAt: new Date().toISOString(),
    statusClass: '2xx',
    latencyMs: elapsed(started),
    calls,
    schemaValidation: 'pass',
    mappingValidation: 'pass',
    accepted,
    rejected: 0,
    killSwitchState: 'test-only',
    pass: true,
    ...extra,
  });
}

function eiaRows(payload, definition) {
  const response = payload?.response;
  if (!response || !Array.isArray(response.data) || response.data.length < 2) {
    throw new ProviderSmokeError('malformed-response');
  }
  const rows = response.data.slice(0, 6).map((row) => {
    const period = String(row.period || '');
    const value = Number(row.value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(period) || !Number.isFinite(value) || value <= 0) {
      throw new ProviderSmokeError('malformed-response');
    }
    return { period, value, status: 'reported' };
  }).sort((left, right) => left.period.localeCompare(right.period, 'en'));
  return { seriesId: definition.id, area: definition.area, scope: definition.scope, values: rows };
}

export async function smokeEia({ environment = process.env, fetchImpl = fetch } = {}) {
  const started = performance.now();
  const apiKey = requireSecret(environment, 'HOWBISCUIT_EIA_API_KEY');
  const series = [];
  for (const definition of EIA_SERIES) {
    const payload = await fetchJson({
      fetchImpl,
      origin: 'https://api.eia.gov',
      pathname: `/v2/seriesid/${definition.seriesId}`,
      query: {
        api_key: apiKey,
        length: 6,
        'sort[0][column]': 'period',
        'sort[0][direction]': 'desc',
      },
    });
    series.push(eiaRows(payload, definition));
  }
  const latest = series.flatMap((entry) => entry.values.map((row) => row.period)).sort().at(-1);
  const releaseDate = latest;
  const nextRelease = new Date(`${releaseDate}T00:00:00Z`);
  nextRelease.setUTCDate(nextRelease.getUTCDate() + 8);
  compileEiaRegionalTrends({
    schemaVersion: '1.0.0',
    sourceId: 'eia-weekly-gasoline',
    sourceUrl: 'https://www.eia.gov/dnav/pet/pet_pri_gnd_a_epmr_pte_dpgal_w.htm',
    releaseDate,
    nextReleaseDate: nextRelease.toISOString().slice(0, 10),
    product: 'Regular gasoline',
    frequency: 'weekly',
    unit: 'dollars-per-gallon-including-taxes',
    series,
  });
  return result('eia', started, EIA_SERIES.length, series.length, { freshnessTimestamp: latest });
}

export async function smokeHud({ environment = process.env, fetchImpl = fetch } = {}) {
  const started = performance.now();
  const token = requireSecret(environment, 'HOWBISCUIT_HUD_USPS_ACCESS_TOKEN');
  let accepted = 0;
  let freshnessTimestamp = null;
  for (const zip of HUD_TEST_ZIPS) {
    for (const type of [2, 3]) {
      const payload = await fetchJson({
        fetchImpl,
        origin: 'https://www.huduser.gov',
        pathname: '/hudapi/public/usps',
        query: { type, query: zip },
        headers: { accept: 'application/json', authorization: `Bearer ${token}` },
      });
      const kind = type === 2 ? 'county' : 'cbsa';
      const rows = parseHudCrosswalk(JSON.stringify(payload), kind);
      if (!rows.length || rows.some((row) => row.zip !== zip)) {
        throw new ProviderSmokeError('mapping-error');
      }
      accepted += rows.length;
      const envelope = Array.isArray(payload?.data) ? payload.data[0] : payload?.data;
      if (envelope?.year && envelope?.quarter) freshnessTimestamp = `${envelope.year}-${envelope.quarter}`;
    }
  }
  return result('hud-usps', started, HUD_TEST_ZIPS.length * 2, accepted, { freshnessTimestamp });
}

async function loadCatalogAndPolicy(policyName) {
  const [catalogText, policyText] = await Promise.all([
    readFile(new URL('../../src/generated/publishing/products.v1.json', import.meta.url), 'utf8'),
    readFile(new URL(`../../content/source-policies/${policyName}.yaml`, import.meta.url), 'utf8'),
  ]);
  return { catalog: JSON.parse(catalogText), policy: yaml.load(policyText) };
}

export async function smokeBestBuy({ environment = process.env, fetchImpl = fetch } = {}) {
  const started = performance.now();
  const apiKey = requireSecret(environment, 'HOWBISCUIT_BESTBUY_API_KEY');
  const { catalog, policy } = await loadCatalogAndPolicy('best-buy');
  const mappings = bestBuyMappingsFromCatalog(catalog);
  let accepted = 0;
  for (const mapping of mappings.values()) {
    const spec = bestBuyProductRequest(mapping.merchantProductId);
    const payload = await fetchJson({
      fetchImpl,
      origin: spec.origin,
      pathname: spec.pathname,
      query: { ...spec.query, apiKey },
    });
    try {
      normalizeBestBuyProduct(payload, mapping, policy, new Date());
    } catch (error) {
      throw new ProviderSmokeError(classifyBestBuyFailure(error));
    }
    accepted += 1;
  }
  return result('best-buy', started, mappings.size, accepted);
}

async function krogerToken(environment, fetchImpl) {
  const clientId = requireSecret(environment, 'HOWBISCUIT_KROGER_CLIENT_ID');
  const clientSecret = requireSecret(environment, 'HOWBISCUIT_KROGER_CLIENT_SECRET');
  const payload = await fetchJson({
    fetchImpl,
    origin: 'https://api.kroger.com',
    pathname: '/v1/connect/oauth2/token',
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'product.compact' }),
  });
  if (typeof payload?.access_token !== 'string' || !payload.access_token || !Number.isFinite(payload.expires_in)) {
    throw new ProviderSmokeError('malformed-response');
  }
  return payload.access_token;
}

export async function smokeKroger({ environment = process.env, fetchImpl = fetch } = {}) {
  const started = performance.now();
  const token = await krogerToken(environment, fetchImpl);
  const auth = { accept: 'application/json', authorization: `Bearer ${token}` };
  const locationSpec = krogerLocationSearchRequest(KROGER_TEST_ZIP, 10, 10);
  const locationPayload = await fetchJson({
    fetchImpl,
    origin: locationSpec.origin,
    pathname: locationSpec.pathname,
    query: locationSpec.query,
    headers: auth,
  });
  const stores = normalizeKrogerLocations(locationPayload);
  const selectedStore = selectKrogerStore(stores, KROGER_SELECTED_STORE_ID, 'MARIANOS');
  if (!selectedStore) throw new ProviderSmokeError('mapping-error', 'selected-store');

  const { catalog, policy } = await loadCatalogAndPolicy('kroger');
  const mappings = krogerMappingsFromCatalog(catalog);
  let accepted = 0;
  for (const mapping of mappings.values()) {
    const spec = krogerProductRequest(mapping.merchantProductId, selectedStore.storeId);
    const payload = await fetchJson({
      fetchImpl,
      origin: spec.origin,
      pathname: spec.pathname,
      query: spec.query,
      headers: auth,
    });
    try {
      normalizeKrogerProduct(payload, mapping, selectedStore, policy, new Date());
    } catch (error) {
      throw new ProviderSmokeError(classifyKrogerFailure(error), 'exact-product', krogerMappingDetail(error));
    }
    accepted += 1;
  }
  return result('kroger', started, mappings.size + 2, accepted, {
    coverage: 'selected-store-only',
  });
}

export async function smokeProvider(provider, options = {}) {
  if (!PROVIDERS.includes(provider)) throw new ProviderSmokeError('unsupported-provider');
  if (provider === 'eia') return smokeEia(options);
  if (provider === 'hud-usps') return smokeHud(options);
  if (provider === 'best-buy') return smokeBestBuy(options);
  return smokeKroger(options);
}

export { PROVIDERS };
