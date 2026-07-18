# How Biscuit Handoff 1: Phase C Content and Routes

Date: 2026-07-18

Work order: `WO-2026-07-17-HOWBISCUIT-HANDOFF1-CONTENT-ROUTES-003`

Accepted parent: `8158b1ec432fed60c424d97c84d9ff046f0505bb`

Working branch: `feature/howbiscuit-h1-c-content-routes`

Exact candidate commit: the commit containing this report. The canonical work-order report records its resolved Git SHA because a commit cannot reliably name itself.

## Phase boundary and status

Phase C moves the public content, category routes, route migrations, trust copy, generated discovery surfaces, and article-wide services onto the accepted custom Astro shell and one normalized registry. It does not constitute owner acceptance, merge to `main`, public publication, or permission to begin Phase D.

- Phase B was explicitly owner-accepted at the exact parent above.
- Phase D remains blocked until the owner accepts the exact Phase C completion commit through Bohopi.
- `main` and public production remain outside this branch.
- No DNS, Cloudflare-account, analytics-property, credential, external-account, production D1/R2, merchant, affiliate, or spending action is included.

## Taxonomy

The active public categories are:

| ID | Public label | Canonical route |
| --- | --- | --- |
| `home-tech` | Home Tech | `/home-tech/` |
| `home` | Home & Apartment | `/home/` |
| `kitchen` | Kitchen | `/kitchen/` |
| `shop` | Shop Smarter | `/shop/` |
| `tools` | Tools | `/tools/` |

`/articles/` remains canonical and is labeled **All Guides**.

The registry contains 31 approved topic definitions. Publication is fail-closed:

- zero publishable guides: hidden;
- one or two publishable guides: category filter only;
- three or more publishable guides: standalone topic index.

At this candidate, `home/heating-cooling` and `kitchen/food-science` are category filters. The other 29 topics are hidden. No standalone topic index is emitted.

## Route migration

| Previous or requested route | Phase C result |
| --- | --- |
| `/` | Preserve 200 and canonical `/` |
| `/home-tech/` | Preserve 200 |
| `/home/` | Create 200 |
| `/kitchen/` | Create 200 |
| `/shop/` | Create 200 |
| `/tools/` | Preserve 200 |
| `/articles/` | Preserve 200; public label becomes All Guides |
| `/make-do/` | 301 directly to `/home/` |
| `/cook/` | 301 directly to `/kitchen/` |
| `/buying-guides/` | 301 directly to `/shop/` |
| `/research-writing/` | 301 directly to `/editorial-policy/` |
| `/science/` | Clean 404/410 terminal behavior |
| `/glossary/` | Clean 404/410 terminal behavior |
| `/math/` | Clean recovery 404 linking to BetterGrades |
| `/home-tech/gaming-pcs/` | 301 directly to `/home-tech/` while the intended topic is below threshold |
| `/home-tech/laptops/` | 301 directly to `/home-tech/` while the intended topic is below threshold |
| `/home-tech/streaming-tvs/` | 301 directly to `/home-tech/` while the intended topic is below threshold |
| `/home-tech/wifi-routers/` | 301 directly to `/home-tech/`; zero-guide topic stays hidden |
| `/home-tech/smart-home/` | 301 directly to `/home-tech/`; zero-guide topic stays hidden |
| `/home-tech/privacy-security/` | 301 directly to `/home-tech/`; zero-guide topic stays hidden |
| `/cooking/*` | 301 directly to `/kitchen/` |
| `/make-do-lab/*` | 301 directly to `/home/` |
| existing article and trust routes | Preserve exactly |
| `www.howbiscuit.com/*` | Preserve direct canonical-host 301 to `howbiscuit.com` |

The target resolver reports zero redirect chains. Retired source MDX files no longer build as 200 pages.

## Article migration

| Canonical article | Canonical source | Category | Topic | Type | Evidence | Testing |
| --- | --- | --- | --- | --- | --- | --- |
| `/articles/why-salt-melts-ice/` | `content/latex/articles/why-salt-melts-ice.tex` | Home & Apartment | Heating & Cooling | Guide | Researched | Not hands-on tested |
| `/articles/how-does-baking-powder-work/` | article MDX | Kitchen | Food Science | Guide | Researched | Not hands-on tested |
| `/articles/why-are-some-answers-better-than-others/` | article MDX | none | none | Editorial standard | Editorial standard | Testing not applicable |

Classification, editorial priority, direct answer, problem label, evidence, testing, source notes, related routes, disclosure, dates, and featured state are source-owned. The temporary Phase B classification manifest and the legacy division adapter are removed.

The LaTeX compiler validates the new metadata fail-closed, carries structured source and related metadata into the deterministic generated bridge, preserves static KaTeX HTML and MathML, and continues to reject unsafe commands, file inclusion, arbitrary execution, unsupported prose, unsafe URLs, and malformed math.

## Homepage and category surfaces

The homepage follows the governed conceptual order:

1. Hero.
2. Metadata-generated featured guides.
3. Real browse-by-problem destinations.
4. All five categories.
5. Metadata-generated latest guides.
6. Honest shopping-resource state.
7. Trust strip.

No manual article array or dead local-prices action is present. Category pages provide descriptions, threshold-eligible topic filters, featured and latest guides, relevant-tools states, the Shop Smarter product-group state, neighboring categories, and honest empty states without empty grids or filler cards.

## Article-wide services

Every article uses the normalized record for:

- breadcrumb, category, topic, and article type;
- direct answer, updated date, read time, evidence, and testing labels;
- truthful no-paid-links disclosure;
- structured source notes and deterministic related guides;
- correction route;
- Article and BreadcrumbList JSON-LD;
- Pagefind title, description, category, and type metadata.

The specialized LaTeX paper retains its paper body and outline while sharing all of these global services.

## Trust changes

- Contact and Corrections publish `hello@howbiscuit.com` for general contact, corrections, source concerns, product-data corrections, and rights or attribution concerns.
- About states exactly: “How Biscuit is an independent practical-guides publication operated by Boho Digital Services.”
- About and Affiliate Disclosure truthfully state that the current build contains no affiliate links, sponsored placements, paid reviews, or product placements.
- Editorial Policy publishes the governed evidence vocabulary and does not call specification review testing.
- The recovery 404 links `/math/` visitors to BetterGrades.
- Every page footer exposes the five registry-owned category routes plus All Guides before the trust and discovery links.

## Generated public surfaces

One normalized registry contains all 16 public documents, while the same registry's article subset drives guide-only surfaces. One shared eligibility rule drives:

- homepage featured and latest guides;
- category featured and latest guides;
- topic visibility and future standalone topic indexes;
- All Guides;
- related guides;
- RSS;
- sitemap and `lastmod`;
- Pagefind inclusion and metadata;
- generated `llms.txt`;
- WebSite, Article, and BreadcrumbList JSON-LD.

The generated artifact contains 17 HTML files: the exact 16 Phase C document routes plus the custom 404. All 16 public document routes are Pagefind-eligible and sitemap-eligible. Sitemap `lastmod` values come only from source-owned publication or modification dates; routes without either date omit `lastmod`. RSS contains the three canonical articles. `llms.txt` contains all 16 public routes plus `hello@howbiscuit.com`.

## Starlight status and dependencies

Starlight remains fully absent from the public runtime, content schema, integrations, source tree, package manifest, and lockfile. The custom catch-all renderer owns the exact Phase C route boundary.

No dependency was added. The redundant `@astrojs/sitemap` integration and package were removed so the registry-owned sitemap endpoint is the sole sitemap generator.

## Validation evidence

### Windows x64

- LaTeX deterministic compile and check: passed for one canonical article.
- Normalized public contract: 5 categories, 31 topics, 3 articles, 16 document routes, 2 category-filter topics, 0 standalone topic indexes, and 0 redirect chains.
- TypeScript contract: passed.
- Astro diagnostics: 72 files, 0 errors, 0 warnings, 0 hints.
- Static build: 17 HTML files.
- Pagefind: 16 eligible pages and 16 real indexed fragments.
- Node tests: 40 passed, 0 failed.
- Content lint: 16 MDX pages and 22 built files.
- Sites package: 17 HTML files, 16 eligible pages, 16 Pagefind fragments.
- Loopback: home, All Guides, and the representative LaTeX article returned 200; a missing route returned 404.

### Browser and accessibility

- On the candidate lineage before the final blocking-review repairs, the desktop homepage, Home & Apartment category, and LaTeX article rendered from the built x64 artifact.
- That lineage's search dialog focused its input, returned six Pagefind results for `salt`, closed deterministically, and returned focus to its trigger.
- That lineage's mobile category and article passed at 390 by 844 CSS pixels with no horizontal overflow; mobile navigation opened with focus on Close, closed deterministically, and returned focus to the mobile trigger.
- Exact repaired-tree artifact tests verify heading-level continuity, public category labels, the count-aware topic-link name, and that an ordinary article's table-of-contents navigation precedes its body in mobile DOM order.
- Exact repaired-SHA interactive replay remains required when the in-app browser backend becomes available; the backend returned unavailable during the first repaired-candidate review attempt.

### Raspberry Pi

The canonical work-order report records the exact clean candidate SHA, Pi transfer, platform proof, `qa:pi`, loopback results, preview cleanup, and final clean-worktree proof.

## Known limitations

- Native Pagefind remains unavailable on the Pi ARM64/16 KiB environment. The Pi validation artifact must omit Pagefind only after the platform guard passes. Every release artifact still requires the full x64 Pagefind build.
- The current registry has only three real articles. Twenty-nine zero-guide topics remain hidden, two one-guide topics remain category filters, and no standalone topic index exists yet.
- Shop Smarter has no verified product dataset, rankings, deals, live prices, or merchant data. Its state is explicit and non-transactional.
- `npm ci` retains the accepted dependency audit baseline of six findings: one low, four moderate, and one high. No forced audit rewrite was applied.
- Browser evidence is local candidate-lineage evidence rather than final repaired-SHA or public-production evidence. Production remains unchanged.

## Changed-file scope

The candidate changes exactly 65 paths, meeting the Phase C work-order ceiling. All paths are within the Phase C allowlist. The canonical work-order report records the exact sorted inventory and diff proof.

## Rollback

Before merge, restore the accepted Phase B parent by reverting or removing the complete range `8158b1ec432fed60c424d97c84d9ff046f0505bb..candidate` newest-to-oldest, then reinstall with the pinned lockfile and rerun the accepted Phase B x64 QA lane. If Phase C is later squash-merged, revert that squash commit instead. Any production rollback remains a separate owner-approved release action.

## Acceptance gate

Phase C must remain `needs_review` until fresh exact-SHA OpenAI/Codex blocking reviews pass, Pi validation passes, the canonical report records the evidence, and the owner explicitly accepts that exact SHA in Bohopi. Phase D must not begin before that acceptance.
