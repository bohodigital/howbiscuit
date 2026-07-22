import { createHash } from 'node:crypto';

import { datasetManifestSchema, metroProfileSchema, storedLocationProfileSchema, zipCodeSchema } from './schema.mjs';

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function weight(row) {
  const value = Number(row.res_ratio ?? row.weight);
  if (!Number.isFinite(value) || value <= 0 || value > 1) throw new Error('Crosswalk weight must be within (0, 1].');
  return value;
}
function normalizeWeighted(rows, key) {
  const grouped = new Map();
  for (const row of rows) {
    const zip = zipCodeSchema.parse(String(row.zip).padStart(5, '0'));
    const code = String(row[key]);
    const values = grouped.get(zip) || [];
    values.push({ code, weight: weight(row) });
    grouped.set(zip, values);
  }
  for (const [zip, values] of grouped) {
    const total = values.reduce((sum, item) => sum + item.weight, 0);
    if (total < 0.98 || total > 1.02) throw new Error(`Crosswalk weights for ${zip} total ${total}, not approximately 1.`);
    values.sort((left, right) => right.weight - left.weight || left.code.localeCompare(right.code, 'en'));
  }
  return grouped;
}

export function validateDatasetArtifact(manifestInput, bytes) {
  const manifest = datasetManifestSchema.parse(manifestInput);
  if (sha256(bytes) !== manifest.fileSha256) throw new Error(`${manifest.datasetId}: file digest mismatch.`);
  return manifest;
}

export function compileLocationProfiles({ censusManifest: censusInput, hudManifest: hudInput, zctaRows, countyRows, cbsaRows, metroProfiles }) {
  const censusManifest = datasetManifestSchema.parse(censusInput);
  const hudManifest = datasetManifestSchema.parse(hudInput);
  if (censusManifest.rowCounts.accepted !== zctaRows.length) throw new Error('Census manifest accepted-row count does not match the normalized artifact.');
  if (hudManifest.rowCounts.accepted !== countyRows.length + cbsaRows.length) throw new Error('HUD manifest accepted-row count does not match the normalized artifacts.');
  const metros = metroProfiles.map((profile) => metroProfileSchema.parse(profile));
  const metroByCbsa = new Map();
  for (const profile of metros) for (const cbsa of profile.cbsaCodes) {
    if (metroByCbsa.has(cbsa)) throw new Error(`CBSA ${cbsa} is assigned to multiple metro profiles.`);
    metroByCbsa.set(cbsa, profile.metroSlug);
  }
  const zctas = new Map();
  for (const row of zctaRows) {
    const zcta = zipCodeSchema.parse(String(row.zcta).padStart(5, '0'));
    if (zctas.has(zcta)) throw new Error(`Duplicate Census ZCTA row: ${zcta}`);
    zctas.set(zcta, { latitude: Number(row.latitude), longitude: Number(row.longitude) });
  }
  for (const [zcta, centroid] of zctas) storedLocationProfileSchema.shape.centroid.unwrap().parse(centroid, { path: [zcta] });
  const counties = normalizeWeighted(countyRows, 'countyFips');
  const cbsas = normalizeWeighted(cbsaRows, 'cbsa');
  const profiles = [];
  for (const zip of [...new Set([...counties.keys(), ...cbsas.keys()])].sort()) {
    const countyWeights = (counties.get(zip) || []).map((item) => ({ countyFips: item.code, weight: item.weight }));
    if (countyWeights.length === 0) throw new Error(`${zip}: HUD county relationship is required.`);
    const cbsaWeights = (cbsas.get(zip) || []).map((item) => ({ cbsa: item.code, weight: item.weight, metroSlug: metroByCbsa.get(item.code) || null }));
    const primaryCbsa = cbsaWeights[0]?.cbsa || null;
    profiles.push(storedLocationProfileSchema.parse({
      zip,
      zcta: zctas.has(zip) ? zip : null,
      centroid: zctas.get(zip) || null,
      primaryCountyFips: countyWeights[0].countyFips,
      countyWeights,
      cbsaWeights,
      primaryCbsa,
      metroSlug: cbsaWeights[0]?.metroSlug || null,
      censusVintage: censusManifest.vintage,
      hudVintage: hudManifest.vintage,
      ambiguity: {
        county: countyWeights.length > 1,
        cbsa: cbsaWeights.length > 1,
        zctaApproximation: true,
      },
    }));
  }
  return Object.freeze({ schemaVersion: '1.0.0', manifests: [censusManifest, hudManifest], metroProfiles: metros, profiles });
}
