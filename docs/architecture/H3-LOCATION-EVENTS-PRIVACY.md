# Handoff 3B location and event privacy

Status: implemented foundation; public activation disabled

Location resolution accepts only a five-digit ZIP. The import layer preserves HUD residential-address weights for every county and CBSA relationship instead of forcing an exclusive mapping. A same-number Census ZCTA may supply a representative centroid, but every response states that USPS ZIPs and Census ZCTAs are different constructs.

An explicit lookup creates a random 30-minute token. D1 stores only its SHA-256 digest, expiration, bounded event count, and optional coarse metro slug. A separate abuse bucket stores a secret-keyed daily HMAC digest, count, and maximum 48-hour expiry; the raw network address is never persisted. It does not store a full address, browser coordinates, exact query string, or ZIP in the session row. Location responses use `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow`.

Outbound events accept only a strict identifier model. They store destination IDs rather than URLs, classify the record as a click rather than a conversion, retain only the session digest and coarse metro, and expire after 90 days. A scheduled handler deletes expired clicks and sessions and suppresses expired manual offer snapshots. Failure of D1 causes the public endpoint to fail closed.

The current metro source is a controlled set of 12 substantive draft profiles and static routes. They explicitly report zero activated live retailers and remain `draft-noindex`, analytics-disabled, Pagefind-excluded, and sitemap-excluded until completed Census/HUD manifests and owner-approved activation exist. Ordinary rendering performs no runtime or paid request.

Rollback is immediate: leave `LOCATION_LOOKUP_ENABLED` and `EVENTS_ENABLED` unset or false. Removing the Worker routes does not change the static Handoff 2 site.
