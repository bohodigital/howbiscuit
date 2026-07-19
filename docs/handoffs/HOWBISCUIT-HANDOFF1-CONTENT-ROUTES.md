# How Biscuit Handoff 1: Phase C Content and Routes

Date: 2026-07-19

Work order: `WO-2026-07-17-HOWBISCUIT-HANDOFF1-CONTENT-ROUTES-003`

Accepted parent: `8158b1ec432fed60c424d97c84d9ff046f0505bb`

Working branch: `repair/howbiscuit-h1-c-preview-analytics-gate`

Exact candidate commit: the commit containing this report. The canonical external work-order report records its resolved Git SHA and direct parent because a tracked commit cannot self-reference either value without changing the value it tries to name. Commit `cb96a4413ae33cd0fc2c7cd99641157fd7ce0cb2` is the last owner-accepted Phase C candidate and the Phase D repair base. Phase D independently rejected that exact artifact because its production GA4 bootstrap also initialized on the private preview hostname. No verdict or owner acceptance transfers from that earlier candidate to the commit containing this report.

## Phase boundary and status

Phase C moves the public content, category routes, route migrations, trust copy, generated discovery surfaces, and article-wide services onto the accepted custom Astro shell and one normalized registry. It does not constitute owner acceptance, merge to `main`, public publication, or permission to begin Phase D.

- Phase B was explicitly owner-accepted at the exact parent above.
- Phase D remains blocked until the owner accepts the exact Phase C completion commit through Bohopi.
- `main` and public production remain outside this branch.
- No DNS, Cloudflare-account, analytics-property, credential, external-account, production D1/R2, merchant, affiliate, or spending action is included.

### Phase D rejection and bounded repair

Fresh Phase D independent acceptance rejected predecessor `0cf652059498d576334c27255ad73b56e2c0bb4a` on two P2 defects. First, the globally imported public stylesheet still shipped unused `.hb-topic-directory` and `.hb-hub-title` architecture, including retired division identifiers, while a stale Phase B test required those selectors. Second, the shared 404 artifact advertised `https://howbiscuit.com/404/` as the canonical and Open Graph URL for every terminal or unknown route even though the governed route matrix declares no canonical destination.

This replacement removes the dead stylesheet architecture and reverses its stale test assertion. A nullable canonical contract now makes the custom 404 omit `rel=canonical`, `og:url`, and `WebPage` structured data while retaining `noindex, nofollow`, recovery content, and Pagefind exclusion. The static-build verifier and built-artifact tests fail closed if that behavior regresses. The same bounded repair gives generated LaTeX biscuit-box landmarks accessible names, restores the approved **Browse All Guides** CTA, and emits `og:type=article` on article pages. These changes do not alter taxonomy, redirects, public eligibility, article canonicals, analytics, or LaTeX safety.

The first replacement review then found five further P2 defects: the bounded Node policy was declarative rather than executable, retired observed-route and division/subtopic data structures remained exported, storage denial bypassed dark system preference during theme bootstrap, the categoryless editorial standard rendered duplicate classifications and a fabricated `articleSection`, and the custom disclosure chevron fell below 3:1 contrast on honey states. The next bounded repair added an executable Node guard to install and every governed npm entrypoint, removed the unused retired structures, deterministically tested storage-denied system theme resolution, rendered explicitly named category/topic/type classifications without inventing a category, and made the chevron inherit the high-contrast text color. RSS and `llms.txt` artifact checks reject both missing and unexpected canonical routes.

A later fresh Phase D blocking review found one additional P2 implementation defect: eligible pages unconditionally loaded and configured the production GA4 identity on the owner-restricted Sites hostname, so authenticated review visits could pollute production analytics. This replacement makes the GA4 bootstrap fail closed unless `window.location.hostname` is exactly `howbiscuit.com` or `www.howbiscuit.com`; only then does it append the single production loader and issue the single configuration call. Owner-preview, localhost, lookalike, and other hosts stay inert. A deterministic VM regression executes the built bootstrap for both public hosts and four nonpublic hosts, proving the public one-loader/one-config behavior and preview suppression. The existing domain-scoped Umami loader and both production analytics identities remain unchanged.

A subsequent exact-packet architecture review found that the host-canonicalization Worker was present only in the separate owner-preview Sites bundle, while the declared production Cloudflare Pages lane published the normal static `dist/` artifact. The bounded repair now emits an advanced-mode `dist/_worker.js` during every normal build, executes it against the complete host/path matrix, and requires it to delegate ordinary requests to `env.ASSETS`. Because Pages Functions responses cannot rely on `_headers` being applied automatically, the same fail-closed compiler parses the single global header contract and attaches its three governed security headers to both redirects and delegated asset responses. Sites packaging verifies that exact generated worker before moving equivalent logic to its server bundle and removing the client copy. This closes the production-artifact gap without changing Cloudflare account configuration or deploying production.

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

This is the complete Phase C migration matrix. “Included” refers to the final canonical 200 route; redirect sources, terminal routes, and below-threshold routes are excluded from both generated discovery surfaces.

### Owner-approved resolution: Streaming TVs legacy route

The governing handoff's exact row sends `/home-tech/streaming-tvs/` to `/home-tech/tvs-streaming/`, but that canonical topic is required to remain a 404 until it has at least three publishable guides. Sending visitors there now would therefore conflict with the same handoff's no-dead-destination and no-thin-topic rules. On 2026-07-18, the owner explicitly approved the safe one-hop recovery route `/home-tech/` while the topic is below threshold. At three real guides, the canonical threshold function computes `/home-tech/tvs-streaming/` and the deterministic build gate fails until `public/_redirects` is atomically updated to that destination. The decision is recorded in Bohopi on this Phase C work order; it resolves this route contradiction but does not accept the eventual Phase C completion commit.

The same fail-closed transition contract covers every legacy or canonical Home Tech topic redirect declared by `TOPIC_REDIRECT_MIGRATIONS`. At the standalone threshold, an alias must redirect to its real topic route, while a redirect whose source is the canonical topic route must be removed so the generated page can be reached. The build gate rejects a stale redirect artifact or route contract; runtime code never mutates either tracked source.

| Previous or requested route | New route or terminal status | Redirect code | Canonical destination | Sitemap | Pagefind | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | Preserve 200 | — | `/` | Included | Included | Preserve the homepage. |
| `/home-tech/` | Preserve 200 | — | `/home-tech/` | Included | Included | Preserve the approved Home Tech category. |
| `/home/` | Create 200 | — | `/home/` | Included | Included | Publish the approved Home & Apartment category. |
| `/kitchen/` | Create 200 | — | `/kitchen/` | Included | Included | Publish the approved Kitchen category. |
| `/shop/` | Create 200 | — | `/shop/` | Included | Included | Publish Shop Smarter without inventing product data. |
| `/tools/` | Preserve 200 | — | `/tools/` | Included | Included | Preserve the approved Tools category. |
| `/articles/` | Preserve 200 and relabel All Guides | — | `/articles/` | Included | Included | Preserve the canonical guide index under its approved public label. |
| `/make-do/` | `/home/` | 301 | `/home/` | Source excluded; destination included | Source excluded; destination included | Migrate the legacy Home and DIY category directly to Home & Apartment. |
| `/cook/` | `/kitchen/` | 301 | `/kitchen/` | Source excluded; destination included | Source excluded; destination included | Migrate the legacy Cooking category directly to Kitchen. |
| `/buying-guides/` | `/shop/` | 301 | `/shop/` | Source excluded; destination included | Source excluded; destination included | Migrate the legacy Buying Guides category directly to Shop Smarter. |
| `/research-writing/` | `/editorial-policy/` | 301 | `/editorial-policy/` | Source excluded; destination included | Source excluded; destination included | Move the noncommercial editorial standard to the trust surface. |
| `/science/` | Terminal 404 | — | None | Excluded | Excluded | Retire the thin legacy division after migrating its real articles; the candidate artifact returns 404. |
| `/glossary/` | Terminal 404 | — | None | Excluded | Excluded | Retire the thin legacy glossary rather than publish an empty surface; the candidate artifact returns 404. |
| `/math/` | Recovery 404 linking to BetterGrades | — | None | Excluded | Excluded | Retire the unrelated math surface while giving visitors a truthful recovery path. |
| `/home-tech/computers-laptops/` | 404 while below threshold | — | None while hidden | Excluded | Excluded | The canonical topic needs three publishable guides before it becomes a 200 index. |
| `/home-tech/tvs-streaming/` | 404 while below threshold | — | None while hidden | Excluded | Excluded | The canonical topic needs three publishable guides before it becomes a 200 index. |
| `/home-tech/gaming-pcs/` | `/home-tech/` | 301 | `/home-tech/` | Source excluded; destination included | Source excluded; destination included | Recover at the final category while Computers & Laptops is below threshold. |
| `/home-tech/laptops/` | `/home-tech/` | 301 | `/home-tech/` | Source excluded; destination included | Source excluded; destination included | Recover at the final category while Computers & Laptops is below threshold. |
| `/home-tech/streaming-tvs/` | `/home-tech/` while below threshold; `/home-tech/tvs-streaming/` at three guides | 301 | Threshold-selected final destination | Source excluded; destination included | Source excluded; destination included | Owner-approved Phase C resolution: recover at the final category now; at the threshold, the build gate requires an atomic redirect-artifact update to the real standalone topic. |
| `/home-tech/wifi-routers/` | `/home-tech/` | 301 | `/home-tech/` | Source excluded; destination included | Source excluded; destination included | Keep the zero-guide topic hidden and recover at its category. |
| `/home-tech/smart-home/` | `/home-tech/` | 301 | `/home-tech/` | Source excluded; destination included | Source excluded; destination included | Keep the zero-guide topic hidden and recover at its category. |
| `/home-tech/privacy-security/` | `/home-tech/` | 301 | `/home-tech/` | Source excluded; destination included | Source excluded; destination included | Keep the zero-guide topic hidden and recover at its category. |
| `/cooking/*` | `/kitchen/` | 301 | `/kitchen/` | Sources excluded; destination included | Sources excluded; destination included | Collapse the legacy family directly to the final Kitchen category. |
| `/make-do-lab/*` | `/home/` | 301 | `/home/` | Sources excluded; destination included | Sources excluded; destination included | Collapse the legacy family directly to the final Home & Apartment category. |
| `/articles/why-salt-melts-ice/` | Preserve 200 | — | `/articles/why-salt-melts-ice/` | Included | Included | Preserve the canonical LaTeX article route. |
| `/articles/how-does-baking-powder-work/` | Preserve 200 | — | `/articles/how-does-baking-powder-work/` | Included | Included | Preserve the canonical practical guide route. |
| `/articles/why-are-some-answers-better-than-others/` | Preserve 200 | — | `/articles/why-are-some-answers-better-than-others/` | Included | Included | Preserve the canonical editorial-standard route. |
| `/about/` | Preserve 200 | — | `/about/` | Included | Included | Preserve the public trust route. |
| `/affiliate-disclosure/` | Preserve 200 | — | `/affiliate-disclosure/` | Included | Included | Preserve the public disclosure route. |
| `/contact/` | Preserve 200 | — | `/contact/` | Included | Included | Preserve the public contact route. |
| `/corrections/` | Preserve 200 | — | `/corrections/` | Included | Included | Preserve the public corrections route. |
| `/editorial-policy/` | Preserve 200 | — | `/editorial-policy/` | Included | Included | Preserve the public editorial standard. |
| `/privacy/` | Preserve 200 | — | `/privacy/` | Included | Included | Preserve the public privacy route. |
| `https://www.howbiscuit.com/*` | Final path on `https://howbiscuit.com` | 301 | Final apex URL | Apex canonical URLs only | Apex canonical URLs only | Remove the duplicate host; if the path is also legacy, collapse host and path migration into the same response. |

The 12 tracked path rules and single global `_headers` rule are parsed fail-closed and compiled into one canonical Worker source. Every normal build emits it as the advanced-mode production Cloudflare Pages artifact `dist/_worker.js`; the separate owner-preview packaging lane verifies that exact file before installing equivalent server-side logic and removing the client copy. Both forms run before static assets, handle legacy paths and `www` canonicalization, attach the exact `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy` values to redirects and delegated asset responses, and delegate current routes to `env.ASSETS`. Executable build and unit checks issue apex, `www`, and preview-host requests for every exact and wildcard rule, assert status 301, the exact `Location`, and all three security headers, follow that location, and require a delegated 200 rather than a second redirect. Retired source MDX files no longer build as 200 pages.

This is candidate-artifact evidence, not a live-production claim. The previously observed public `www` response remained 200, and changing it requires the separate Phase C acceptance and publication approvals.

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
- Pagefind title, description, route, human-readable type, and source-owned category metadata when a category exists.

The specialized LaTeX paper retains its paper body and outline while sharing all of these global services.

## Trust changes

- Contact and Corrections publish `hello@howbiscuit.com` for general contact, corrections, source concerns, product-data corrections, and rights or attribution concerns.
- About states exactly: “How Biscuit is an independent practical-guides publication operated by Boho Digital Services.”
- About and Affiliate Disclosure truthfully state that the current build contains no affiliate links, sponsored placements, paid reviews, or product placements.
- Editorial Policy publishes the governed evidence vocabulary and does not call specification review testing.
- The recovery 404 links `/math/` visitors to BetterGrades.
- The recovery 404 has no canonical URL, Open Graph URL, or `WebPage` schema because terminal and unknown requests have no governed canonical destination.
- Every page footer exposes the five registry-owned category routes plus All Guides before the trust and discovery links.

## Generated public surfaces

One normalized registry contains all 16 public documents. Its article subset drives article-wide surfaces, while `isPublishableGuide` narrows every guide-labeled shelf to categorized guide records. One shared eligibility rule drives:

- homepage featured and latest guide-only shelves;
- category featured and latest guides;
- topic visibility and future standalone topic indexes;
- threshold-aware redirect destinations and canonical-topic redirect removal;
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

The redundant `@astrojs/sitemap` integration and package were removed so the registry-owned sitemap endpoint is the sole sitemap generator. Pinned `semver@7.8.5` is now a direct runtime dependency of the fail-closed Node guard. The declared Node policy supports the default native TypeScript-loading boundary on Node 22 from `22.18.0`, intentionally excludes the non-LTS Node 23 major, supports the Node 24 major from `24.0.0`, and rejects Node 25 and later until those majors receive their own governed validation.

## Validation evidence

### Windows x64

- LaTeX deterministic compile and check: passed for one canonical article.
- Normalized public contract: 5 categories, 31 topics, 3 articles, 16 document routes, 2 category-filter topics, 0 standalone topic indexes, and 0 redirect chains.
- TypeScript contract: passed.
- Astro diagnostics: 73 files, 0 errors, 0 warnings, 0 hints.
- Static build: 17 HTML files.
- Pagefind: 16 eligible pages, 16 real indexed fragments, 1,019 indexed words, 2 populated filters, exact normalized title, description, route, and type metadata in every fragment, and a public category filter only where canonical source metadata provides one.
- Node tests: 49 passed, 0 failed, including fail-closed guards for retired source and stylesheet architecture, canonical-free 404 metadata, named complementary landmarks, article Open Graph type, primary-navigation state, exact RSS/`llms.txt` route sets, storage-denied system-theme resolution, truthful categoryless classification, executable supported-Node boundaries, and exact-host GA4 initialization with preview suppression.
- Content lint: 16 MDX pages and 22 built files.
- Sites package: 17 HTML files, 16 eligible pages, 16 Pagefind fragments.
- Loopback: home, All Guides, and the representative LaTeX article returned 200; a missing route returned 404.

### Browser and accessibility

- On the candidate lineage before the final blocking-review repairs, the desktop homepage, Home & Apartment category, and LaTeX article rendered from the built x64 artifact.
- That lineage's search dialog focused its input, returned six Pagefind results for `salt`, closed deterministically, and returned focus to its trigger.
- That lineage's mobile category and article passed at 390 by 844 CSS pixels with no horizontal overflow; mobile navigation opened with focus on Close, closed deterministically, and returned focus to the mobile trigger.
- Exact repaired-tree tests verify heading-level continuity, standalone-topic H1/H2/H3 order, truthful omission of category filters from categoryless records, all threshold-dependent redirect transitions, guide-only homepage shelves, current category/section state across desktop, mobile, and no-JavaScript primary navigation, storage-denied dark-system theme bootstrap, high-contrast disclosure indicators, the count-aware topic-link name, and that an ordinary article's table-of-contents navigation precedes its body in mobile DOM order.
- The in-app browser rejected both loopback and private-LAN HTTP preview URLs during this repair's pre-commit validation. Exact-SHA interactive replay therefore remains a Phase D requirement against the owner-restricted HTTPS Sites preview; no local-browser success is claimed here.

### Raspberry Pi

The canonical work-order report records the exact clean candidate SHA, Pi transfer, platform proof, `qa:pi`, loopback results, preview cleanup, and final clean-worktree proof.

## Known limitations

- Native Pagefind remains unavailable on the Pi ARM64/16 KiB environment. The Pi validation artifact must omit Pagefind only after the platform guard passes. Every release artifact still requires the full x64 Pagefind build.
- The current registry has only three real articles. Twenty-nine zero-guide topics remain hidden, two one-guide topics remain category filters, and no standalone topic index exists yet.
- Shop Smarter has no verified product dataset, rankings, deals, live prices, or merchant data. Its state is explicit and non-transactional.
- Standard and generated LaTeX article asides now carry accessible names. Generic classification, topic-label, and search-result containers use explicit nameable roles, and article evidence/testing badges expose the normalized source-owned values rather than generic declared states.
- The supported runtime is deliberately bounded to the validated Node 22 and Node 24 majors (`^22.18.0 || ^24.0.0`). Install and every governed npm entrypoint execute the pinned-semver guard before work begins; regressions prove Node 23 and future majors fail closed.
- Phase C intentionally removed `@astrojs/sitemap` and its lockfile entries. A later exact cold install refreshed npm's advisory data and reported ten findings, including two high-severity Astro advisories affecting `6.4.2`. Phase C therefore took the narrow compatible patch from Astro `6.4.2` to `6.4.6`; the post-update cold npm 11.7.0 install reports seven remaining findings (three low and four moderate) and no high or critical finding. `npm audit fix --package-lock-only --dry-run` proposed no lockfile change; resolving the residual toolchain advisories would require broader major-version work, so no forced audit rewrite was applied.
- Browser evidence is local candidate-lineage evidence rather than final repaired-SHA or public-production evidence. Production remains unchanged.
- The normal production `dist/_worker.js` and the separately packaged Sites Worker contain the same supported `www`-to-apex behavior. The public host remains unchanged until the separately approved release lane deploys and verifies it live.

## Changed-file scope

The candidate changes exactly 72 paths from the accepted Phase B parent. A manager-reviewed seven-path exception above the original 65-path ceiling is recorded in Bohopi: `src/styles/biscuit.css` removes the globally shipped retired architecture that caused Phase D's rejection; `src/components/BiscuitBox.astro`, `src/components/RelatedShelf.astro`, `src/components/EvidenceBadge.astro`, and `src/components/TestingBadge.astro` resolve exact-SHA accessibility and evidence-truth findings; `src/styles/shell.css` repairs the reviewed disclosure-indicator contrast defect; and `scripts/check-node-version.mjs` makes the already-approved runtime boundary executable. The GA4 repair and production Pages Worker repair change only already-counted allowed paths, so neither expands that 72-path accepted-base inventory. All 72 paths remain within the Phase C allowlist; the repair introduces no new product or infrastructure system. The canonical work-order report records the exact sorted inventory and diff proof.

## Rollback

Before merge, abandon this isolated branch/worktree and recreate it from exact accepted Phase B commit `8158b1ec432fed60c424d97c84d9ff046f0505bb`; the accepted parent remains immutable, so no source-history mutation is required. If a retained candidate branch instead needs a reverse commit, run `git revert --no-commit 8158b1ec432fed60c424d97c84d9ff046f0505bb..HEAD`, inspect the staged reversal, commit it, reinstall from the pinned lockfile, and rerun the accepted Phase B x64 QA lane. If Phase C is later squash-merged, revert that exact squash commit. Any production rollback remains a separate owner-approved release action.

## Acceptance gate

Phase C remains `in_progress` while implementation, validation, blocking review, or report repair is incomplete. Only after all blockers are cleared, fresh exact-SHA OpenAI/Codex blocking reviews pass, Pi validation passes, and the canonical report records the exact evidence may Bohopi move Phase C to `needs_review`. It must then remain `needs_review` until the owner explicitly accepts that exact SHA in Bohopi. Phase D must not begin before that acceptance.
