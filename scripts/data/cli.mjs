#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileSourcePolicies } from '../../src/lib/offers/source-policy-compiler.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
const command=process.argv[2]??'status';
const release=JSON.parse(readFileSync(path.join(root,'src/generated/data/release.v1.json'),'utf8'));
const packets=JSON.parse(readFileSync(path.join(root,'src/generated/data/research-packets.v1.json'),'utf8')).packets;
const policies=compileSourcePolicies(root).policies;
const active=policies.filter(p=>p.lifecycle==='active'&&p.releaseMembership);
const excluded=policies.filter(p=>p.lifecycle==='excluded');
if(command==='status') {
  process.stdout.write(JSON.stringify({releaseId:release.releaseId,status:release.status,activeSources:active.map(p=>p.sourceId),excludedSources:excluded.map(p=>p.sourceId),recordCount:Object.values(release.datasets).flat().length,packetCount:packets.length},null,2)+'\n');
} else if(command==='coverage') {
  process.stdout.write(`${active.length}/6 active release sources; ${release.datasets.geographyRelationships.length} geography relationships; ${release.datasets.energyObservations.length} energy observations; ${release.datasets.foods.length} foods; ${release.datasets.agriculturalStatistics.length} agricultural statistics; ${release.datasets.merchantMappings.length} approved Kroger mappings; ${packets.length}/18 packets.\n`);
} else if(command==='list-sources') {
  process.stdout.write(active.map(p=>`${p.sourceId}\t${p.datasets.join(',')}`).join('\n')+'\n');
} else if(command==='validate') {
  if(active.length!==6) throw new Error(`Expected 6 active release sources, found ${active.length}.`);
  if(!excluded.some(p=>p.sourceId==='best-buy')) throw new Error('Best Buy must remain explicitly excluded.');
  if(packets.length<18) throw new Error('At least 18 research packets are required.');
  if(release.datasets.foodNutrients.length>0 && release.datasets.foodNutrients.some(row=>!row.nutrientName||!row.unit)) throw new Error('Incomplete nutrient observations.');
  process.stdout.write(`Data validation passed: ${active.length} active sources, ${packets.length} packets, Best Buy excluded.\n`);
} else throw new Error('Usage: cli.mjs status|coverage|list-sources|validate');
