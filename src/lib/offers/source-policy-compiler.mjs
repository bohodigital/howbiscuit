import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { load as parseYaml } from 'js-yaml';

import { canonicalJson } from './canonical-json.mjs';
import { SOURCE_POLICY_SCHEMA_VERSION, sourcePolicySchema } from './source-policy.mjs';

const MAX_POLICY_BYTES = 128 * 1024;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function compileSourcePolicies(root) {
  const policyRoot = path.join(root, 'content', 'source-policies');
  if (!existsSync(policyRoot)) return Object.freeze({ schemaVersion: SOURCE_POLICY_SCHEMA_VERSION, policies: [] });
  const policies = [];
  const ids = new Set();
  for (const entry of readdirSync(policyRoot, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
    if (entry.name.startsWith('.')) continue;
    if (!entry.isFile() || !entry.name.endsWith('.yaml')) throw new Error(`content/source-policies/${entry.name}: unexpected policy entry`);
    const filePath = path.join(policyRoot, entry.name);
    const stat = lstatSync(filePath);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_POLICY_BYTES) throw new Error(`content/source-policies/${entry.name}: unsafe policy file`);
    const policy = sourcePolicySchema.parse(parseYaml(readFileSync(filePath, 'utf8')));
    if (ids.has(policy.sourceId)) throw new Error(`Duplicate source policy ID: ${policy.sourceId}`);
    ids.add(policy.sourceId);
    policies.push(Object.freeze({ ...policy, policyDigest: sha256(canonicalJson(policy)) }));
  }
  return Object.freeze({ schemaVersion: SOURCE_POLICY_SCHEMA_VERSION, policies: Object.freeze(policies) });
}
