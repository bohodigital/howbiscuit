#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileSourcePolicies } from '../../src/lib/offers/source-policy-compiler.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
const activeApiIds=new Set(['hud_usps','eia','kroger','data_gov','usda_mymarketnews','nass']);
const sourceByApi={hud_usps:'hud-usps-crosswalk',eia:'eia-weekly-gasoline',kroger:'kroger',data_gov:'usda-fooddata-central',usda_mymarketnews:'usda-mymarketnews',nass:'usda-nass-quickstats'};
const command=process.argv[2]??'doctor';

if(command==='doctor'){
  const policies=compileSourcePolicies(root).policies;
  const active=policies.filter(p=>p.lifecycle==='active'&&p.releaseMembership).map(p=>p.sourceId).sort();
  const bestBuy=policies.find(p=>p.sourceId==='best-buy');
  if(active.length!==6||bestBuy?.lifecycle!=='excluded') throw new Error('Broker policy membership is invalid.');
  process.stdout.write(`${JSON.stringify({ok:true,broker:'local1-public-api-tools',credentialHandling:'server-managed',activeSources:active,excludedSources:['best-buy']})}\n`);
}else if(command==='validate-response'){
  const input=JSON.parse(readFileSync(0,'utf8'));
  if(!activeApiIds.has(input.api_id)) throw new Error('Response uses a source outside this release.');
  if(input.status!=='ok'||!Array.isArray(input.records)||!input.source?.retrieved_at) throw new Error('Invalid bounded broker response.');
  if(input.records.length>1000) throw new Error('Broker response exceeds the import bound.');
  process.stdout.write(`${JSON.stringify({ok:true,sourceId:sourceByApi[input.api_id],operation:input.operation,recordCount:input.records.length,retrievedAt:input.source.retrieved_at,truncated:Boolean(input.truncated)})}\n`);
}else{
  throw new Error('Usage: broker-contract.mjs doctor|validate-response');
}
