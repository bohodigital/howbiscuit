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

Exact Handoff 3E commit: `0e4305c2cf5854aa9ab4b7ebb8d08677d2b14dfe` (parent `e0ca5e36662d1ddb03e2e531b563ab3c99a160fa`, tree `53cdc20c761bb349e758ef239902a1cf27686414`). Exact-SHA Pi QA passed 155 tests, four source policies, 22 runtime tables, the EIA aggregate check, Astro diagnostics, the 29-route static build, four Worker bundles, and content lint.

## Handoff 3F

The affiliate packet adds D1 eligibility and approved-Special-Link evidence tables plus a relationship-driven resolver. A paid link can be selected only when program approval, API eligibility, terms evidence, public activation, database enablement, exact product/merchant/destination identity, an approved provider-host Special Link, a healthy source policy, `AFFILIATE_LINKS_ENABLED`, and the provider switch all pass. Any failure returns the original unpaid URL and no-paid-links disclosure without editing article content.

Amazon Creators API and eBay Browse/EPN source policies are encoded from current official documentation, but both are `requires-review`, public-disabled, zero-dollar, and explicitly marked eligibility-not-proven. No affiliate account, credential, Partner Tag, campaign ID, production adapter, provider call, Special Link, tracking link, public disclosure change, or activation is claimed or created. Their exact approval and rollback boundaries are recorded in `docs/integrations/AFFILIATE-PROGRAMS.md`.

## Final architecture and identity decision

Static Astro pages and the Handoff 2 YAML/compiler remain the durable public system. D1 is a reproducible runtime projection and operational store; it is not an authoring database. The Offer Worker owns normalized offer reads, the Location Worker owns coarse ZIP resolution, the Events Worker owns bounded outbound-click events, and the Gas Worker owns explicit one-time Google fuel requests. All four are independently removable without breaking the static site. `docs/architecture/ADR-H3-CANONICAL-PRODUCT-IDENTITY.md` is the accepted identity ADR: exact Handoff 2 sellable variants are authoritative, external APIs cannot create products, and probable matches never compare.

Catalog synchronization deterministically projects `src/generated/publishing/products.v1.json` using parameterized D1 statements. Each row carries its source commit, schema version, release-membership flag, and exact identity digest. A release marker binds the full member digest and commit; the Worker rejects stale or partial projections.

## D1 schema and migrations

- `drizzle/0001_h3_offer_foundation.sql`: 19 catalog, merchant, source-policy, offer, affiliate-relationship, health, quota, correction, and release-marker tables.
- `drizzle/0002_h3_location_events.sql`: coarse lookup/session, click-budget, and supporting location/event state; total 22 tables plus atomic session-budget triggers.
- `drizzle/0003_h3_affiliate_governance.sql`: program-eligibility and approved-Special-Link evidence; total 24 tables plus relationship validation triggers and uniqueness constraints.

The migration validator exercises all migrations in order, foreign keys, ignored click replay accounting, required affiliate approval evidence, and the public-relationship enablement constraint.

## Adapters, policies, terms, quotas, and budgets

All source policies were reviewed on 2026-07-22. Values below are application-enforced ceilings; a provider's account-specific entitlement may be lower and must be rechecked before activation.

| Source | Adapter state | Review due | Comparison | Daily provider/policy ceiling | App daily / monthly | Paid monthly | Kill switch |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Best Buy | implemented, production-disabled | 2026-08-22 | requires-review | 50,000 | 500 / 10,000 | $0 | `BEST_BUY_ENABLED` |
| Kroger | implemented, production-disabled | 2026-08-22 | requires-review | 1,600 combined safety ceiling | 200 / 4,000 | $0 | `KROGER_ENABLED` |
| Google Places fuel | explicit-action Worker, production-disabled | 2026-08-22 | approved for bounded comparison | 25 | 10 / 100 | $0 | `GOOGLE_FUEL_ENABLED` |
| EIA weekly gasoline | deterministic importer, staged | 2027-07-22 | approved public dataset | 24 | 2 / 10 | $0 | `EIA_CONTEXT_ENABLED` |
| Amazon Creators | deferred; eligibility not proven | 2026-08-22 | requires-review | 100 app safety ceiling | 25 / 500 | $0 | `AMAZON_ENABLED` |
| eBay Browse/EPN | deferred; production access not proven | 2026-08-22 | requires-review | 100 app safety ceiling | 25 / 500 | $0 | `EBAY_ENABLED` |

Best Buy evidence is its official API documentation and developer legal terms. Kroger evidence is its verified public API workspace, first-party store/product records, and current site terms. Google evidence is the official Places field, policy, attribution, and billing documentation. EIA evidence is the official weekly retail-gasoline series and Open Data documentation. Amazon evidence is the Associates Operating Agreement, Creators API onboarding/API documentation, and disclosure guidance. eBay evidence is the Buy API production requirements, API license, EPN Network Agreement, Browse API documentation, and disclosure guidance. Source-specific details and URLs are recorded under `docs/integrations/`.

## Credentials

No credential was created, copied, called, logged, or committed. Required future server-only secret names are `BEST_BUY_API_KEY`; `KROGER_CLIENT_ID` and `KROGER_CLIENT_SECRET`; `GOOGLE_PLACES_API_KEY`; `AMAZON_CREATORS_CLIENT_ID`, `AMAZON_CREATORS_CLIENT_SECRET`, and `AMAZON_ASSOCIATES_PARTNER_TAG`; and `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, and `EBAY_EPN_CAMPAIGN_ID`. Provider account ownership, production/test separation, origin restrictions, rotation, and revocation must be recorded during the separately approved onboarding event. Missing credentials fail before transport.

## Supported products, merchants, and geography

The exact canonical release contains seven products:

| Product | Exact supported variant | Ordinary unpaid merchant |
| --- | --- | --- |
| ASUS RT-BE82U | Black US-market RT-BE82U, one router, US power adapter | Best Buy |
| NETGEAR Nighthawk RS100 | Black US-market RS100-100NAS, one router, US power adapter | Best Buy |
| NETGEAR Nighthawk RS150 | Black US-market RS150-100NAS, one router, US power adapter | Best Buy |
| NETGEAR Nighthawk RS200 | Black US-market RS200-100NAS, one router, US power adapter | Best Buy |
| TP-Link Archer BE3500 | Black US-market Archer BE3500, one-router package, hardware revision unspecified | Best Buy |
| Coca-Cola Original Taste | US 12-pack of 12-fluid-ounce cans | Kroger |
| Kraft Original Mac & Cheese | US single 7.25-ounce original box | Kroger |

Best Buy mappings are exact US SKUs. Kroger support is limited to exact product IDs and the explicitly selected Mariano's Bucktown store `53100516`; no other store is implied. Google fuel accepts only a user-selected exact Place ID after explicit action and is not active. EIA artifacts cover aggregate U.S., Midwest PADD 2, and Chicago series through 2026-07-20; they are not station prices.

Twelve static draft/noindex metro profiles exist: Chicago, New York, Los Angeles, Dallas-Fort Worth, Houston, Atlanta, Phoenix, Seattle, Denver, Boston, Washington DC, and Miami. Their Census label is 2025. The HUD vintage remains `pending-owner-authorized-import`; live ZIP-to-county/CBSA data is not claimed. ZIP/ZCTA and weighted county/metro relationships are explicitly approximate.

## Validation evidence

The exact H3F implementation commit `0ddf9d63580be4be2151b4bec53d32d56e91501b` passed 161/161 tests, six source policies, 24 D1 tables, a seven-product catalog projection with digest `6542d8b918e1fb453df4eee7fcc8be78b03373bb16af8fedf63e86dd07cbbdbe`, EIA reproducibility, 136 Astro files with zero errors/warnings/hints, a 29-route build with 16 Pagefind-eligible routes, four edge Worker bundles, and content lint for 16 MDX pages and 33 built files. Focused H3F coverage proves automatic relationship-driven disclosures, instant global/provider disablement, unpaid fallback, exact identity binding, approved-host enforcement, future-evidence rejection, malformed-policy rejection, and missing-proof rejection.

Match rejection covers near SKU/model/bundle/market/condition, Kroger identifier/brand/model/pack/unit-size mismatches, unknown canonical products, probable confidence, stale catalog projections, and malformed provider data. Failure tests cover authentication, quota, budget, circuit opening, provider outage, mapping, malformed responses, replay, and D1 persistence failure. Quota and paid-budget exhaustion stop before provider execution. The public static build remains functional with the entire runtime layer absent.

## Privacy, security, accessibility, and performance

- Privacy: no precise address is accepted; raw network addresses and destination URLs are not retained; sessions are coarse, hashed, and expiring; Google fuel output is ephemeral/no-store/noindex and strips address/coordinates; events are clicks, never sales.
- Security: fixed provider origins prevent caller-directed SSRF; D1 writes are parameterized; raw provider responses and credentials are excluded; CORS is bounded; body/query schemas are strict; policies, budgets, health, and kill switches fail closed.
- Accessibility: the static Astro diagnostics are clean; EIA SVG has an accessible title/description; existing target-size and contrast tests pass. H3F adds no public UI while affiliates are disabled.
- Performance: the Pi static build completed 29 routes in 4.09 seconds during the pre-commit gate. Ordinary page loads execute no paid request, and disabling all Workers leaves static pages, search, sitemap, RSS, Pagefind, and unpaid links intact.

## Attribution and disclosure evidence

Google contract tests assert Google Maps attribution, exact timestamps, no-store headers, and one bounded call after explicit action. The generated EIA SVG and JSON label the publisher, aggregate scope, unit, dates, and non-station limitation. Best Buy and Kroger attribution screenshots were not created because those sources are not approved or activated. Affiliate resolver tests generate the relationship-specific nearby disclosure and required Amazon site statement from the relationship; the current public disclosure page truthfully remains no-paid-links because no affiliate row or Special Link is active. No public attribution screenshot is claimed without an approved preview.

## Rollback and source disablement

Set `GLOBAL_OFFERS_ENABLED=false` to stop offer execution. Per-source switches are `BEST_BUY_ENABLED`, `KROGER_ENABLED`, `GOOGLE_FUEL_ENABLED`, `EIA_CONTEXT_ENABLED`, `AMAZON_ENABLED`, and `EBAY_ENABLED`; `AFFILIATE_LINKS_ENABLED=false` restores all governed destinations to their existing unpaid URLs. `LOCATION_LOOKUP_ENABLED=false` and `EVENTS_ENABLED=false` stop location/event surfaces. Every source also has a D1 enable flag. Code rollback uses an audited Git revert to `0e4305c2cf5854aa9ab4b7ebb8d08677d2b14dfe` for H3F alone or to `73b934d60f4803b2f7766c410a3651bfd0bd2a76` for the complete Handoff 3 lane. No article edit or canonical product rewrite is required.

## Known gaps, deferred integrations, and release record

- Best Buy comparison authority and activation approval are unproven.
- Kroger API-specific comparison/retention/attribution authority and activation approval are unproven.
- Google billing/key provisioning and a nonzero approved budget are absent.
- HUD owner-authorized import is absent; metro pages remain draft/noindex.
- Amazon Associates acceptance, qualifying-sales/API eligibility, credentials, Partner Tag, approved Special Links, and owner activation are absent.
- eBay EPN/business-model approval, Buy API production access, contracts, credentials, tracking links, and owner activation are absent.
- Additional retailer adapters remain deferred pending individual review.

Production deployment ID: not created. Immutable preview URL: not created. Public production URL: unchanged and not deployed from this branch. Live release marker: not created. Previous rollback deployment: not modified or re-verified by this code packet. Explicit owner public-activation approval: absent. The code lane is implementation-complete and production-disabled; external activation is intentionally deferred rather than implied complete.

## Commit lineage

- Handoff 2 baseline: `73b934d60f4803b2f7766c410a3651bfd0bd2a76`
- Handoff 3A foundation: `81d2053660f22fae9772ac9548c7281f8eadb6c6`
- Handoff 3B location/events: `3347b28f1b228b20a46d936bb580b3a9d63f2456`
- Handoff 3C seed: `2377abfa4f5ff5fa435d2ad52696c8e19d884c86`
- Handoff 3C Best Buy: `8cfe76fc45eff27705d0a99d43b1decd7393c894`
- Handoff 3D seed: `43984b68194359d2d3ba1c0f3b60289cd0d2d6ab`
- Handoff 3D Kroger: `e0ca5e36662d1ddb03e2e531b563ab3c99a160fa`
- Handoff 3E fuel/EIA: `0e4305c2cf5854aa9ab4b7ebb8d08677d2b14dfe`
- Handoff 3F affiliate governance: `0ddf9d63580be4be2151b4bec53d32d56e91501b` (parent `0e4305c2cf5854aa9ab4b7ebb8d08677d2b14dfe`, tree `0a0c7f8422fe7abafba30ac4df89797b25a0d433`)
