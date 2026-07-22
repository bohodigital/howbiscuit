# Offer API foundation

Handoff 3A provides a fixture-only Worker surface. It is disabled by default and publishes no live merchant data or affiliate links.

Public foundation routes:

- `GET /api/v1/offers` validates an exact canonical product ID and returns normalized unexpired fixture results only when the global and fixture-source switches are explicitly enabled.
- `GET /api/v1/source-status` returns bounded public health states without credentials, quotas, or internal diagnostics.
- `GET /health` reports runtime readiness and the catalog projection marker.

Every response sets `Cache-Control: no-store`. CORS is restricted to `https://howbiscuit.com` and explicitly configured preview origins. Unknown products, expired policies, expired offers, exhausted budgets, disabled sources, and malformed inputs fail closed.

Internal catalog synchronization is implemented as a library operation using prepared D1 statements and as a deterministic CLI check/dry-run. Production mutation requires a separately authenticated operational runner and is not exposed by the public Worker.

`npm run offers:worker-build` creates edge-only Offer, Location, and Events artifacts under `dist/h3-workers/`. The build targets the browser/Worker runtime and fails if a Node-only import reaches any bundle. Provisioning a Worker route, D1 database, credentials, or a live source remains separately approval-gated.

Cloudflare implementation follows the current module Worker `fetch(request, env, ctx)` model and D1 prepared-statement/batch APIs. Queue consumers must treat delivery as at least once and use message IDs as idempotency keys.
