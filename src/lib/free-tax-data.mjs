import {
  PUBLIC_STATE_BASE_RATES,
  publicCoverageSummary,
} from './tax-source-registry.mjs';

const FREE_ZIP_ENDPOINT = 'https://api.zippopotam.us/us/';
const CENSUS_ENDPOINT = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress';
const CDC_CIGARETTE_ENDPOINT = 'https://data.cdc.gov/resource/ebcc-3d5i.json';
const CDC_VAPING_ENDPOINT = 'https://data.cdc.gov/resource/kwbr-syv2.json';
const PUBLIC_DATA_CACHE = 'public, max-age=300, s-maxage=21600, stale-while-revalidate=604800';

const parseEffectiveDate = (value) => {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const fetchPublicJson = async (url, fetchImpl, headers = {}, timeoutMs = 9_000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(new Request(url, {
      headers: { Accept: 'application/json', ...headers },
      signal: controller.signal,
    }));
    if (!response.ok) throw new Error(`public source returned ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
};

const socrataHeaders = (env) => {
  const token = String(env.CDC_SOCRATA_APP_TOKEN ?? '').trim();
  return token ? { 'X-App-Token': token } : {};
};

const latestRows = (rows, asOf = Date.now()) => {
  const selected = new Map();
  for (const row of rows) {
    const effective = parseEffectiveDate(row.effective_date);
    if (effective && effective > asOf) continue;
    const key = `${row.locationabbr}:${row.measuredesc}:${row.provisiondesc}`;
    const previous = selected.get(key);
    if (!previous || parseEffectiveDate(previous.effective_date) < effective) selected.set(key, row);
  }
  return [...selected.values()];
};

const cdcUrl = (endpoint, state, measure) => {
  const url = new URL(endpoint);
  url.searchParams.set('$limit', '500');
  url.searchParams.set('$where', `locationabbr='${state}' AND measuredesc='${measure}'`);
  return url;
};

async function fetchCdcCigaretteRule(state, env, fetchImpl) {
  const rows = await fetchPublicJson(
    cdcUrl(CDC_CIGARETTE_ENDPOINT, state, 'Cigarette'),
    fetchImpl,
    socrataHeaders(env),
  );
  const row = latestRows(rows).find((candidate) =>
    candidate.provisiondesc === 'Cigarette Tax ($ per pack)' && Number(candidate.provisionvalue) >= 0);
  if (!row) return null;
  return {
    label: `${state} cigarette excise`,
    amount: Number(row.provisionvalue),
    unit: 'packs of 20',
    includedInPrice: true,
    effectiveFrom: row.effective_date || null,
    citation: row.citation || null,
    sourceId: 'cdc-cigarettes',
  };
}

async function fetchCdcVapingRules(state, env, fetchImpl) {
  const rows = await fetchPublicJson(
    cdcUrl(CDC_VAPING_ENDPOINT, state, 'E-Cigarette'),
    fetchImpl,
    socrataHeaders(env),
  );
  return latestRows(rows)
    .filter((row) => !['No Provision', 'No'].includes(row.provisionvalue))
    .map((row) => ({
      label: row.provisiondesc,
      value: row.provisionvalue,
      dataType: row.datatype || 'Text',
      effectiveFrom: row.effective_date || null,
      citation: row.citation || null,
      sourceId: 'cdc-vaping',
    }));
}

const normalizePlace = (place, postalCode) => {
  const state = String(place['state abbreviation'] ?? '').toUpperCase();
  const city = String(place['place name'] ?? '');
  return {
    city,
    county: '',
    state,
    postalCode,
    label: `${city}, ${state}`,
  };
};

async function lookupFreePostal(postalCode, fetchImpl) {
  const payload = await fetchPublicJson(`${FREE_ZIP_ENDPOINT}${postalCode}`, fetchImpl);
  return (Array.isArray(payload.places) ? payload.places : [])
    .map((place) => normalizePlace(place, postalCode))
    .filter((place) => place.state && PUBLIC_STATE_BASE_RATES[place.state] !== undefined);
}

async function normalizeFreeAddress(address, postalCode, place, fetchImpl) {
  if (!address) return null;
  const url = new URL(CENSUS_ENDPOINT);
  const placeSuffix = place?.city && place?.state
    ? `${place.city}, ${place.state} ${postalCode}`
    : postalCode;
  url.searchParams.set('address', `${address}, ${placeSuffix}`);
  url.searchParams.set('benchmark', 'Public_AR_Current');
  url.searchParams.set('vintage', 'Current_Current');
  url.searchParams.set('format', 'json');
  const payload = await fetchPublicJson(url, fetchImpl);
  const match = payload?.result?.addressMatches?.[0];
  if (!match) return null;
  const parts = match.addressComponents ?? {};
  const county = match.geographies?.Counties?.[0] ?? {};
  const incorporatedPlace = match.geographies?.['Incorporated Places']?.[0] ?? {};
  const countyCode = String(county.COUNTY ?? '');
  const placeCode = String(incorporatedPlace.PLACE ?? '');
  return {
    city: String(parts.city ?? ''),
    county: String(county.BASENAME ?? county.NAME ?? ''),
    state: String(parts.state ?? '').toUpperCase(),
    postalCode: String(parts.zip ?? postalCode),
    label: String(match.matchedAddress ?? `${parts.city ?? ''}, ${parts.state ?? ''}`),
    countyFips: countyCode ? countyCode.padStart(3, '0') : '',
    placeFips: placeCode ? placeCode.padStart(5, '0') : '',
  };
}

const componentIdFor = (type) => {
  const normalized = String(type).toLowerCase();
  if (normalized === 'state') return 'state';
  if (normalized === 'county') return 'county';
  if (['city', 'town', 'village', 'borough', 'municipality'].includes(normalized)) return 'city';
  if (normalized === 'product') return 'product';
  return 'district';
};

const d1Rows = async (statement) => {
  const result = await statement.all();
  return Array.isArray(result?.results) ? result.results : [];
};

async function lookupD1PublicRates(db, postalCode, product, asOf, normalizedLocation = null) {
  if (!db?.prepare) return null;
  const locations = await d1Rows(db.prepare(`
    SELECT location_id, state_code, city_name, county_name, county_fips, place_fips, record_type, confidence,
           effective_from, effective_to, source_id, source_revision
      FROM tax_locations
     WHERE ? BETWEEN postal_low AND postal_high
       AND effective_from <= ? AND effective_to >= ?
     ORDER BY CASE record_type WHEN 'A' THEN 0 WHEN '4' THEN 1 ELSE 2 END, location_id
     LIMIT 20
  `).bind(postalCode, asOf, asOf));
  if (!locations.length) return null;

  let selectedLocations = locations;
  if (normalizedLocation) {
    const stateMatches = locations.filter((location) => location.state_code === normalizedLocation.state);
    const geographyMatches = stateMatches.filter((location) => {
      const countyMatches = normalizedLocation.countyFips
        && String(location.county_fips ?? '').padStart(3, '0') === normalizedLocation.countyFips;
      const placeMatches = normalizedLocation.placeFips
        && String(location.place_fips ?? '').padStart(5, '0') === normalizedLocation.placeFips;
      return countyMatches && (!normalizedLocation.placeFips || placeMatches);
    });
    selectedLocations = geographyMatches.length ? geographyMatches : stateMatches;
  }

  const candidates = [];
  for (const location of selectedLocations) {
    const components = await d1Rows(db.prepare(`
      SELECT component_id, jurisdiction_type, jurisdiction_name, rate_percent, unit_amount,
             unit_basis, included_in_price, citation, source_id, effective_from
        FROM tax_components
       WHERE state_code = ? AND product_code = ?
         AND (location_id = ? OR location_id IS NULL)
         AND effective_from <= ? AND effective_to >= ?
       ORDER BY jurisdiction_type, component_id
    `).bind(location.state_code, product, location.location_id, asOf, asOf));
    const rules = await d1Rows(db.prepare(`
      SELECT rule_label, rule_value, rule_basis, citation, source_id, effective_from
        FROM tax_product_rules
       WHERE state_code = ? AND product_code = ?
         AND effective_from <= ? AND effective_to >= ?
       ORDER BY rule_label
    `).bind(location.state_code, product, asOf, asOf));
    if (!components.length && !rules.length) continue;
    const percentageComponents = components
      .filter((component) => Number.isFinite(Number(component.rate_percent)))
      .map((component) => ({
        id: componentIdFor(component.jurisdiction_type),
        label: component.jurisdiction_name || component.jurisdiction_type,
        rate: Number(component.rate_percent),
        sourceId: component.source_id,
      }));
    const unitTaxes = components
      .filter((component) => Number.isFinite(Number(component.unit_amount)))
      .map((component) => ({
        label: component.jurisdiction_name || component.jurisdiction_type,
        amount: Number(component.unit_amount),
        unit: component.unit_basis || 'units',
        includedInPrice: Boolean(component.included_in_price),
        citation: component.citation || null,
        sourceId: component.source_id,
      }));
    const city = String(location.city_name ?? '');
    const county = String(location.county_name ?? '');
    const label = city
      ? `${city}${county ? `, ${county} County` : ''}, ${location.state_code}`
      : `${postalCode}, ${location.state_code}`;
    candidates.push({
      label,
      city,
      county,
      state: location.state_code,
      postalCode,
      totalRate: Number(percentageComponents.reduce((sum, item) => sum + item.rate, 0).toFixed(6)),
      components: percentageComponents,
      unitTaxes,
      rules: rules.map((rule) => ({
        label: rule.rule_label,
        value: rule.rule_value,
        basis: rule.rule_basis,
        citation: rule.citation,
        sourceId: rule.source_id,
      })),
      confidence: location.confidence,
      sourceRevision: location.source_revision,
      exact: Boolean(normalizedLocation && selectedLocations.length === 1),
    });
  }
  return candidates.length ? candidates : null;
}

const fallbackCandidate = async (place, product, env, fetchImpl) => {
  if (product === 'cigarettes') {
    const unitTax = await fetchCdcCigaretteRule(place.state, env, fetchImpl).catch(() => null);
    return {
      ...place,
      totalRate: 0,
      components: [],
      unitTaxes: unitTax ? [unitTax] : [],
      rules: [],
      confidence: unitTax ? 'official-state' : 'location-only',
    };
  }
  if (product === 'nicotine') {
    const rules = await fetchCdcVapingRules(place.state, env, fetchImpl).catch(() => []);
    return {
      ...place,
      totalRate: 0,
      components: [],
      unitTaxes: [],
      rules,
      confidence: rules.length ? 'official-state-rule' : 'location-only',
    };
  }
  if (product !== 'general') {
    return {
      ...place,
      totalRate: 0,
      components: [],
      unitTaxes: [],
      rules: [],
      confidence: 'location-only',
    };
  }
  const rate = PUBLIC_STATE_BASE_RATES[place.state];
  return {
    ...place,
    totalRate: rate,
    components: rate > 0 ? [{ id: 'state', label: `${place.state} state base rate`, rate }] : [],
    unitTaxes: [],
    rules: [],
    confidence: 'state-reference',
  };
};

export async function lookupFreeTaxRates({ postalCode, address, product, env = {}, fetchImpl, now = Date.now() }) {
  const asOf = new Date(now).toISOString().slice(0, 10);
  let postalPlaces = null;
  let normalizedAddress = null;
  if (address) {
    postalPlaces = await lookupFreePostal(postalCode, fetchImpl).catch(() => []);
    normalizedAddress = await normalizeFreeAddress(address, postalCode, postalPlaces[0], fetchImpl).catch(() => null);
  }
  const lookupPostalCode = normalizedAddress?.postalCode || postalCode;
  let d1Candidates = null;
  try {
    d1Candidates = await lookupD1PublicRates(env.DB, lookupPostalCode, product, asOf, normalizedAddress);
  } catch {
    d1Candidates = null;
  }
  if (d1Candidates?.length) {
    const warnings = d1Candidates.some((candidate) => !candidate.exact)
      ? ['Official ZIP-boundary data was used. ZIP codes can cross tax boundaries.']
      : [];
    if (product === 'cigarettes') {
      warnings.push('The state cigarette excise is official; local excise and prepaid or retail sales taxes may also apply.');
    } else if (product === 'nicotine') {
      warnings.push('Wholesale, milliliter, and mixed vaping formulas are shown as rules and are not converted automatically.');
    } else if (['alcohol', 'cannabis'].includes(product)) {
      warnings.push('Special product taxes can use price, volume, potency, or wholesale formulas. Only directly supported components are calculated.');
    }
    return {
      status: 'ok',
      provider: 'public-data',
      exact: d1Candidates.every((candidate) => candidate.exact),
      ambiguous: d1Candidates.length > 1,
      fetchedAt: new Date(now).toISOString(),
      sourceUpdated: d1Candidates[0].sourceRevision || 'versioned-public-data',
      candidates: d1Candidates,
      warnings,
      cacheControl: PUBLIC_DATA_CACHE,
    };
  }

  const places = normalizedAddress ? [normalizedAddress] : (postalPlaces ?? await lookupFreePostal(postalCode, fetchImpl));
  const candidates = await Promise.all(places.map((place) => fallbackCandidate(place, product, env, fetchImpl)));
  const warnings = [];
  if (address && normalizedAddress) {
    warnings.push('The Census Bureau standardized the address, but no official local tax-boundary snapshot is loaded yet.');
  }
  if (product === 'cigarettes') {
    warnings.push('The state cigarette excise is official; local excise and prepaid or retail sales taxes may also apply.');
  } else if (product === 'nicotine') {
    warnings.push('The official state rule is shown when available, but wholesale, milliliter, and mixed formulas are not converted into a checkout estimate automatically.');
  } else if (product !== 'general') {
    warnings.push('This location is recognized, but its official product-specific adapter has not been loaded yet. No tax rate was guessed.');
  } else {
    warnings.push('Only the state base-rate reference is loaded. The free local rate and boundary importer must populate D1 for itemized local rates.');
  }
  return {
    status: 'ok',
    provider: 'public-data',
    exact: false,
    ambiguous: candidates.length > 1,
    fetchedAt: new Date(now).toISOString(),
    sourceUpdated: product === 'cigarettes' || product === 'nicotine' ? 'cdc-live' : 'state-reference',
    candidates,
    warnings,
    cacheControl: PUBLIC_DATA_CACHE,
  };
}

export async function handleTaxCoverageRequest(request, env = {}) {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  const coverage = publicCoverageSummary();
  let runtime = { database: 'not-bound', sourceStatus: [] };
  if (env.DB?.prepare) {
    try {
      const rows = await d1Rows(env.DB.prepare(`
        SELECT source_id, title, status, last_checked_at, last_success_at, published_at, record_count
          FROM tax_sources ORDER BY source_id
      `));
      runtime = { database: 'ready', sourceStatus: rows };
    } catch {
      runtime = { database: 'migration-required', sourceStatus: [] };
    }
  }
  return new Response(JSON.stringify({ status: 'ok', ...coverage, runtime }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
    },
  });
}

export function visitorLocationFromRequest(request) {
  const metadata = request?.cf ?? {};
  const postalCode = String(metadata.postalCode ?? '').trim();
  const state = String(metadata.regionCode ?? '').trim().toUpperCase();
  if (!/^\d{5}$/.test(postalCode) || !/^[A-Z]{2}$/.test(state)) return null;
  return {
    postalCode,
    state,
    city: String(metadata.city ?? '').trim(),
    approximate: true,
  };
}

export async function handleTaxLocationRequest(request) {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  const location = visitorLocationFromRequest(request);
  return new Response(JSON.stringify(location
    ? { status: 'ok', location }
    : { status: 'unavailable', location: null }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  });
}

export { lookupD1PublicRates, fetchCdcCigaretteRule, fetchCdcVapingRules };
