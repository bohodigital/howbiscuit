import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  normalizeEia, normalizeFdc, normalizeHud, normalizeKrogerMapping, normalizeMmn, normalizeNass,
} from '../../src/lib/data/contracts.mjs';

const release=JSON.parse(readFileSync(new URL('../../src/generated/data/release.v1.json',import.meta.url),'utf8'));
const packets=JSON.parse(readFileSync(new URL('../../src/generated/data/research-packets.v1.json',import.meta.url),'utf8'));

test('release contains six source domains and no Best Buy records',()=>{
  assert.deepEqual(Object.keys(release.sources).sort(),['eia-weekly-gasoline','hud-usps-crosswalk','kroger','usda-fooddata-central','usda-mymarketnews','usda-nass-quickstats']);
  assert.doesNotMatch(JSON.stringify(release),/best-buy|best buy/i);
});

test('provider normalizers enforce units, identity and source boundaries',()=>{
  assert.equal(normalizeHud({zip:'60614',geoid:'17031',city:'CHICAGO',state:'IL',res_ratio:1},'county').geographyId,'17031');
  assert.equal(normalizeEia({seriesId:'electricity-residential-us',geographyId:'US',period:'2026-05',value:'18.44',unit:'cents/kWh'}).value,18.44);
  assert.equal(normalizeFdc({fdcId:789890,description:'Flour',dataType:'Foundation'}).id,'fdc-789890');
  assert.equal(normalizeMmn({reportId:'1089',title:'Butter',unitBasis:'$/lb'}).sourceId,'usda-mymarketnews');
  assert.equal(normalizeNass({commodity:'CORN',period:'2025',value:'17,020,549,000',unit:'BU'}).value,17020549000);
  assert.equal(normalizeNass({commodity:'CORN',period:'2025',value:'(D)',unit:'BU'}).suppressed,true);
  assert.throws(()=>normalizeKrogerMapping({canonicalProductId:'product',merchantProductId:'1',approved:true,identityEvidence:'x',matchConfidence:'probable'}),/probable/);
});

test('research packets are deterministic and cite only existing records',()=>{
  const ids=new Set(Object.values(release.datasets).flat().map(row=>row.id));
  assert.equal(packets.packets.length,18);
  for(const packet of packets.packets) for(const id of packet.recordIds) assert.ok(ids.has(id),`${packet.id}: ${id}`);
});
