import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { compileMetroProfiles } from '../../src/lib/location/metro-profiles.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('the controlled metro set is substantive, static, and noindex until dataset activation', () => {
  const profiles = compileMetroProfiles(path.join(root, 'content', 'metro-profiles', 'profiles.yaml'));
  assert.equal(profiles.length, 12);
  assert.equal(new Set(profiles.flatMap((profile) => profile.cbsaCodes)).size, 12);
  for (const profile of profiles) {
    assert.equal(profile.indexStatus, 'draft-noindex');
    assert.deepEqual(profile.supportedRetailers, []);
    assert.ok(profile.geographicScope.length >= 80);
    assert.ok(profile.shoppingContext.join(' ').length >= 180);
    assert.match(profile.hudVintage, /^pending-/);
  }
});
