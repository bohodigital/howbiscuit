# Fuel and regional context

Status: Google Places fuel is `production-disabled`; EIA regional context is compiled but not production-activated.

## Google Places fuel

The gas Worker exposes a POST-only explicit-action endpoint. An ordinary GET, page render, crawler request, invalid one-time action proof, disabled global switch, disabled source switch, disabled database flag, expired policy, quota ceiling, or paid-cost ceiling all stop before a provider request. Request specifications contain one validated Place ID, the fixed `https://places.googleapis.com` origin, and the minimal `id,displayName,googleMapsUri,fuelOptions,attributions` field mask. The API-key value is never present in the specification or source tree.

Fuel results are returned with `Cache-Control: private, no-store`, `X-Robots-Tag: noindex, nofollow, noarchive`, Google Maps attribution, third-party attribution when supplied, the provider update time, and a direct Google Maps URI. The normalized response omits address and coordinates and is labeled `ephemeral-response-only`. Prices older than seven days are suppressed. No Google Places content is written to D1, R2, logs, generated files, or static HTML; only Place IDs are eligible for durable storage under the reviewed policy.

Google's current Places policies prohibit prefetching, indexing, caching, or storing Places content outside listed exceptions and require Google Maps attribution when content is shown without a Google map. Fuel options are a billed Places field, so the committed policy has a zero-dollar monthly ceiling and remains publicly disabled. Enabling it requires an owner-held restricted API key, billing/account approval, a nonzero owner-approved ceiling, attribution rendering evidence, source database activation, both kill switches, and explicit owner approval.

## EIA regional benchmarks

The versioned input `data/eia/weekly-regular-gasoline-2026-07-20.json` records six weekly EIA observations for the U.S., Midwest PADD 2, and Chicago aggregates, released on 2026-07-21. `npm run fuel:eia-import` validates and deterministically produces JSON chart data and an accessible SVG. Build and Pi QA run the importer in check mode so source drift cannot pass silently.

Every output states that values are EIA aggregate benchmarks in U.S. dollars per gallon including taxes. They are not station prices, availability, or purchase quotes. The SVG includes an accessible title and description, exact plotted values, source release date, and the same non-station disclosure. The EIA source policy remains production-disabled pending owner release approval; the static artifacts make no external call.

Kill switches: `GLOBAL_OFFERS_ENABLED`, `GOOGLE_FUEL_ENABLED`, the Google source database flag, and `EIA_CONTEXT_ENABLED`. On any Google failure, the public contract returns only a generic unavailable response and points to regional context; it never substitutes an EIA aggregate for a station price.

## 2026-07-23 live EIA validation

The Pi broker record `local1.public-data-provider-credentials.primary` maps its
EIA field to the server-only `HOWBISCUIT_EIA_API_KEY` binding. A bounded
three-call live check authenticated successfully and validated the exact U.S.,
Midwest PADD 2, and Chicago weekly regular-gasoline series through 2026-07-20.
The controlled metro fallback displays only aggregate values, units,
observation dates, source attribution, and the explicit non-station limitation.

The policy remains default-off and requires `EIA_CONTEXT_ENABLED=true` plus the
runtime database enable gate. The existing stricter application request budget
is retained. Google Places fuel remains disabled and is not a substitute source.
