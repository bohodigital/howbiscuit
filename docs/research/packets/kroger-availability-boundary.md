# Kroger availability boundary

Packet ID: `kroger-availability-boundary`
Release: `h31-content-tools-2026-07-24-r2`
Status: **validated / approved**
Reviewer: `howbiscuit-h3.1-work-order`
Generated: 2026-07-24T05:10:41Z
Review due: 2026-10-24T00:00:00Z

## Research question

What can the current broker evidence support about availability?

## Proposed factual claims

### retailer-price-observation

At 2026-07-24T05:10:41Z, the governed Kroger refresh returned explicit store-scoped price, fulfillment, and inventory fields for 29 exact mappings. These dated observations remain internal-only; missing or unsupported fields remain unknown.

Evidence: `kroger-observation-53100516-0001111001129-2026-07-24`, `kroger-observation-53100516-0001111004807-2026-07-24`, `kroger-observation-53100516-0001111004808-2026-07-24`, `kroger-observation-53100516-0001111011888-2026-07-24`, `kroger-observation-53100516-0001111011889-2026-07-24`

Limitations: One governed store and one observation time; this is not a current public availability or price-comparison claim.

## Evidence records

- `kroger-observation-53100516-0001111001129-2026-07-24`: approved evidence record
- `kroger-observation-53100516-0001111004807-2026-07-24`: approved evidence record
- `kroger-observation-53100516-0001111004808-2026-07-24`: approved evidence record
- `kroger-observation-53100516-0001111011888-2026-07-24`: approved evidence record
- `kroger-observation-53100516-0001111011889-2026-07-24`: approved evidence record

## Citation-ready source notes

- **kroger:** kroger data retrieved 2026-07-24T05:10:41Z.

## Suggested tables

- `observations` — Kroger dated internal observations; 5 evidence row(s)

## Suggested charts

- None

## Freshness and disclosure

Cadence: manual-on-demand. Staleness: current as of 2026-07-24T05:10:41Z.

This static research packet uses approved historical source records and makes no provider call during page load.

- Do not convert aggregate, identity, wholesale, or national production evidence into a live personal bill, shelf price, local availability, or inventory claim.
