import { readFileSync } from 'node:fs';

import { load as parseYaml } from 'js-yaml';

import { metroProfileSchema } from './schema.mjs';

export function compileMetroProfiles(file) {
  const input = parseYaml(readFileSync(file, 'utf8'));
  if (!Array.isArray(input)) throw new Error('Metro profile source must be an array.');
  const slugs = new Set();
  const profiles = input.map((entry) => {
    const profile = metroProfileSchema.parse(entry);
    if (slugs.has(profile.metroSlug)) throw new Error(`Duplicate metro profile: ${profile.metroSlug}`);
    slugs.add(profile.metroSlug);
    return Object.freeze(profile);
  });
  return Object.freeze(profiles);
}
