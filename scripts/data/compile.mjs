#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RELEASE_ID, RETRIEVED_AT, agriculturalStatistics, energyObservations, foods,
  geographyRelationships, marketObservations, marketReports, merchantMappings, sources, topics,
} from './data-definition.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const generatedRoot = path.join(root, 'src', 'generated', 'data');
const packetRoot = path.join(root, 'docs', 'research', 'packets');
const check = process.argv.includes('--check');
const digest = (value) => createHash('sha256').update(value).digest('hex');

const datasets = {
  geographyRelationships, energyObservations, foods, foodNutrients: [],
  marketReports, marketObservations, agriculturalStatistics, merchantMappings,
  merchantLocations: [], offerObservations: [], unresolvedMappings: [],
};
const recordIndex = new Map(Object.values(datasets).flat().map((record) => [record.id, record]));
const packets = topics.map(([id,title,question,recordIds]) => {
  const records = recordIds.map((recordId) => {
    const record = recordIndex.get(recordId);
    if (!record) throw new Error(`Research packet ${id} references missing record ${recordId}.`);
    return record;
  });
  const sourceIds = [...new Set(records.map(({sourceId})=>sourceId))].sort();
  return {schemaVersion:'1.0.0',id,title,question,generatedAt:RETRIEVED_AT,releaseId:RELEASE_ID,sourceIds,recordIds,
    claimCandidates:[question],limitations:['Provider observations are historical context, not live quotes or personalized advice.'],
    disclosure:'Sources and retrieval times must accompany any published claim.'};
});

const release = {schemaVersion:'1.0.0',releaseId:RELEASE_ID,status:'validated',createdAt:RETRIEVED_AT,
  sources,datasets,manifests:Object.entries(datasets).map(([datasetId,records])=>({datasetId,recordCount:records.length,digest:digest(JSON.stringify(records))}))};
const packetBundle = {schemaVersion:'1.0.0',releaseId:RELEASE_ID,packets};

function emit(file, body) {
  if (check) {
    if (readFileSync(file,'utf8') !== body) throw new Error(`${path.relative(root,file)} is stale; run npm run data:compile.`);
  } else {
    mkdirSync(path.dirname(file),{recursive:true});
    writeFileSync(file,body);
  }
}
emit(path.join(generatedRoot,'release.v1.json'),`${JSON.stringify(release,null,2)}\n`);
emit(path.join(generatedRoot,'research-packets.v1.json'),`${JSON.stringify(packetBundle,null,2)}\n`);
for (const packet of packets) {
  const sourceLines = packet.sourceIds.map((sourceId)=>`- ${sourceId}: ${sources[sourceId].provider} — retrieved ${sources[sourceId].retrievedAt} — ${sources[sourceId].url}`).join('\n');
  emit(path.join(packetRoot,`${packet.id}.md`),`# ${packet.title}\n\nPacket ID: \`${packet.id}\`  \nRelease: \`${RELEASE_ID}\`\n\n## Research question\n\n${packet.question}\n\n## Evidence records\n\n${packet.recordIds.map(id=>`- \`${id}\``).join('\n')}\n\n## Sources\n\n${sourceLines}\n\n## Claim candidate\n\n${packet.claimCandidates[0]}\n\n## Limitations\n\n${packet.limitations[0]} ${packet.disclosure}\n`);
}
process.stdout.write(`Data release ${check?'check':'compile'} passed: ${Object.values(datasets).flat().length} records, ${packets.length} research packets, 6 active sources, Best Buy excluded.\n`);
