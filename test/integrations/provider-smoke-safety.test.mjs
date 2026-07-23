import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  ProviderSmokeError,
  fetchJson,
  smokeProvider,
} from '../../scripts/providers/live-provider-client.mjs';

function response(body, status = 200, contentType = 'application/json') {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': contentType },
  });
}

test('provider HTTP failures expose only a bounded category, never request credentials', async () => {
  const fakeKey = 'deliberately-fake-api-key-value';
  const fakeToken = 'deliberately-fake-bearer-token-value';
  await assert.rejects(
    fetchJson({
      fetchImpl: async () => response({ error: `echo ${fakeKey} ${fakeToken}` }, 401),
      origin: 'https://provider.example.test',
      pathname: '/fixed',
      query: { api_key: fakeKey },
      headers: { authorization: `Bearer ${fakeToken}` },
    }),
    (error) => {
      assert.ok(error instanceof ProviderSmokeError);
      assert.equal(error.message, 'authentication-failed');
      const serialized = JSON.stringify(error);
      assert.doesNotMatch(serialized, new RegExp(fakeKey));
      assert.doesNotMatch(serialized, new RegExp(fakeToken));
      assert.doesNotMatch(serialized, /provider\.example\.test|api_key|authorization/i);
      return true;
    },
  );
});

test('malformed payloads and transport exceptions do not serialize provider bodies or URLs', async () => {
  await assert.rejects(
    fetchJson({
      fetchImpl: async () => response('secret-shaped-provider-body', 200, 'text/plain'),
      origin: 'https://provider.example.test',
      pathname: '/fixed',
    }),
    (error) => error.message === 'malformed-response'
      && !JSON.stringify(error).includes('secret-shaped-provider-body'),
  );
  await assert.rejects(
    fetchJson({
      fetchImpl: async () => {
        throw new Error('request https://provider.example.test/?api_key=secret');
      },
      origin: 'https://provider.example.test',
      pathname: '/fixed',
    }),
    (error) => error.message === 'transport-failed' && !JSON.stringify(error).includes('api_key'),
  );
});

test('missing credentials fail before transport for every provider', async () => {
  for (const provider of ['eia', 'hud-usps', 'best-buy', 'kroger']) {
    let calls = 0;
    await assert.rejects(
      smokeProvider(provider, {
        environment: {},
        fetchImpl: async () => {
          calls += 1;
          return response({});
        },
      }),
      /credential-missing/,
    );
    assert.equal(calls, 0, provider);
  }
});

test('the live smoke CLI refuses ordinary execution without broker provenance', () => {
  const result = spawnSync(process.execPath, ['scripts/providers/smoke.mjs', '--provider', 'eia'], {
    cwd: process.cwd(),
    env: {},
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.live, false);
  assert.equal(output.errorCategory, 'broker-execution-required');
  assert.deepEqual(output.results, []);
  assert.equal(result.stderr, '');
});

test('the refresh CLI refuses direct execution before any provider call or write', () => {
  const result = spawnSync(process.execPath, ['scripts/providers/refresh.mjs', '--provider', 'eia'], {
    cwd: process.cwd(),
    env: { HOWBISCUIT_PROVIDER_RUNTIME: '/path-that-must-not-be-created' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout), {
    ok: false,
    errorCategory: 'broker-execution-required',
  });
  assert.equal(result.stderr, '');
});
