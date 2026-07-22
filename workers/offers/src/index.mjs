import { catalogReleaseHealth, getActiveMerchantMapping, getProjectedProduct } from '../../../src/lib/offers/catalog-store.mjs';
import { lookupOffers } from '../../../src/lib/offers/runtime.mjs';
import { publicSourceStatusesSchema } from '../../../src/lib/offers/schema.mjs';
import { sourceRuntimeFromEnvironment } from '../../../src/lib/offers/source-policy.mjs';

const PUBLIC_ORIGIN = 'https://howbiscuit.com';

function json(body, status = 200, origin = null) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  if (origin) {
    headers.set('access-control-allow-origin', origin);
    headers.set('vary', 'Origin');
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function allowedOrigin(request, env) {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  const configured = String(env.ALLOWED_PREVIEW_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean);
  return origin === PUBLIC_ORIGIN || configured.includes(origin) ? origin : false;
}

function queryFromUrl(url) {
  return Object.fromEntries(['productId', 'zip', 'radiusMiles', 'fulfillment', 'condition']
    .map((key) => [key, url.searchParams.get(key)])
    .filter(([, value]) => value !== null));
}

async function catalogProduct(env, productId) {
  const health = await catalogReleaseHealth(env.DB, env.STATIC_CATALOG_COMMIT);
  if (!health.ready) return null;
  const product = await getProjectedProduct(env.DB, productId);
  if (!product || product.sourceCommit !== env.STATIC_CATALOG_COMMIT || product.releaseMember !== 1) return null;
  return product;
}

export function createOfferWorker(overrides = {}) {
  const failClosedSources = new Set();
  return {
    async fetch(request, env = {}, _ctx = {}) {
      const origin = allowedOrigin(request, env);
      if (origin === false) return json({ error: 'Origin not allowed.' }, 403);
      const url = new URL(request.url);
      if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, origin);

      if (url.pathname === '/health') {
        const health = await catalogReleaseHealth(env.DB, env.STATIC_CATALOG_COMMIT);
        return json({ status: health.ready ? 'ready' : health.reason, offersEnabled: env.GLOBAL_OFFERS_ENABLED === 'true' }, health.ready ? 200 : 503, origin);
      }
      if (url.pathname === '/api/v1/source-status') {
        try {
          const statuses = publicSourceStatusesSchema.parse(typeof overrides.sourceStatuses === 'function' ? await overrides.sourceStatuses(env) : []);
          return json({ schemaVersion: '1.0.0', sources: statuses }, 200, origin);
        } catch {
          return json({ error: 'Source status unavailable.' }, 503, origin);
        }
      }
      if (url.pathname !== '/api/v1/offers') return json({ error: 'Not found.' }, 404, origin);
      if (env.GLOBAL_OFFERS_ENABLED !== 'true') return json({ error: 'Current price unavailable.', fallback: 'static-links' }, 503, origin);

      try {
        const productId = url.searchParams.get('productId') || '';
        const projected = overrides.catalog
          ? overrides.catalog.find((product) => product.productId === productId)
          : await catalogProduct(env, productId);
        const policies = overrides.policies || new Map();
        const databaseStates = typeof overrides.databaseStateBySource === 'function' ? overrides.databaseStateBySource(env) : {};
        const runtimeBySource = Object.fromEntries([...policies.entries()].map(([sourceId, policy]) => [
          sourceId,
          sourceRuntimeFromEnvironment(policy, env, databaseStates[sourceId]),
        ]));
        const response = await lookupOffers({
          query: queryFromUrl(url),
          catalog: projected ? [projected] : [],
          adapters: overrides.adapters || [],
          policies,
          runtimeBySource,
          controlResolver: overrides.controlResolver || (async () => null),
          mappingResolver: overrides.mappingResolver || (env.DB ? async (merchantId, merchantProductId) => getActiveMerchantMapping(env.DB, merchantId, merchantProductId) : async () => null),
          now: overrides.now ? overrides.now() : new Date(),
          maximumAdapters: 4,
          mode: 'fixture-only',
          failClosedSources,
        });
        return json(response, 200, origin);
      } catch (error) {
        const invalid = error?.name === 'ZodError' || /Unknown or unavailable canonical product/.test(error?.message || '');
        return json({ error: invalid ? 'Invalid offer request.' : 'Current price unavailable.' }, invalid ? 400 : 503, origin);
      }
    },
  };
}

export default createOfferWorker();
