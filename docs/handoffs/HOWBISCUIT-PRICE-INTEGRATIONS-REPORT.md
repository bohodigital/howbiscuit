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
