import { resolveLocation } from '../../../src/lib/location/store.mjs';
import { zipCodeSchema } from '../../../src/lib/location/schema.mjs';

const PUBLIC_ORIGIN = 'https://howbiscuit.com';
const DAILY_SESSION_LIMIT = 10;
function json(body, status, origin = null) {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex, nofollow' });
  if (origin) { headers.set('access-control-allow-origin', origin); headers.set('vary', 'Origin'); }
  return new Response(JSON.stringify(body), { status, headers });
}
function allowedOrigin(request, env) {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  const previews = String(env.ALLOWED_PREVIEW_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean);
  return origin === PUBLIC_ORIGIN || previews.includes(origin) ? origin : false;
}
async function abuseBucketDigest(ipAddress, secret, day) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${day}:${ipAddress}`));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}
async function consumeSessionBudget(db, request, env, now) {
  const ipAddress = request.headers.get('cf-connecting-ip');
  if (!ipAddress || typeof env.ABUSE_HASH_KEY !== 'string' || env.ABUSE_HASH_KEY.length < 32) throw new Error('Abuse controls unavailable.');
  const day = now.toISOString().slice(0, 10);
  const digest = await abuseBucketDigest(ipAddress, env.ABUSE_HASH_KEY, day);
  const expiresAt = new Date(Date.parse(`${day}T00:00:00.000Z`) + 2 * 24 * 60 * 60 * 1000).toISOString();
  return db.prepare(`INSERT INTO abuse_buckets (bucket_digest, bucket_day, request_count, expires_at)
    VALUES (?1, ?2, 1, ?3)
    ON CONFLICT(bucket_digest) DO UPDATE SET request_count=request_count+1
    WHERE request_count<?4
    RETURNING request_count AS requestCount`).bind(digest, day, expiresAt, DAILY_SESSION_LIMIT).first();
}

export function createLocationWorker(overrides = {}) {
  return {
    async fetch(request, env = {}) {
      const origin = allowedOrigin(request, env);
      if (!origin) return json({ error: 'Origin not allowed.' }, 403);
      if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, origin);
      if (request.url.length > 2048) return json({ error: 'Invalid location request.' }, 414, origin);
      const url = new URL(request.url);
      if (url.pathname !== '/api/v1/location/resolve') return json({ error: 'Not found.' }, 404, origin);
      if (env.LOCATION_LOOKUP_ENABLED !== 'true' || !env.DB) return json({ error: 'Location lookup unavailable.' }, 503, origin);
      try {
        const zip = zipCodeSchema.parse(url.searchParams.get('zip'));
        if ([...url.searchParams.keys()].some((key) => key !== 'zip')) throw new Error('Unexpected query parameter.');
        const now = overrides.now ? overrides.now() : new Date();
        const budget = await consumeSessionBudget(env.DB, request, env, now);
        if (!budget) return json({ error: 'Location lookup rate limit reached.' }, 429, origin);
        const result = await resolveLocation(env.DB, zip, now, overrides.randomUUID);
        return result ? json(result, 200, origin) : json({ error: 'ZIP not supported by the current dataset.' }, 404, origin);
      } catch (error) {
        const invalid = error?.name === 'ZodError' || /query parameter/.test(error?.message || '');
        return json({ error: invalid ? 'Invalid location request.' : 'Location lookup unavailable.' }, invalid ? 400 : 503, origin);
      }
    },
    async scheduled(_controller, env = {}) {
      if (!env.DB) throw new Error('D1 binding required for session cleanup.');
      const now = (overrides.now ? overrides.now() : new Date()).toISOString();
      await env.DB.batch([
        env.DB.prepare('DELETE FROM lookup_sessions WHERE expires_at<=?1').bind(now),
        env.DB.prepare('DELETE FROM abuse_buckets WHERE expires_at<=?1').bind(now),
      ]);
    },
  };
}

export default createLocationWorker();
