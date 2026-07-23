# How Biscuit price integrations report

## Accepted lineage

- Handoff 2 baseline: `73b934d60f4803b2f7766c410a3651bfd0bd2a76`
- Handoff 3A foundation: `81d2053660f22fae9772ac9548c7281f8eadb6c6`

## Handoff 3A

Accepted on 2026-07-22. The feature and integration refs were verified on the Pi origin and GitHub. Validation passed 120 tests, the 19-table migration check, edge Worker bundle, 17-route static build, Astro diagnostics, and content lint. Fresh-context same-model review found no remaining P0/P1/P2 issues. Cross-model review was skipped by owner direction. No public activation occurred.

## Handoff 3B

In progress on `feature/howbiscuit-h3b-location-events` from the exact 3A commit. The implementation includes raw Census Gazetteer and HUD API-envelope normalization, digest-bound public dataset intake, weighted location profiles, expiring coarse sessions, bounded outbound-click events, retention cleanup, merchant-bound expiring manual offers, and 12 substantive draft metro routes.

The metro routes are a bounded governance extension outside the Handoff 2 public registry: they are statically rendered, `noindex, nofollow`, excluded from Pagefind and the sitemap, analytics-disabled, and contain no runtime lookup. External gates still apply: HUD USER data access requires an owner-held access token, and production D1/R2/Worker provisioning is not authorized by implementation alone. All live switches remain disabled.

The final Handoff 3B defect pass also closed three fail-closed gaps: manual-offer retention now honors product-identifier and optional store/availability ceilings; replayed or rejected click events cannot consume a lookup-session event slot; and location release IDs now bind the compiled metro/profile payload as well as source manifests. On 2026-07-22, the canonical Pi passed eight focused tests covering location compilation, raw-source normalization, Worker privacy, click replay and session limits, and manual-offer policy enforcement. The complete Pi QA gate then passed 129 tests, the 22-table D1 migration validator including ignored-replay accounting, Astro diagnostics with zero findings, a 29-page static build with exactly 12 governed metro routes and 16 Pagefind-eligible routes, all three Worker bundles, and content lint. The temporary Pi reboot interrupted synchronization but did not lose work; final files were resynchronized and the entire gate was rerun after recovery.

## Handoff 3C

The separate governed seed commit is `2377abfa4f5ff5fa435d2ad52696c8e19d884c86`. It adds five exact US-market Wi-Fi 7 router records, five ordinary unpaid Best Buy destinations, and ten current first-party manufacturer or retailer evidence records. The exact-SHA runtime projection contains five products with digest `805e236cb3ad11ec3b7691a4ebbb4fa2247562d98cff144d3d094e56fe0d108c`. No price, availability, image, testing, recommendation, or affiliate claim is stored in the seed.

The Best Buy adapter packet adds exact-SKU/model/bundle/market checks, separate new and open-box normalization, SKU-specific pickup handling, fixed provider request specifications, attribution and expiry rules, failure fixtures, and denial-before-cost tests. The 2026-07-22 source review is due again on 2026-08-22. Its current comparison status is `requires-review`; public activation, credential provisioning, provider calls, and production runtime changes remain prohibited. Static unpaid links remain the fallback.

## Handoff 3D

The governed Kroger seed subpacket adds two exact grocery variants with ordinary unpaid destinations: Coca-Cola Original Taste in one 12-pack of 12-fluid-ounce cans, and Kraft Original Mac & Cheese in one 7.25-ounce box. Kroger's 13-digit product identifiers are retained as exact merchant identifiers because they are the IDs exposed by the first-party product records; they are not relabeled as checksum-validated UPC-A values in the canonical schema.

The Kroger adapter implements ZIP-scoped store lookup, explicit exact-ID selection of Mariano's Bucktown store `53100516`, product lookup tied to that store, exact merchant-product/brand/model/package matching, pickup/delivery/shipping normalization, bounded aisle labels, quota and budget enforcement, and selected-store-only coverage disclosures. Its current source policy is `requires-review` and production-disabled. No credential, token exchange, provider request, public activation, or runtime deployment is part of this packet; ordinary unpaid Kroger product links remain the static fallback.

## Handoff 3E

Google Places fuel is implemented as a POST-only, one-time-action-verified Worker contract with a fixed Place Details endpoint and minimal field mask. It returns attributed, timestamped, `no-store`, `noindex` ephemeral data, strips address and coordinates, suppresses observations older than seven days, and stops before provider execution when policy, token proof, quota, or paid budget fails. The committed source policy has a zero-dollar ceiling and no public activation; no API key, Google request, billing change, or retained Places content is part of this release.

The EIA importer validates a versioned public snapshot of six weekly regular-gasoline aggregate observations for the U.S., Midwest PADD 2, and Chicago through 2026-07-20. It deterministically generates machine-readable chart data and an accessible SVG, both labeled as aggregate benchmarks in dollars per gallon including taxes and explicitly not station prices. Build and Pi QA enforce check-mode reproducibility. The EIA static artifacts are staged only until the owner approves source activation and release.
