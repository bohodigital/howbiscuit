import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  normalizeEia, normalizeFdc, normalizeHud, normalizeKrogerMapping, normalizeMmn, normalizeNass,
} from '../../src/lib/data/contracts.mjs';
import { validateBrokerEnvelope } from '../../scripts/data/release-lib.mjs';

const release=JSON.parse(readFileSync(new URL('../../src/generated/data/release.v1.json',import.meta.url),'utf8'));
const packets=JSON.parse(readFileSync(new URL('../../src/generated/data/research-packets.v1.json',import.meta.url),'utf8'));

test('release contains six source domains and no Best Buy records',()=>{
  assert.deepEqual([...new Set(Object.values(release.sources).map(({sourceFamilyId})=>sourceFamilyId))].sort(),['eia','fooddata','hud','kroger','mymarketnews','nass']);
  assert.deepEqual(Object.keys(release.sources).filter(id=>id.startsWith('eia-')).sort(),['eia-residential-electricity','eia-residential-natural-gas','eia-weekly-gasoline']);
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
  assert.ok(packets.packets.length>=25);
  for(const packet of packets.packets) {
    assert.equal(packet.schemaVersion,'2.0.0');
    assert.equal(packet.status,'validated');
    assert.equal(packet.approval.state,'approved');
    assert.ok(packet.claims.length>0);
    assert.ok(packet.claims.every(claim=>claim.text!==packet.researchQuestion&&claim.evidenceRecordIds.length>0));
    for(const id of packet.evidenceRecordIds) assert.ok(ids.has(id),`${packet.id}: ${id}`);
  }
});

test('broker envelope rejects credentials, nesting, unknown providers, and digest mismatch',()=>{
  const source=release.sources['hud-usps-crosswalk'];
  const envelope={
    schemaVersion:'1.0.0',providerId:'hud',operation:'zip-crosswalk',parameters:{zip:'60010'},
    retrievedAt:source.retrievedAt,source:{attribution:source.provider,documentationUrl:source.url},
    quota:{state:'broker-managed'},warnings:[],truncated:false,records:[{zip:'60010'}],contentDigest:'bad',
  };
  assert.throws(()=>validateBrokerEnvelope(envelope),/digest mismatch/);
  assert.throws(()=>validateBrokerEnvelope({...envelope,providerId:'unknown'}),/unknown provider/);
  assert.throws(()=>validateBrokerEnvelope({...envelope,parameters:{authorization:'secret'}}),/credential-shaped/);
  assert.throws(()=>validateBrokerEnvelope({...envelope,records:[{zip:{nested:true}}]}),/nested field/);
});

test('provider-specific boundaries retain ambiguity, forecast status, exact matching, and unknown availability',()=>{
  const weighted=release.datasets.geographyRelationships.filter(row=>row.zip==='60010'&&row.geographyType==='county');
  assert.equal(weighted.length,4);
  assert.ok(Math.abs(weighted.reduce((sum,row)=>sum+row.residentialRatio,0)-1)<1e-9);
  assert.ok(release.datasets.agriculturalStatistics.some(row=>row.classification==='forecast'));
  assert.ok(release.datasets.agriculturalStatistics.some(row=>row.classification==='final'));
  assert.ok(release.datasets.merchantMappings.filter(row=>row.approved&&row.matchConfidence.startsWith('exact-')).length>=25);
  assert.ok(release.datasets.offerObservations.every(row=>row.priceAmount!==null||row.availability==='unknown'));
  assert.ok(release.datasets.foodNutrients.every(row=>row.nutrientName&&row.unit&&row.basis));
});
