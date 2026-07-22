# Handoff 3 runtime threat model

## Protected assets

Canonical product identity, provider credentials, provider quotas and paid budgets, source-policy decisions, user location privacy, offer freshness, merchant mappings, and outbound-event integrity.

## Trust boundaries

- Browser input is untrusted.
- Provider responses are untrusted observations and never canonical identity.
- Git-tracked source policies are reviewed configuration, not credentials.
- D1 is runtime projection and operational state, not authoring authority.
- Internal endpoints require a separately provisioned secret and are unavailable when it is absent.

## Principal threats and controls

| Threat | Required control |
| --- | --- |
| Variant confusion | Exact canonical ID plus accepted identifier evidence; probable matches never compare. |
| Stale or fabricated prices | Required observation and hard-expiration times; expired offers are suppressed. |
| Denial of wallet | Explicit requests, fan-out caps, quotas, paid ceilings, deduplication, and source kill switches. |
| SSRF | Fixed adapter endpoints; no caller-supplied server URL. |
| SQL injection | Parameterized D1 statements only. |
| Credential disclosure | Cloudflare/Pi secret stores only; generic public errors; no raw response logging. |
| Location tracking | ZIP-level inputs, no persistent raw IP or precise address, bounded rotating session tokens. |
| Policy bypass | Fail closed when review is due, activation is absent, budget is exhausted, or a kill switch is off. |
| Retry amplification | Idempotency keys, bounded retries, exponential backoff, and dead-letter handling. |
| Analytics overclaim | Events are labeled clicks, never purchases, sales, leads, or revenue. |

## Security invariants

The static site builds and renders with the runtime layer offline. No paid or quota-limited call occurs on ordinary page load. No public source is enabled merely by deploying code.
