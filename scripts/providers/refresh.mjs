#!/usr/bin/env node

import { mkdir, open, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import { collectEiaDataset, collectHudPilot, ProviderSmokeError } from './live-provider-client.mjs';

const RUNTIME_ROOT = process.env.HOWBISCUIT_PROVIDER_RUNTIME || '/srv/local1/runtime/howbiscuit/providers';

function selectedProvider(argv) {
  const index = argv.indexOf('--provider');
  const provider = argv[index + 1];
  if (!['eia', 'hud-usps'].includes(provider)) throw new ProviderSmokeError('unsupported-refresh-provider');
  return provider;
}

async function writeAtomic(provider, document) {
  await mkdir(RUNTIME_ROOT, { recursive: true, mode: 0o700 });
  const destination = path.join(RUNTIME_ROOT, `${provider}.json`);
  const temporary = path.join(RUNTIME_ROOT, `.${provider}.${process.pid}.tmp`);
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(document)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, destination);
  await rm(temporary, { force: true });
  return destination;
}

async function main() {
  if (
    process.env.HOWBISCUIT_LIVE_PROVIDER_TESTS !== '1'
    || process.env.HOWBISCUIT_SECRET_BROKER_INJECTED !== '1'
  ) {
    throw new ProviderSmokeError('broker-execution-required');
  }
  const provider = selectedProvider(process.argv.slice(2));
  const expectedSwitch = provider === 'eia' ? 'EIA_CONTEXT_ENABLED' : 'HUD_USPS_ENABLED';
  if (process.env[expectedSwitch] !== 'true') throw new ProviderSmokeError('kill-switch-disabled');
  const collected = provider === 'eia' ? await collectEiaDataset() : await collectHudPilot();
  const refreshedAt = new Date().toISOString();
  await writeAtomic(provider, {
    schemaVersion: '1.0.0',
    provider,
    refreshedAt,
    freshnessTimestamp: collected.freshnessTimestamp,
    accepted: collected.accepted,
    rejected: 0,
    calls: collected.calls,
    dataset: collected.dataset,
  });
  process.stdout.write(`${JSON.stringify({
    ok: true,
    provider,
    refreshedAt,
    freshnessTimestamp: collected.freshnessTimestamp,
    accepted: collected.accepted,
    rejected: 0,
    calls: collected.calls,
  })}\n`);
}

main().catch((error) => {
  const category = error instanceof ProviderSmokeError ? error.category : 'refresh-failed';
  process.stdout.write(`${JSON.stringify({ ok: false, errorCategory: category })}\n`);
  process.exitCode = 1;
});
