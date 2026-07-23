import { quotaState } from '../../../src/lib/offers/quota.mjs';
import { evaluateSourcePolicy, sourceRuntimeFromEnvironment, sourcePolicySchema } from '../../../src/lib/offers/source-policy.mjs';
import { classifyGoogleFuelFailure, googlePlaceFuelRequest, normalizeGoogleFuelResponse } from '../../../src/lib/fuel/google-places.mjs';

const allowedOrigins = new Set(['https://howbiscuit.com', 'https://www.howbiscuit.com']);

function response(body, status, origin = null, extraHeaders = {}) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'private, no-store, max-age=0',
    'x-robots-tag': 'noindex, nofollow, noarchive',
    vary: 'Origin',
    ...extraHeaders,
  };
  if (origin && allowedOrigins.has(origin)) headers['access-control-allow-origin'] = origin;
  return new Response(JSON.stringify(body), { status, headers });
}

async function fingerprint(placeId, actionToken) {
  const bytes = new TextEncoder().encode(`${placeId}:${actionToken}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function validControls(controls) {
  return controls && typeof controls.reserve === 'function' && typeof controls.recordSuccess === 'function' && typeof controls.recordFailure === 'function' && controls.usage && controls.circuit;
}

function exactBody(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === 2 && keys[0] === 'actionToken' && keys[1] === 'placeId' && typeof value.actionToken === 'string' && value.actionToken.length >= 32 && value.actionToken.length <= 512;
}

export function createGasWorker({
  googlePolicy: googlePolicyInput,
  executeGoogleRequest,
  controlResolver,
  verifyActionToken,
  databaseState = () => ({}),
  now = () => new Date(),
} = {}) {
  const googlePolicy = googlePolicyInput ? sourcePolicySchema.parse(googlePolicyInput) : null;
  return Object.freeze({
    async fetch(request, environment = {}) {
      const url = new URL(request.url);
      const origin = request.headers.get('origin');
      if (origin && !allowedOrigins.has(origin)) return response({ error: 'Origin not allowed.' }, 403);
      if (url.pathname === '/api/v1/fuel/status') {
        const state = googlePolicy ? evaluateSourcePolicy(googlePolicy, sourceRuntimeFromEnvironment(googlePolicy, environment, databaseState()), now()) : 'policy-disabled';
        return response({ googlePlacesFuel: state, eiaFallback: '/data/eia/regional-context' }, 200, origin);
      }
      if (url.pathname !== '/api/v1/fuel/google-place') return response({ error: 'Not found.' }, 404, origin);
      if (request.method !== 'POST') return response({ error: 'Explicit POST action required.' }, 405, origin, { allow: 'POST' });
      const declaredLength = Number(request.headers.get('content-length') || 0);
      if (declaredLength > 2048) return response({ error: 'Request too large.' }, 413, origin);
      if (!googlePolicy || environment.GLOBAL_OFFERS_ENABLED !== 'true') return response({ error: 'Local fuel lookup is disabled.', fallback: 'regional-context-only' }, 503, origin);
      const policyState = evaluateSourcePolicy(googlePolicy, sourceRuntimeFromEnvironment(googlePolicy, environment, databaseState()), now());
      if (policyState !== 'healthy') return response({ error: 'Local fuel lookup is unavailable.', sourceStatus: policyState, fallback: 'regional-context-only' }, 503, origin);
      let body;
      try {
        body = await request.json();
      } catch {
        return response({ error: 'Invalid request.' }, 400, origin);
      }
      if (!exactBody(body)) return response({ error: 'Invalid request.' }, 400, origin);
      if (typeof verifyActionToken !== 'function' || await verifyActionToken(body.actionToken, { placeId: body.placeId, request }) !== true) {
        return response({ error: 'Explicit user action could not be verified.' }, 403, origin);
      }
      if (typeof controlResolver !== 'function') return response({ error: 'Local fuel lookup is unavailable.', fallback: 'regional-context-only' }, 503, origin);
      const controls = await controlResolver('google-places-fuel', body.placeId);
      if (!validControls(controls)) return response({ error: 'Local fuel lookup is unavailable.', fallback: 'regional-context-only' }, 503, origin);
      const quota = quotaState(googlePolicy, controls.usage);
      if (quota !== 'available') return response({ error: 'Local fuel lookup budget is unavailable.', sourceStatus: quota, fallback: 'regional-context-only' }, 429, origin);
      const requestFingerprint = await fingerprint(body.placeId, body.actionToken);
      if (await controls.reserve(requestFingerprint) !== true) return response({ error: 'Duplicate or rate-limited lookup.', sourceStatus: 'quota-limited', fallback: 'regional-context-only' }, 429, origin);
      if (typeof executeGoogleRequest !== 'function') return response({ error: 'Local fuel lookup is unavailable.', fallback: 'regional-context-only' }, 503, origin);
      try {
        const payload = await executeGoogleRequest(googlePlaceFuelRequest(body.placeId));
        const result = normalizeGoogleFuelResponse(payload, body.placeId, now());
        if (await controls.recordSuccess() !== true) throw new Error('Google fuel success state was not persisted.');
        return response(result, 200, origin);
      } catch (error) {
        const sourceStatus = classifyGoogleFuelFailure(error);
        try { await controls.recordFailure(sourceStatus); } catch { /* the public response remains fail closed */ }
        return response({ error: 'Local fuel data unavailable.', sourceStatus, fallback: 'regional-context-only' }, 503, origin);
      }
    },
  });
}

export default createGasWorker();
