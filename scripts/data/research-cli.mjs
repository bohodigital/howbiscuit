#!/usr/bin/env node
import { readAcceptedPointer, stableJson, validateRelease } from './release-lib.mjs';

const [command = 'list', ...args] = process.argv.slice(2);
const valueFor = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const release = validateRelease(readAcceptedPointer().releaseId, { requireAccepted: true });
const packetId = valueFor('--packet') ?? valueFor('--topic');
const sourceId = valueFor('--source');
const productId = valueFor('--product');
const locationId = valueFor('--location');
const filtered = release.packets.filter((packet) => (
  (!packetId || packet.id === packetId)
  && (!sourceId || packet.sourceIds.includes(sourceId) || packet.sourceIds.some((id) => id.startsWith(`${sourceId}-`)))
  && (!productId || packet.productScope.includes(productId) || packet.evidenceRecordIds.some((id) => id.includes(productId)))
  && (!locationId || packet.evidenceRecordIds.some((id) => id.includes(locationId)) || packet.id.includes('kroger'))
));

if (command === 'list') {
  process.stdout.write(`${filtered.map((packet) => `${packet.id}\t${packet.status}\t${packet.approval.state}\t${packet.reviewDueAt}\t${packet.title}`).join('\n')}\n`);
} else if (command === 'status') {
  if (!packetId || filtered.length !== 1) throw new Error('Usage: research:status -- --packet <packet-id>');
  process.stdout.write(`${stableJson(filtered[0])}`);
} else if (command === 'packet') {
  if (!packetId && !sourceId && !productId) throw new Error('Usage: research:packet -- --topic <id> | --source <id> | --product <id> [--location <id>]');
  if (!filtered.length) throw new Error('No approved packet matches the requested scope.');
  process.stdout.write(`${stableJson({ schemaVersion: '2.0.0', releaseId: release.manifest.releaseId, packets: filtered })}`);
} else if (command === 'validate') {
  process.stdout.write(`Research validation passed: ${release.packets.length} substantive approved Packet v2 records from ${release.manifest.releaseId}.\n`);
} else if (command === 'approve' || command === 'retire') {
  const reviewer = valueFor('--reviewer');
  if (!packetId || !reviewer) throw new Error(`Usage: research:${command} -- --packet <packet-id> --reviewer <governed-id>`);
  if (!release.packets.some(({ id }) => id === packetId)) throw new Error(`Unknown packet: ${packetId}`);
  throw new Error(`Accepted releases are immutable. ${command} requires a new release candidate and the existing owner/editorial approval record; no in-place approval bypass is permitted.`);
} else {
  throw new Error('Usage: research-cli.mjs packet|validate|list|status|approve|retire');
}
