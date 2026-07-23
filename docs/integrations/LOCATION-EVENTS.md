# Location, events, and manual offers

## Dataset intake

`npm run location:normalize -- --check ...` parses raw Census Gazetteer text and raw HUD API response envelopes into deterministic extracts and builds manifests whose SHA-256 digests bind those extracts. Without `--check`, it writes four new files to an explicitly supplied empty output location and refuses to overwrite them. `npm run location:import -- --check ...` then validates those digest-bound extracts; `--dry-run` emits the deterministic D1 projection. Neither command downloads data, reads credentials, or mutates D1. An authenticated operational collector/importer must run only after the owner supplies HUD access and approves the exact dataset vintage.

Each manifest records publisher, dataset, vintage, retrieval date, official URL, public-use basis, SHA-256 digest, importer version, row counts, and validation results. ZIP-to-county and ZIP-to-CBSA weights remain many-to-many. ZCTA centroids are representative statistical points, not user locations or USPS boundaries.

## Public runtime surfaces

- `GET /api/v1/location/resolve?zip=12345` is disabled unless `LOCATION_LOOKUP_ENABLED=true`, D1 is present, and `ABUSE_HASH_KEY` is configured. It accepts no address or extra query fields, requires an allowed browser origin, caps session issuance per daily HMAC-based network bucket, and marks every response nonindexable. Raw network addresses are never stored.
- `POST /api/v1/events/outbound` is disabled unless `EVENTS_ENABLED=true` and D1 is present. The 4 KiB strict body contains IDs, a rotating session token, and an explicit `outbound-shopping-click` type; URLs, conversion fields, and account data are rejected. Each session has an atomic ten-event ceiling, even when callers change client event IDs.
- Scheduled event cleanup enforces session, click, and manual-offer expiration.

Manual offers are produced only by `reviewManualOffer`. It requires a published canonical product, an approved reviewed-manual source policy explicitly scoped to that merchant, current terms, active exact mapping, named reviewer, evidence ID, and an expiration bounded by both hard expiry and field-specific storage ceilings. It cannot turn unverified availability into stock and persists through parameterized D1 statements whose relational and normalized identities update together.

No source, route, D1 database, credential, or paid lookup is activated by this packet.

## 2026-07-23 HUD USER validation

The Pi broker record `local1.public-data-provider-credentials.primary` maps its
HUD field to the server-only `HOWBISCUIT_HUD_USPS_ACCESS_TOKEN` binding. Six
bounded live requests authenticated successfully: ZIP-to-county and
ZIP-to-CBSA responses for three representative Illinois and Indiana ZIP Codes.
The normalizer preserves every residential-ratio row and never silently chooses
the first geography.

The source policy is default-off behind `HUD_USPS_ENABLED`. Raw API envelopes,
authorization headers, street addresses, and raw IP addresses are not retained.
The controlled metro pages include HUD USER's required non-endorsement notice.
