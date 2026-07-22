import { createHash } from 'node:crypto';

import { canonicalJson } from '../offers/canonical-json.mjs';

function releaseId(compiled) {
  const projectionIdentity = {
    manifests: compiled.manifests.map(({ datasetId, fileSha256 }) => ({ datasetId, fileSha256 })).sort((left, right) => left.datasetId.localeCompare(right.datasetId, 'en')),
    metroProfiles: [...compiled.metroProfiles].sort((left, right) => left.metroSlug.localeCompare(right.metroSlug, 'en')),
    profiles: [...compiled.profiles].sort((left, right) => left.zip.localeCompare(right.zip, 'en')),
  };
  return createHash('sha256').update(canonicalJson(projectionIdentity)).digest('hex');
}

export function locationProjectionStatements(db, compiled, importedAt = new Date().toISOString()) {
  if (!db || typeof db.prepare !== 'function') throw new Error('A D1-compatible DB binding is required.');
  const statements = [];
  const datasetReleaseId = releaseId(compiled);
  for (const manifest of compiled.manifests) statements.push(db.prepare(`INSERT INTO dataset_manifests (
    dataset_id, publisher, dataset_name, vintage, retrieved_at, source_url, public_use_basis,
    file_sha256, import_script_version, row_counts_json, validation_results_json, imported_at
  ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
  ON CONFLICT(dataset_id) DO UPDATE SET publisher=excluded.publisher, dataset_name=excluded.dataset_name,
    vintage=excluded.vintage, retrieved_at=excluded.retrieved_at, source_url=excluded.source_url,
    public_use_basis=excluded.public_use_basis, file_sha256=excluded.file_sha256,
    import_script_version=excluded.import_script_version, row_counts_json=excluded.row_counts_json,
    validation_results_json=excluded.validation_results_json, imported_at=excluded.imported_at`).bind(
    manifest.datasetId, manifest.publisher, manifest.datasetName, manifest.vintage, manifest.retrievedAt,
    manifest.sourceUrl, manifest.publicUseBasis, manifest.fileSha256, manifest.importScriptVersion,
    canonicalJson(manifest.rowCounts), canonicalJson(manifest.validationResults), importedAt,
  ));
  for (const metro of compiled.metroProfiles) statements.push(db.prepare(`INSERT INTO metro_profiles (
    metro_slug, display_name, cbsa_code, dataset_vintage, status, dataset_release_id
  ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
  ON CONFLICT(metro_slug) DO UPDATE SET display_name=excluded.display_name, cbsa_code=excluded.cbsa_code,
    dataset_vintage=excluded.dataset_vintage, status=excluded.status,
    dataset_release_id=excluded.dataset_release_id`).bind(
    metro.metroSlug, metro.displayName, metro.cbsaCodes[0], `${metro.censusVintage}/${metro.hudVintage}`, metro.indexStatus, datasetReleaseId,
  ));
  for (const profile of compiled.profiles.filter((entry) => entry.zcta)) statements.push(db.prepare(`INSERT INTO location_profiles (
    zcta, centroid_latitude, centroid_longitude, primary_county_fips, county_weights_json,
    cbsa_weights_json, metro_slug, source_vintage, dataset_release_id
  ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
  ON CONFLICT(zcta) DO UPDATE SET centroid_latitude=excluded.centroid_latitude,
    centroid_longitude=excluded.centroid_longitude, primary_county_fips=excluded.primary_county_fips,
    county_weights_json=excluded.county_weights_json, cbsa_weights_json=excluded.cbsa_weights_json,
    metro_slug=excluded.metro_slug, source_vintage=excluded.source_vintage,
    dataset_release_id=excluded.dataset_release_id`).bind(
    profile.zcta, profile.centroid.latitude, profile.centroid.longitude, profile.primaryCountyFips,
    canonicalJson(profile.countyWeights), canonicalJson(profile.cbsaWeights), profile.metroSlug, profile.censusVintage, datasetReleaseId,
  ));
  for (const profile of compiled.profiles) statements.push(db.prepare(`INSERT INTO zip_location_crosswalk (
    zip, zcta, centroid_latitude, centroid_longitude, primary_county_fips, county_weights_json,
    cbsa_weights_json, primary_cbsa, metro_slug, census_vintage, hud_vintage, dataset_release_id
  ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
  ON CONFLICT(zip) DO UPDATE SET zcta=excluded.zcta, centroid_latitude=excluded.centroid_latitude,
    centroid_longitude=excluded.centroid_longitude, primary_county_fips=excluded.primary_county_fips,
    county_weights_json=excluded.county_weights_json, cbsa_weights_json=excluded.cbsa_weights_json,
    primary_cbsa=excluded.primary_cbsa, metro_slug=excluded.metro_slug,
    census_vintage=excluded.census_vintage, hud_vintage=excluded.hud_vintage,
    dataset_release_id=excluded.dataset_release_id`).bind(
    profile.zip, profile.zcta, profile.centroid?.latitude ?? null, profile.centroid?.longitude ?? null,
    profile.primaryCountyFips, canonicalJson(profile.countyWeights), canonicalJson(profile.cbsaWeights),
    profile.primaryCbsa, profile.metroSlug, profile.censusVintage, profile.hudVintage, datasetReleaseId,
  ));
  statements.push(db.prepare('DELETE FROM zip_location_crosswalk WHERE dataset_release_id<>?1').bind(datasetReleaseId));
  statements.push(db.prepare('DELETE FROM location_profiles WHERE dataset_release_id<>?1').bind(datasetReleaseId));
  statements.push(db.prepare('DELETE FROM metro_profiles WHERE dataset_release_id<>?1').bind(datasetReleaseId));
  const datasetIds = compiled.manifests.map(({ datasetId }) => datasetId).sort();
  const placeholders = datasetIds.map((_, index) => `?${index + 1}`).join(', ');
  statements.push(db.prepare(`DELETE FROM dataset_manifests WHERE dataset_id NOT IN (${placeholders})`).bind(...datasetIds));
  return statements;
}

export async function syncLocationProjection(db, compiled, importedAt = new Date().toISOString()) {
  if (!db || typeof db.batch !== 'function') throw new Error('A D1-compatible batch API is required.');
  return db.batch(locationProjectionStatements(db, compiled, importedAt));
}
