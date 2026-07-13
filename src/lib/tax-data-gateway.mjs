const ZIPTAX_ENDPOINT = 'https://api.zip-tax.com/request/v60';
const ZIP_FALLBACK_ENDPOINT = 'https://api.zippopotam.us/us/';
const POSTAL_CACHE_CONTROL = 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800';
const FALLBACK_CACHE_CONTROL = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';
const EXACT_CACHE_CONTROL = 'no-store';

const STATE_BASE_RATES = {
  AL: 4, AK: 0, AZ: 5.6, AR: 6.5, CA: 7.25, CO: 2.9, CT: 6.35, DE: 0,
  DC: 6, FL: 6, GA: 4, HI: 4, ID: 6, IL: 6.25, IN: 7, IA: 6, KS: 6.5,
  KY: 6, LA: 5, ME: 5.5, MD: 6, MA: 6.25, MI: 6, MN: 6.875, MS: 7,
  MO: 4.225, MT: 0, NE: 5.5, NV: 6.85, NH: 0, NJ: 6.625, NM: 4.875,
  NY: 4, NC: 4.75, ND: 5, OH: 5.75, OK: 4.5, OR: 0, PA: 6, RI: 7,
  SC: 6, SD: 4.2, TN: 7, TX: 6.25, UT: 6.1, VT: 6, VA: 5.3, WA: 6.5,
  WV: 6, WI: 5, WY: 4,
};

const PRODUCT_CODES = {
  groceries: '40030',
  alcohol: '90300',
};

const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8' };

const toPercent = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Number((number * 100).toFixed(6)) : 0;
};

const pick = (object, keys, fallback = '') => {
  for (const key of keys) {
    if (object?.[key] !== undefined && object[key] !== null && object[key] !== '') return object[key];
  }
  return fallback;
};

const readResults = (payload) => {
  const candidate = payload?.results ?? payload?.result ?? payload?.data?.results ?? payload?.data ?? payload;
  if (Array.isArray(candidate)) return candidate;
  return candidate && typeof candidate === 'object' ? [candidate] : [];
};

const componentId = (jurisdictionType = '') => {
  const type = String(jurisdictionType).toUpperCase();
  if (type.startsWith('STATE_') || type.includes('_STATE_')) return 'state';
  if (type.startsWith('COUNTY_') || type.includes('_COUNTY_')) return 'county';
  if (type.startsWith('CITY_') || type.includes('_CITY_') || type.startsWith('MUNICIPAL_') || type.includes('_MUNICIPAL_')) return 'city';
  return 'district';
};

const defaultLabel = (id) => ({
  state: 'State',
  county: 'County',
  city: 'City / municipal',
  district: 'Special district',
})[id] ?? 'Local tax';

const coalesceComponents = (components) => {
  const grouped = new Map();
  for (const component of components) {
    if (!(component.rate > 0)) continue;
    const existing = grouped.get(component.id);
    if (!existing) {
      grouped.set(component.id, { ...component });
      continue;
    }
    existing.rate = Number((existing.rate + component.rate).toFixed(6));
    if (component.label && !existing.label.includes(component.label)) {
      existing.label = `${existing.label} + ${component.label}`;
    }
  }
  return [...grouped.values()];
};

const componentTotal = (components) => Number(
  components.reduce((sum, component) => sum + component.rate, 0).toFixed(6),
);

const reconcileComponents = (components, totalRate) => {
  const difference = Number((totalRate - componentTotal(components)).toFixed(6));
  if (Math.abs(difference) < 0.000001) return components;
  if (difference > 0) {
    return coalesceComponents([
      ...components,
      { id: 'district', label: 'Provider rate adjustment', rate: difference },
    ]);
  }
  return totalRate > 0
    ? [{ id: 'district', label: 'Combined sales tax', rate: totalRate }]
    : [];
};

const effectiveProductRate = (rate, productDetail) => {
  const code = String(rate.jurTaxCode ?? '');
  const rule = (productDetail?.rateRules ?? []).find((candidate) => String(candidate.jurTaxCode ?? '') === code);
  const effective = Number(rule?.effectiveTaxRate);
  if (!rule || !Number.isFinite(effective)) return Number(pick(rate, ['rate', 'taxRate'], 0));
  const percentTaxable = Number(rule.percentTaxable);
  const taxableFraction = Number.isFinite(percentTaxable) ? percentTaxable : 1;
  return effective * taxableFraction;
};

const locationFrom = (result) => ({
  city: String(pick(result, ['geoCity', 'city', 'placeName'])),
  county: String(pick(result, ['geoCounty', 'county'])),
  state: String(pick(result, ['geoState', 'stateAbbreviation', 'state'])).toUpperCase(),
  postalCode: String(pick(result, ['geoPostalCode', 'postalCode', 'zipCode', 'zip'])),
});

const locationFromAddress = (result) => {
  const normalizedAddress = String(result.addressDetail?.normalizedAddress ?? '');
  const addressMatch = normalizedAddress.match(/,\s*([^,]+),\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?(?:,\s*(?:United States|USA))?$/i);
  const salesRates = (result.baseRates ?? []).filter(({ jurType, jurisdictionType, type }) =>
    String(jurType ?? jurisdictionType ?? type).toUpperCase().endsWith('_SALES_TAX'));
  const jurisdictionName = (id) => {
    const rate = salesRates.find((item) => componentId(item.jurType ?? item.jurisdictionType ?? item.type) === id);
    return String(pick(rate, ['jurName', 'jurisdictionName', 'name']));
  };
  return {
    city: String(addressMatch?.[1] ?? jurisdictionName('city')),
    county: jurisdictionName('county'),
    state: String(addressMatch?.[2] ?? jurisdictionName('state')).toUpperCase(),
    postalCode: String(addressMatch?.[3] ?? ''),
  };
};

const candidateLabel = ({ city, county, state, postalCode }) => {
  const locality = city || county || postalCode;
  const countySuffix = county && county.toLowerCase() !== city.toLowerCase() ? `, ${county} County` : '';
  return `${locality}${countySuffix}, ${state}`.replace(/^,\s*/, '').trim();
};

const salesTaxTotal = (result, components) => {
  const summary = (result.taxSummaries ?? []).find(({ taxType, type }) =>
    String(taxType ?? type).toUpperCase() === 'SALES_TAX');
  if (summary) return toPercent(pick(summary, ['rate', 'taxRate', 'totalRate'], 0));
  const direct = pick(result, ['taxSales', 'rateSalesTax', 'salesTaxRate', 'rateCombined', 'totalRate'], null);
  if (direct !== null) return toPercent(direct);
  return Number(components.reduce((sum, component) => sum + component.rate, 0).toFixed(6));
};

const envelope = ({ candidates, exact, warnings = [] }) => ({
  status: 'ok',
  provider: 'ziptax',
  exact,
  ambiguous: candidates.length > 1,
  fetchedAt: new Date().toISOString(),
  sourceUpdated: 'provider-real-time',
  candidates,
  warnings,
});

export function normalizeZiptaxAddressResponse(payload) {
  const results = readResults(payload);
  const candidates = results.map((result) => {
    const location = locationFromAddress(result);
    let components = coalesceComponents((result.baseRates ?? [])
      .filter(({ jurType, jurisdictionType, type }) =>
        String(jurType ?? jurisdictionType ?? type).toUpperCase().endsWith('_SALES_TAX'))
      .map((rate) => {
        const id = componentId(rate.jurType ?? rate.jurisdictionType ?? rate.type);
        return {
          id,
          label: String(pick(rate, ['jurName', 'jurisdictionName', 'name'], defaultLabel(id))),
          rate: toPercent(effectiveProductRate(rate, result.productDetail)),
        };
      }));
    const providerTotal = salesTaxTotal(result, components);
    const totalRate = result.productDetail ? componentTotal(components) : providerTotal;
    components = reconcileComponents(components, totalRate);
    return {
      ...location,
      label: candidateLabel(location),
      totalRate: componentTotal(components),
      components,
    };
  });
  const hasThresholdRule = results.some((result) => (result.productDetail?.rateRules ?? []).some((rule) =>
    rule.exemptUnder != null || rule.exemptOver != null || rule.taxablePortionOver != null));
  return envelope({
    candidates,
    exact: true,
    warnings: hasThresholdRule
      ? ['This product rule includes a price threshold. Verify the item amount against the provider rule.']
      : [],
  });
}

export function normalizeZiptaxPostalResponse(payload) {
  const candidates = readResults(payload).map((result) => {
    const location = locationFrom(result);
    let components = coalesceComponents([
      { id: 'state', label: String(pick(result, ['nameState', 'geoStateName'], 'State')), rate: toPercent(result.rateState) },
      { id: 'county', label: String(pick(result, ['nameCounty'], location.county || 'County')), rate: toPercent(result.rateCounty) },
      { id: 'city', label: String(pick(result, ['nameCity'], location.city || 'City / municipal')), rate: toPercent(result.rateCity) },
      { id: 'district', label: 'Special districts', rate: toPercent(pick(result, ['rateAdditional', 'rateSpecial'], 0)) },
    ]);
    components = reconcileComponents(components, salesTaxTotal(result, components));
    return {
      ...location,
      label: candidateLabel(location),
      totalRate: componentTotal(components),
      components,
    };
  });
  return envelope({
    candidates,
    exact: false,
    warnings: candidates.length > 1
      ? ['This ZIP code overlaps multiple tax jurisdictions. Choose the matching city or enter a street address.']
      : ['ZIP codes can cross tax boundaries. A street address is more accurate.'],
  });
}

const responseJson = (body, status = 200, cacheControl = 'no-store', extraHeaders = {}) => new Response(
  JSON.stringify(body),
  { status, headers: { ...jsonHeaders, 'Cache-Control': cacheControl, ...extraHeaders } },
);

const fetchWithTimeout = async (request, fetchImpl, timeoutMs = 9_000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(new Request(request, { signal: controller.signal }));
  } finally {
    clearTimeout(timeout);
  }
};

const fetchProvider = async (url, key, fetchImpl) => {
  const makeRequest = () => new Request(url, {
    headers: { Accept: 'application/json', 'X-API-Key': key },
  });
  let response = await fetchWithTimeout(makeRequest(), fetchImpl);
  if (response.status >= 500) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    response = await fetchWithTimeout(makeRequest(), fetchImpl);
  }
  return response;
};

const readCache = async (request, cacheStorage) => {
  if (!cacheStorage?.default) return null;
  try {
    return await cacheStorage.default.match(request);
  } catch {
    return null;
  }
};

const writeCache = (request, response, cacheStorage, context) => {
  if (!cacheStorage?.default || !context?.waitUntil) return;
  context.waitUntil(cacheStorage.default.put(request, response.clone()).catch(() => undefined));
};

const rateLimitResponse = () => responseJson(
  { error: 'Too many location lookups. Try again in a minute.' },
  429,
  'no-store',
  { 'Retry-After': '60' },
);

const enforceRateLimit = async (request, exact, cacheStorage, options) => {
  const ip = request.headers.get('CF-Connecting-IP');
  const cryptoImpl = options.crypto ?? globalThis.crypto;
  if (!ip || !cacheStorage?.default || !cryptoImpl?.subtle) return null;

  const digest = await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  const hash = [...new Uint8Array(digest)].slice(0, 12).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const minute = Math.floor((options.now?.() ?? Date.now()) / 60_000);
  const kind = exact ? 'exact' : 'postal';
  const limit = exact ? 12 : 60;
  const key = new Request(`${new URL(request.url).origin}/__howbiscuit-rate-limit/${kind}/${minute}/${hash}`);
  const current = await readCache(key, cacheStorage);
  const count = current ? Number(await current.text()) : 0;
  if (count >= limit) return rateLimitResponse();

  try {
    await cacheStorage.default.put(key, new Response(String(count + 1), {
      headers: { 'Cache-Control': 'public, max-age=70' },
    }));
  } catch {
    // A failed edge counter must not make the calculator unavailable.
  }
  return null;
};

const fallbackByPostalCode = async (postalCode, fetchImpl) => {
  const response = await fetchWithTimeout(`${ZIP_FALLBACK_ENDPOINT}${postalCode}`, fetchImpl);
  if (!response.ok) throw new Error('postal lookup failed');
  const data = await response.json();
  const places = Array.isArray(data.places) ? data.places : [];
  const candidates = places.map((place) => {
    const state = String(place['state abbreviation'] ?? '').toUpperCase();
    const city = String(place['place name'] ?? '');
    const rate = STATE_BASE_RATES[state];
    if (rate === undefined) return null;
    const location = { city, county: '', state, postalCode };
    return {
      ...location,
      label: candidateLabel(location),
      totalRate: rate,
      components: rate > 0 ? [{ id: 'state', label: `${place.state ?? state} state base rate`, rate }] : [],
    };
  }).filter(Boolean);
  if (!candidates.length) throw new Error('postal lookup failed');
  return {
    status: 'ok',
    provider: 'state-fallback',
    exact: false,
    ambiguous: candidates.length > 1,
    fetchedAt: new Date().toISOString(),
    sourceUpdated: 'state-table-2026-07-01',
    candidates,
    warnings: ['Only the state base rate is available right now. Add local rates manually or configure the local tax-rate provider.'],
  };
};

export async function handleTaxRateRequest(request, env = {}, context = {}, options = {}) {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!['GET', 'POST'].includes(request.method)) {
    return responseJson({ error: 'Method not allowed.' }, 405);
  }

  const url = new URL(request.url);
  let input;
  if (request.method === 'POST') {
    if (Number(request.headers.get('Content-Length') ?? 0) > 2_048) {
      return responseJson({ error: 'The location request is too large.' }, 413);
    }
    try {
      input = await request.json();
    } catch {
      return responseJson({ error: 'Send a valid location request.' }, 400);
    }
  } else {
    if (url.searchParams.has('address')) {
      return responseJson({ error: 'Street-address lookups must use a private request body.' }, 400);
    }
    input = Object.fromEntries(url.searchParams);
  }

  const postalCode = String(input?.postalCode ?? '').trim();
  const address = String(input?.address ?? '').trim();
  const product = String(input?.product ?? 'general').trim().toLowerCase();

  if (!/^\d{5}$/.test(postalCode)) {
    return responseJson({ error: 'Enter a five-digit U.S. ZIP code.' }, 400);
  }
  if (address.length > 160 || !/^[\p{L}\p{N} .,'#\-/]*$/u.test(address)) {
    return responseJson({ error: 'Enter a valid U.S. street address.' }, 400);
  }
  if (request.method === 'POST' && !address) {
    return responseJson({ error: 'Enter a street address for an exact lookup.' }, 400);
  }

  const cacheStorage = options.caches ?? globalThis.caches;
  const cacheUrl = new URL('/api/tax-rates', url.origin);
  cacheUrl.searchParams.set('postalCode', postalCode);
  const cacheKey = address ? null : new Request(cacheUrl);
  if (cacheKey) {
    const cached = await readCache(cacheKey, cacheStorage);
    if (cached) return cached;
  }

  const limited = await enforceRateLimit(request, Boolean(address), cacheStorage, options);
  if (limited) return limited;

  const providerKey = String(env.ZIPTAX_API_KEY ?? '').trim();
  if (!providerKey) {
    try {
      const fallback = await fallbackByPostalCode(postalCode, fetchImpl);
      const response = responseJson(fallback, 200, address ? EXACT_CACHE_CONTROL : FALLBACK_CACHE_CONTROL);
      if (cacheKey) writeCache(cacheKey, response, cacheStorage, context);
      return response;
    } catch {
      return responseJson({ error: 'ZIP lookup is temporarily unavailable. Choose a state or enter rates manually.' }, 503);
    }
  }

  const providerUrl = new URL(ZIPTAX_ENDPOINT);
  if (address) providerUrl.searchParams.set('address', `${address} ${postalCode}`);
  else providerUrl.searchParams.set('postalcode', postalCode);
  const productCode = address && env.ZIPTAX_PRODUCT_RULES === 'true' ? PRODUCT_CODES[product] : undefined;
  if (productCode) providerUrl.searchParams.set('taxabilityCode', productCode);

  try {
    const providerResponse = await fetchProvider(providerUrl, providerKey, fetchImpl);
    if (!providerResponse.ok) {
      return responseJson({ error: 'The local tax-rate service is temporarily unavailable.' }, 502);
    }
    const payload = await providerResponse.json();
    const providerCode = Number(payload?.metadata?.response?.code ?? payload?.rCode ?? 100);
    if (providerCode !== 100) {
      return responseJson({ error: 'The local tax-rate service is temporarily unavailable.' }, 502);
    }
    const result = address
      ? normalizeZiptaxAddressResponse(payload)
      : normalizeZiptaxPostalResponse(payload);
    if (!result.candidates.length) {
      return responseJson({ error: 'No tax jurisdiction was found for that location.' }, 404);
    }
    const response = responseJson(result, 200, address ? EXACT_CACHE_CONTROL : POSTAL_CACHE_CONTROL);
    if (cacheKey) writeCache(cacheKey, response, cacheStorage, context);
    return response;
  } catch {
    return responseJson({ error: 'The local tax-rate service is temporarily unavailable.' }, 502);
  }
}
