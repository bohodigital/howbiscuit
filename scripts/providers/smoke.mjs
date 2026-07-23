#!/usr/bin/env node

import { PROVIDERS, ProviderSmokeError, smokeProvider } from './live-provider-client.mjs';

function selectedProviders(argv) {
  if (argv.includes('--all')) return [...PROVIDERS];
  const index = argv.indexOf('--provider');
  if (index < 0 || !PROVIDERS.includes(argv[index + 1])) {
    throw new ProviderSmokeError('provider-selection-required');
  }
  return [argv[index + 1]];
}

async function main() {
  if (
    process.env.HOWBISCUIT_LIVE_PROVIDER_TESTS !== '1'
    || process.env.HOWBISCUIT_SECRET_BROKER_INJECTED !== '1'
  ) {
    throw new ProviderSmokeError('broker-execution-required');
  }
  const results = [];
  for (const provider of selectedProviders(process.argv.slice(2))) {
    try {
      results.push(await smokeProvider(provider));
    } catch (error) {
      results.push({
        provider,
        testedAt: new Date().toISOString(),
        calls: null,
        schemaValidation: 'fail',
        mappingValidation: 'fail',
        accepted: 0,
        rejected: 0,
        errorCategory: error instanceof ProviderSmokeError ? error.category : 'validation-failed',
        pass: false,
      });
    }
  }
  const output = { schemaVersion: '1.0.0', live: true, results };
  process.stdout.write(`${JSON.stringify(output)}\n`);
  return results.every((entry) => entry.pass) ? 0 : 1;
}

main().then(
  (code) => { process.exitCode = code; },
  (error) => {
    const category = error instanceof ProviderSmokeError ? error.category : 'validation-failed';
    process.stdout.write(`${JSON.stringify({ schemaVersion: '1.0.0', live: false, errorCategory: category, results: [] })}\n`);
    process.exitCode = 1;
  },
);
