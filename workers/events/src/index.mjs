import { locationTokenDigest } from '../../../src/lib/location/store.mjs';
import { outboundEventInputSchema, OUTBOUND_EVENT_TTL_SECONDS } from '../../../src/lib/location/schema.mjs';

const PUBLIC_ORIGIN = 'https://howbiscuit.com';
const MAX_EVENT_BYTES = 4096;
function json(body, status, origin = null) {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  if (origin) { headers.set('access-control-allow-origin', origin); headers.set('vary', 'Origin'); }
  return new Response(JSON.stringify(body), { status, headers });
}
function allowedOrigin(request, env) {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  const previews = String(env.ALLOWED_PREVIEW_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean);
  return origin === PUBLIC_ORIGIN || previews.includes(origin) ? origin : false;
}
async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

export function createEventsWorker(overrides = {}) {
  return {
    async fetch(request, env = {}) {
      const origin = allowedOrigin(request, env);
      if (origin === false) return json({ error: 'Origin not allowed.' }, 403);
      const url = new URL(request.url);
      if (url.pathname !== '/api/v1/events/outbound') return json({ error: 'Not found.' }, 404, origin);
      if (request.method === 'OPTIONS') {
        const headers = new Headers({
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'Content-Type',
          'access-control-max-age': '600',
          vary: 'Origin',
        });
        if (origin) headers.set('access-control-allow-origin', origin);
        return new Response(null, { status: 204, headers });
      }
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, origin);
      if (env.EVENTS_ENABLED !== 'true' || !env.DB) return json({ error: 'Click recording unavailable.' }, 503, origin);
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return json({ error: 'JSON content type required.' }, 415, origin);
      const declaredLength = Number(request.headers.get('content-length') || 0);
      if (declaredLength > MAX_EVENT_BYTES) return json({ error: 'Event payload too large.' }, 413, origin);
      try {
        const text = await request.text();
        if (new TextEncoder().encode(text).byteLength > MAX_EVENT_BYTES) return json({ error: 'Event payload too large.' }, 413, origin);
        const event = outboundEventInputSchema.parse(JSON.parse(text));
        const now = overrides.now ? overrides.now() : new Date();
        const sessionTokenDigest = await locationTokenDigest(event.sessionToken);
        const idempotencyKey = await sha256(JSON.stringify({ ...event, sessionToken: sessionTokenDigest }));
        const existing = await env.DB.prepare('SELECT event_id AS eventId FROM outbound_link_events WHERE idempotency_key=?1').bind(idempotencyKey).first();
        if (existing) return json({ recorded: true, classification: 'outbound-click', idempotencyKey }, 202, origin);
        const session = await env.DB.prepare(`SELECT coarse_metro_slug AS metroSlug FROM lookup_sessions
          WHERE session_token_digest=?1 AND expires_at>?2 AND event_count<10`).bind(sessionTokenDigest, now.toISOString()).first();
        if (!session || (event.metroSlug && session.metroSlug !== event.metroSlug)) return json({ error: 'Lookup session unavailable.' }, 400, origin);
        const eventId = (overrides.randomUUID || (() => crypto.randomUUID()))();
        const expiresAt = new Date(now.valueOf() + OUTBOUND_EVENT_TTL_SECONDS * 1000).toISOString();
        await env.DB.prepare(`INSERT OR IGNORE INTO outbound_link_events (
          event_id, occurred_at, page_id, canonical_product_id, merchant_id, destination_id,
          relationship, metro_slug, session_token_digest, expires_at, idempotency_key
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`).bind(
          eventId, now.toISOString(), event.pageId, event.canonicalProductId || null,
          event.merchantId, event.destinationId, event.relationship, session.metroSlug,
          sessionTokenDigest, expiresAt, idempotencyKey,
        ).run();
        return json({ recorded: true, classification: 'outbound-click', idempotencyKey }, 202, origin);
      } catch (error) {
        const invalid = error instanceof SyntaxError || error?.name === 'ZodError';
        return json({ error: invalid ? 'Invalid outbound-click event.' : 'Click recording unavailable.' }, invalid ? 400 : 503, origin);
      }
    },
    async scheduled(_controller, env = {}) {
      if (!env.DB) throw new Error('D1 binding required for retention cleanup.');
      const now = (overrides.now ? overrides.now() : new Date()).toISOString();
      await env.DB.batch([
        env.DB.prepare('DELETE FROM outbound_link_events WHERE expires_at<=?1').bind(now),
        env.DB.prepare('DELETE FROM lookup_sessions WHERE expires_at<=?1').bind(now),
        env.DB.prepare("UPDATE manual_offer_reviews SET status='expired' WHERE expires_at<=?1 AND status<>'expired'").bind(now),
        env.DB.prepare('DELETE FROM offer_snapshots WHERE expires_at<=?1').bind(now),
      ]);
    },
  };
}

export default createEventsWorker();
