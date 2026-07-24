import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('broker doctor declares the six server-managed sources and excludes Best Buy',()=>{
  const result=spawnSync(process.execPath,['scripts/providers/broker-contract.mjs','doctor'],{cwd:process.cwd(),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const output=JSON.parse(result.stdout);
  assert.equal(output.credentialHandling,'server-managed');
  assert.equal(output.activeSources.length,6);
  assert.deepEqual(output.excludedSources,['best-buy']);
});

test('broker response validator accepts bounded safe envelopes',()=>{
  const result=spawnSync(process.execPath,['scripts/providers/broker-contract.mjs','validate-response'],{
    cwd:process.cwd(),encoding:'utf8',
    input:JSON.stringify({api_id:'eia',operation:'query_data',status:'ok',records:[{period:'2026-05',value:18.44}],source:{retrieved_at:'2026-07-24T01:35:00Z'},truncated:false}),
  });
  assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).sourceId,'eia-weekly-gasoline');
});

test('broker response validator rejects Best Buy and unbounded envelopes',()=>{
  const bestBuy=spawnSync(process.execPath,['scripts/providers/broker-contract.mjs','validate-response'],{
    cwd:process.cwd(),encoding:'utf8',
    input:JSON.stringify({api_id:'best_buy',operation:'products',status:'ok',records:[],source:{retrieved_at:'2026-07-24T00:00:00Z'}}),
  });
  assert.notEqual(bestBuy.status,0);
  const oversized=spawnSync(process.execPath,['scripts/providers/broker-contract.mjs','validate-response'],{
    cwd:process.cwd(),encoding:'utf8',
    input:JSON.stringify({api_id:'eia',operation:'query_data',status:'ok',records:Array.from({length:1001},()=>({})),source:{retrieved_at:'2026-07-24T00:00:00Z'}}),
  });
  assert.notEqual(oversized.status,0);
});
