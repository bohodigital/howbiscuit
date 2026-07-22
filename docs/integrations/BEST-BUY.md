# Best Buy adapter

Status: `production-disabled`; public activation is not approved.

The adapter is bound to the five reviewed Best Buy SKUs in the canonical Handoff 2 product catalog. It accepts only an exact retailer SKU plus an expected model, preserves new and open-box conditions separately, and normalizes pickup only from the SKU-specific Stores API response. Store addresses and postal codes are discarded during normalization. Similar titles never establish a mapping.

The official Products, Stores, and Buying Options APIs were reviewed on 2026-07-22 at <https://bestbuyapis.github.io/api-documentation/>. The documented operational ceiling is 50,000 requests per day and five requests per second; How Biscuit imposes the lower application budgets encoded in `content/source-policies/best-buy.yaml`. Runtime responses may not be retained raw, price expires after one hour, availability expires after fifteen minutes, and stale display is prohibited.

The current terms at <https://developer.bestbuy.com/legal> permit only temporary Content caching up to 72 hours and require compliance with Best Buy branding and attribution rules. The terms also contain a third-party-benefit restriction that may affect a multi-retailer comparison product. For that reason `comparisonStatus` remains `requires-review`, which disables the adapter before any request, quota reservation, or cost. Legal/provider approval, an owner-held API key, a redacting server transport for the provider's query-key requirement, attribution evidence, and explicit owner activation are still required.

Request specifications contain only a fixed Best Buy origin, validated SKU or ZIP fields, and the secret name. They never contain the credential value. A future approved transport must inject the provider-required key server-side, redact its query string from logs and exceptions, and use the Pi or Cloudflare secret mechanism.

Kill switches: `GLOBAL_OFFERS_ENABLED`, `BEST_BUY_ENABLED`, and the source-policy database flag. Ordinary unpaid product destinations continue to work when every switch is off.
