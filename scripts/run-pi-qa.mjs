import { spawnSync } from 'node:child_process';

if (process.platform !== 'linux' || process.arch !== 'arm64') {
  console.warn('qa:pi is intended for the ARM64 Raspberry Pi; continuing because the command was requested.');
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npmCommand, ['run', 'qa'], {
  cwd: process.cwd(),
  env: { ...process.env, HOWBISCUIT_SKIP_PAGEFIND: '1' },
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
