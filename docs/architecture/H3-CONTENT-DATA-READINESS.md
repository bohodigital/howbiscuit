# Handoff 3 content-data readiness

Status: implemented for the six-source internal research release on 2026-07-24.

## Release boundary

The active release members are HUD-USPS, EIA, Kroger Public APIs, USDA FoodData Central, USDA MyMarketNews, and USDA NASS Quick Stats. Best Buy is explicitly `excluded`: it has no refresh, smoke, coverage, acceptance, or deployment dependency.

All external calls run through Local1 public-API tools. Credentials remain server managed. The repository never opens the credential vault, receives a credential, or constructs an authenticated provider request. `scripts/providers/broker-contract.mjs` accepts only bounded successful envelopes from the six allowlisted APIs.

## Flow

1. Local1 lists and describes an allowlisted provider operation.
2. A bounded query returns records, retrieval time, source metadata, quota state, and truncation state.
3. A provider normalizer converts records into stable internal concepts.
4. A deterministic release compiler emits manifests, record digests, and research packets.
5. D1 migrations provide runtime persistence, while generated JSON remains the reviewable build input.
6. Article manifests may declare `researchPacketIds` and use `::research{packet="..."}`. Unknown packets fail compilation.

The normalized concepts are dataset release, dataset manifest, geography relationship, energy observation, food identity, food nutrient observation, market report definition, market observation, agricultural statistic, merchant location, merchant-product mapping, retailer offer observation, research packet, packet source, and unresolved mapping candidate.

## Claim and freshness rules

- HUD relationships describe residential-address weighting; they do not identify a household.
- EIA values are historical regional benchmarks, not station quotes, utility quotes, or household bills.
- FoodData Central nutrient rows require a nutrient identifier, name, amount, unit, and food basis. The starter release intentionally contains identity rows only because the bounded broker response did not expose complete nutrient names.
- MyMarketNews wholesale, first-sales, inventory, and narrative reports may not be relabeled as consumer shelf prices.
- NASS preserves unit, period, geography, revision/load time, and suppression. Suppressed values remain null.
- Kroger public comparison requires an approved exact SKU/GTIN mapping. Probable candidates go to the unresolved queue.

The generated release is immutable. A refresh creates a new release ID; it never mutates published history. Public rendering must carry attribution and an observation/retrieval time, and public activation remains separate from internal research approval.

## Reproduction

Run `npm run data:compile`, `npm run data:check`, `npm run data:status`, `npm run data:coverage`, and `npm run research:list-sources`. Run `npm run providers:broker-doctor` to verify the broker boundary.
