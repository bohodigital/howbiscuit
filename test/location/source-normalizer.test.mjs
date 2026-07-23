import assert from 'node:assert/strict';
import test from 'node:test';

import { buildNormalizedLocationArtifacts, parseCensusGazetteer, parseHudCrosswalk } from '../../src/lib/location/source-normalizer.mjs';
import { validateDatasetArtifact } from '../../src/lib/location/compiler.mjs';

const census = 'GEOID|ALAND|INTPTLAT|INTPTLONG\n60614|1|41.9227|-87.6543\n10001|1|40.7506|-73.9972\n';
const county = JSON.stringify({ data: { results: [{ zip: '60614', geoid: '17031', res_ratio: 1 }] } });
const cbsa = JSON.stringify([{ data: { results: [{ zip: '60614', geoid: '16980', res_ratio: 1 }] } }]);

test('raw Census Gazetteer and HUD API envelopes normalize deterministically with bound manifests', () => {
  assert.deepEqual(parseCensusGazetteer(census).map(({ zcta }) => zcta), ['10001', '60614']);
  assert.deepEqual(parseHudCrosswalk(county, 'county'), [{ zip: '60614', countyFips: '17031', res_ratio: 1 }]);
  const first = buildNormalizedLocationArtifacts({ censusRaw: census, hudCountyRaw: county, hudCbsaRaw: cbsa, censusVintage: '2025', hudVintage: '2026-q1', retrievedAt: '2026-07-22' });
  const second = buildNormalizedLocationArtifacts({ censusRaw: census, hudCountyRaw: county, hudCbsaRaw: cbsa, censusVintage: '2025', hudVintage: '2026-q1', retrievedAt: '2026-07-22' });
  assert.deepEqual(first.censusBytes, second.censusBytes);
  assert.equal(first.censusManifest.rowCounts.accepted, 2);
  assert.equal(first.hudManifest.rowCounts.accepted, 2);
  validateDatasetArtifact(first.censusManifest, first.censusBytes);
  validateDatasetArtifact(first.hudManifest, first.hudBytes);
});

test('raw normalizers reject malformed coordinates, codes, and ratios', () => {
  assert.throws(() => parseCensusGazetteer('GEOID|INTPTLAT|INTPTLONG\n60614|999|-87\n'), /latitude/);
  assert.throws(() => parseHudCrosswalk(JSON.stringify({ data: { results: [{ zip: '60614', geoid: 'x', res_ratio: 1 }] } }), 'county'), /invalid GEOID/);
  assert.throws(() => parseHudCrosswalk(JSON.stringify({ data: { results: [{ zip: '60614', geoid: '17031', res_ratio: 2 }] } }), 'county'), /residential ratio/);
});

test('HUD live API envelopes inherit the requested ZIP without inventing one', () => {
  const payload = JSON.stringify({
    data: [{
      year: '2026',
      quarter: 'Q2',
      input: '60614',
      crosswalk_type: 'zip-cbsa',
      results: [
        { geoid: '16980', res_ratio: 0.91, bus_ratio: 0.8, oth_ratio: 0.7, tot_ratio: 0.89 },
        { geoid: '99999', res_ratio: 0.09, bus_ratio: 0.2, oth_ratio: 0.3, tot_ratio: 0.11 },
      ],
    }],
  });
  assert.deepEqual(parseHudCrosswalk(payload, 'cbsa'), [
    { zip: '60614', cbsa: '16980', res_ratio: 0.91 },
    { zip: '60614', cbsa: '99999', res_ratio: 0.09 },
  ]);
});
