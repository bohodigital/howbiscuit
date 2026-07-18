import { execFileSync, spawnSync } from 'node:child_process';

import { assertPiPagefindSkipAllowed } from './lib/pagefind-platform-policy.mjs';

const pageSize = Number.parseInt(execFileSync('getconf', ['PAGESIZE'], { encoding: 'utf8' }).trim(), 10);
const proof = { platform: process.platform, arch: process.arch, pageSize };
assertPiPagefindSkipAllowed(proof);

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npmCommand, ['run', 'qa:pi:inner'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    HOWBISCUIT_SKIP_PAGEFIND: '1',
  },
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
