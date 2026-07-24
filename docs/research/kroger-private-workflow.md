# Private Kroger research workflow

No secure owner-only web surface is configured, so Handoff 3.1 uses a deterministic command-line and generated-report workflow. It is not routed, indexed, or deployed publicly.

```sh
npm run kroger:research -- status
npm run kroger:research -- review
npm run kroger:research -- query-plan --term "all purpose flour" --location kroger-location-53100516
npm run kroger:research -- packet-candidate --packet kroger-staple-basket
```

The query-plan command accepts only a bounded safe term and a governed location, specifies the allowlisted response fields, forbids customer authorization, and performs no provider call. Execute the plan through the Local1 broker. Ingest the sanitized envelope into a new immutable release.

Approval remains exact-match-only: retailer SKU or GTIN, title, brand where applicable, and exact package size. Probable or rejected candidates stay in `unresolvedMappings`. Missing price, fulfillment, or inventory becomes `unknown`, never “out of stock.” Canonical product creation remains a separate explicit approval action.

The current broker omits nested Kroger item price, fulfillment, and inventory fields. Public live Kroger price comparison therefore remains disabled. Existing ordinary unpaid Kroger destinations remain separate from this internal research workflow.
