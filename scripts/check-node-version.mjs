import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import semver from 'semver';

const scriptPath = fileURLToPath(import.meta.url);
const root = path.dirname(path.dirname(scriptPath));
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

export const SUPPORTED_NODE_RANGE = packageJson.engines.node;

export function assertSupportedNodeVersion(version = process.versions.node, range = SUPPORTED_NODE_RANGE) {
  if (!semver.valid(version) || !semver.satisfies(version, range)) {
    throw new Error(
      `Unsupported Node.js ${version}. How Biscuit requires ${range}. `
      + 'Use a validated Node 22 or Node 24 release before installing, building, testing, or previewing.',
    );
  }
  return version;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    assertSupportedNodeVersion();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
