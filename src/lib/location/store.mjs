import { LOCATION_SESSION_TTL_SECONDS, resolvedLocationSchema, storedLocationProfileSchema } from './schema.mjs';

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

export async function loadLocationProfile(db, zip) {
  const row = await db.prepare(`SELECT zip, zcta, centroid_latitude AS latitude, centroid_longitude AS longitude,
      primary_county_fips AS primaryCountyFips, county_weights_json AS countyWeightsJson,
      cbsa_weights_json AS cbsaWeightsJson, primary_cbsa AS primaryCbsa, metro_slug AS metroSlug,
      census_vintage AS censusVintage, hud_vintage AS hudVintage
    FROM zip_location_crosswalk WHERE zip=?1`).bind(zip).first();
  if (!row) return null;
  const countyWeights = JSON.parse(row.countyWeightsJson);
  const cbsaWeights = JSON.parse(row.cbsaWeightsJson);
  return storedLocationProfileSchema.parse({
    zip: row.zip,
    zcta: row.zcta,
    centroid: row.zcta ? { latitude: row.latitude, longitude: row.longitude } : null,
    primaryCountyFips: row.primaryCountyFips,
    countyWeights,
    cbsaWeights,
    primaryCbsa: row.primaryCbsa,
    metroSlug: row.metroSlug,
    censusVintage: row.censusVintage,
    hudVintage: row.hudVintage,
    ambiguity: { county: countyWeights.length > 1, cbsa: cbsaWeights.length > 1, zctaApproximation: true },
  });
}

export async function resolveLocation(db, zip, now = new Date(), randomUUID = () => crypto.randomUUID()) {
  const profile = await loadLocationProfile(db, zip);
  if (!profile) return null;
  const sessionToken = randomUUID();
  const sessionTokenDigest = await sha256(sessionToken);
  const sessionExpiresAt = new Date(now.valueOf() + LOCATION_SESSION_TTL_SECONDS * 1000).toISOString();
  await db.prepare(`INSERT INTO lookup_sessions (session_token_digest, coarse_metro_slug, created_at, expires_at)
    VALUES (?1, ?2, ?3, ?4)`).bind(sessionTokenDigest, profile.metroSlug, now.toISOString(), sessionExpiresAt).run();
  return resolvedLocationSchema.parse({
    ...profile,
    inputZip: zip,
    resolvedAt: now.toISOString(),
    sessionToken,
    sessionExpiresAt,
    boundaryNotice: 'ZIP codes are USPS delivery constructs; ZCTAs and weighted county/metro mappings are statistical approximations.',
  });
}

export { sha256 as locationTokenDigest };
