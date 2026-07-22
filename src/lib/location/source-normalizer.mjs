import { createHash } from 'node:crypto';

import { canonicalJson } from '../offers/canonical-json.mjs';
import { zipCodeSchema } from './schema.mjs';

const CENSUS_SOURCE_URL = 'https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2025.html';
const HUD_SOURCE_URL = 'https://www.huduser.gov/portal/dataset/uspszip-api.html';

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function finiteCoordinate(value, minimum, maximum, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) throw new Error(`${label} is outside its valid range.`);
  return number;
}

export function parseCensusGazetteer(rawText) {
  const lines = String(rawText).replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error('Census Gazetteer artifact has no data rows.');
  const delimiter = lines[0].includes('|') ? '|' : '\t';
  const headers = lines[0].split(delimiter).map((value) => value.trim().toUpperCase());
  const required = ['GEOID', 'INTPTLAT', 'INTPTLONG'];
  const indexes = Object.fromEntries(required.map((name) => [name, headers.indexOf(name)]));
  if (Object.values(indexes).some((index) => index < 0)) throw new Error('Census Gazetteer header is missing GEOID, INTPTLAT, or INTPTLONG.');
  const seen = new Set();
  return lines.slice(1).map((line, rowIndex) => {
    const columns = line.split(delimiter).map((value) => value.trim());
    const zcta = zipCodeSchema.parse(columns[indexes.GEOID]);
    if (seen.has(zcta)) throw new Error(`Duplicate Census ZCTA row: ${zcta}`);
    seen.add(zcta);
    return {
      zcta,
      latitude: finiteCoordinate(columns[indexes.INTPTLAT], -90, 90, `Census row ${rowIndex + 2} latitude`),
      longitude: finiteCoordinate(columns[indexes.INTPTLONG], -180, 180, `Census row ${rowIndex + 2} longitude`),
    };
  }).sort((left, right) => left.zcta.localeCompare(right.zcta, 'en'));
}

function hudResults(rawText) {
  const document = JSON.parse(String(rawText));
  const envelopes = Array.isArray(document) ? document : [document];
  return envelopes.flatMap((envelope) => {
    const results = envelope?.data?.results ?? envelope?.results;
    if (!Array.isArray(results)) throw new Error('HUD crosswalk response is missing data.results.');
    return results;
  });
}

export function parseHudCrosswalk(rawText, kind) {
  if (!['county', 'cbsa'].includes(kind)) throw new Error('HUD crosswalk kind must be county or cbsa.');
  const codeKey = kind === 'county' ? 'countyFips' : 'cbsa';
  const rows = hudResults(rawText).map((row, rowIndex) => {
    const zip = zipCodeSchema.parse(String(row.zip ?? row.ZIP ?? '').padStart(5, '0'));
    const code = String(row.geoid ?? row.GEOID ?? row[codeKey] ?? '').padStart(5, '0');
    if (!/^\d{5}$/.test(code)) throw new Error(`HUD ${kind} row ${rowIndex + 1} has an invalid GEOID.`);
    const ratio = Number(row.res_ratio ?? row.RES_RATIO ?? row.weight);
    if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 1) throw new Error(`HUD ${kind} row ${rowIndex + 1} has an invalid residential ratio.`);
    return { zip, [codeKey]: code, res_ratio: ratio };
  });
  rows.sort((left, right) => left.zip.localeCompare(right.zip, 'en') || left[codeKey].localeCompare(right[codeKey], 'en'));
  return rows;
}

function manifest({ datasetId, publisher, datasetName, vintage, retrievedAt, sourceUrl, normalizedBytes, accepted, rawDigests }) {
  return {
    schemaVersion: '1.0.0', datasetId, publisher, datasetName, vintage, retrievedAt, sourceUrl,
    publicUseBasis: 'Official U.S. government public-data source; activation still requires the recorded Boho legal and privacy review.',
    fileSha256: sha256(normalizedBytes), importScriptVersion: '1.0.0',
    rowCounts: { input: accepted, accepted, rejected: 0 },
    validationResults: [`Normalized rows passed strict schema validation. Raw artifact SHA-256: ${rawDigests.join(', ')}.`],
  };
}

export function buildNormalizedLocationArtifacts({ censusRaw, hudCountyRaw, hudCbsaRaw, censusVintage, hudVintage, retrievedAt }) {
  const zctaRows = parseCensusGazetteer(censusRaw);
  const countyRows = parseHudCrosswalk(hudCountyRaw, 'county');
  const cbsaRows = parseHudCrosswalk(hudCbsaRaw, 'cbsa');
  const censusBytes = Buffer.from(`${canonicalJson({ zctaRows })}\n`);
  const hudBytes = Buffer.from(`${canonicalJson({ countyRows, cbsaRows })}\n`);
  return Object.freeze({
    censusBytes,
    hudBytes,
    censusManifest: manifest({ datasetId: `census-zcta-${censusVintage.toLowerCase()}`, publisher: 'U.S. Census Bureau', datasetName: 'National ZCTA Gazetteer', vintage: censusVintage, retrievedAt, sourceUrl: CENSUS_SOURCE_URL, normalizedBytes: censusBytes, accepted: zctaRows.length, rawDigests: [sha256(censusRaw)] }),
    hudManifest: manifest({ datasetId: `hud-usps-${hudVintage.toLowerCase()}`, publisher: 'HUD USER USPS Crosswalk', datasetName: 'ZIP to county and CBSA residential crosswalks', vintage: hudVintage, retrievedAt, sourceUrl: HUD_SOURCE_URL, normalizedBytes: hudBytes, accepted: countyRows.length + cbsaRows.length, rawDigests: [sha256(hudCountyRaw), sha256(hudCbsaRaw)] }),
  });
}
