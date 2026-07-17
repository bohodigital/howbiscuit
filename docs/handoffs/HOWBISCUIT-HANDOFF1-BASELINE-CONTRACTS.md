# How Biscuit Handoff 1: Phase A Baseline and Contracts

Date: 2026-07-17

Work order: `WO-2026-07-17-HOWBISCUIT-HANDOFF1-BASELINE-CONTRACTS-001`

Branch goal: `BG-2026-07-17-HOWBISCUIT-HANDOFF1-PUBLIC-SHELL`

Starting commit: `99732e1c494e468df92fab22ed71c7da4ead39c5`

Working branch: `feature/howbiscuit-h1-a-baseline-contracts`

## Phase boundary and verdict

This document freezes Phase A contracts and prepares the next work order. It does not implement the custom Astro shell.

- The current public site still uses Starlight.
- Current public pages, layouts, and components are unchanged.
- Every target category, topic, route migration, and `All Guides` label is marked `implemented: false`.
- No merge to `main`, production deployment, Sites publication, DNS change, cache purge, analytics-property change, or secret access occurred.
- Phase B remains blocked until Phase A receives the required human acceptance in MCP.
- Phase C owns content surfaces and route migration; Phase B must not implement those changes early.

## Verified source-of-truth state

### MCP

The live Bohopi work-order queue showed:

- Phase A baseline/contracts: `ready`.
- Phase B custom Astro shell: `blocked`.
- Phase C content/routes: `blocked`.
- Phase D acceptance preview: `blocked`.

The Phase A work order allows configuration, data, public-content library, LaTeX library, scripts, tests, documentation, package metadata, and bounded redirect/header work. It forbids edits to `src/layouts/**`, `src/pages/**`, and `src/components/**`.

### Raspberry Pi and Git

Canonical checkout: `/srv/local1/repos/sites/howbiscuit-site`

At Phase A start:

- Pi checkout: clean `main...github/main`.
- `HEAD`: `99732e1c494e468df92fab22ed71c7da4ead39c5`.
- `origin/main`: `99732e1c494e468df92fab22ed71c7da4ead39c5`.
- `github/main`: `99732e1c494e468df92fab22ed71c7da4ead39c5`.
- Obsolete calculator/tax commit `6e24d01da3a1c28865c9a5b4c647a0ed5973dfe0` is not an ancestor of `main`.
- Work was isolated from the stale Windows calculator checkout in a fresh clone of the Pi baseline.

Production release evidence identifies:

- Production baseline: `99732e1c494e468df92fab22ed71c7da4ead39c5`.
- Immutable Pages deployment: `https://fa682167.howbiscuit.pages.dev`.
- Existing salt article: 14 KaTeX/MathML renders with no horizontal overflow in prior release verification and in the Phase A browser baseline.

## Observed current behavior

This section records current behavior. It is not the target design.

### Routes and generated surfaces

The baseline content sitemap contains 25 canonical document URLs:

- `/`.
- Six trust pages: `/about/`, `/affiliate-disclosure/`, `/contact/`, `/corrections/`, `/editorial-policy/`, and `/privacy/`.
- `/articles/` plus the three published article canonicals.
- Eight current division/category pages: `/buying-guides/`, `/cook/`, `/glossary/`, `/home-tech/`, `/make-do/`, `/research-writing/`, `/science/`, and `/tools/`.
- Six current Home Tech topic pages: `gaming-pcs`, `laptops`, `privacy-security`, `smart-home`, `streaming-tvs`, and `wifi-routers`.

The x64 baseline build produced the same content set plus `404.html`, and also generated:

- `/feed.xml`.
- `/robots.txt`.
- `/sitemap.xml` and the Astro sitemap index.
- Pagefind assets.
- Static `llms.txt` from `public/llms.txt`.

The live `/math/` route returns `404`.

### Redirects and host behavior

`public/_redirects` currently declares:

- `www.howbiscuit.com/*` to apex with `301`.
- `/cooking/*` to `/cook/:splat` with `301`.
- `/make-do-lab/*` to `/make-do/:splat` with `301`.

Live verification found a discrepancy: `www.howbiscuit.com` served `200` with an apex canonical instead of performing the declared redirect. Phase A records this mismatch and does not change production or purge caches.

### Canonical and social metadata

Representative apex and article pages contained:

- Apex canonical URLs.
- One Open Graph image: `https://howbiscuit.com/og.png`.
- One Twitter summary-card image using the same asset.
- Existing title and description metadata supplied through Starlight.

### Analytics

The exact source identities are guarded, not merely counted:

- One Umami loader: `https://analytics.bohodigitalservices.com/script.js`.
- Umami website ID: `fefef93c-b1d6-4d04-95d3-064af3d38a41`.
- One GA4 loader and one configuration call for `G-NG0NQMVFEH`.

No analytics property or identifier changed.

### RSS, sitemap, robots, and llms.txt

- RSS contains exactly the three real published articles, ordered with Salt first by publication date.
- The custom sitemap currently includes all 25 Starlight documents, including legacy and future-retired division pages.
- Robots currently allows crawling and points to `/sitemap.xml`.
- `llms.txt` is a hand-maintained generic static file; it is not yet generated from normalized content.

### Pagefind and representative search

- Live Pagefind entry metadata reported version `1.5.2` and `page_count: 25`.
- The x64 baseline build found 26 HTML files and produced `dist/pagefind/`.
- `freezing point` found the salt article.
- `baking powder` found the baking-powder article.
- `laptop battery` found Home Tech and buying-guide material.
- Native Pi Pagefind remains unavailable because the ARM64 binary is incompatible with the Pi's 16 KiB page-size environment.

### Theme and navigation baseline

Desktop baseline:

- Header dropdowns open, close with Escape, close on outside interaction, and retain focus correctly.
- Only one header menu remains open at a time.
- Dark, Light, and Auto theme choices work; Auto follows the system preference.
- Search opens and returns focus when toggled. In one baseline Escape test, the query/modal state cleared without completing the expected close behavior; this remains a Phase B regression target.

Mobile baseline at `390x844`:

- The menu button is fixed at the bottom-right rather than in the target top navigation.
- Opening the sidebar locks background scrolling.
- Escape closes it and returns focus.
- No horizontal overflow was observed.

### Articles and LaTeX

Preserved article canonicals:

- `/articles/why-salt-melts-ice/`.
- `/articles/how-does-baking-powder-work/`.
- `/articles/why-are-some-answers-better-than-others/`.

Salt is authored in tracked TeX, compiled into ignored generated MDX and an ignored generated module, and registered as a Starlight document. The baseline compiler produces accessible KaTeX HTML and MathML and rejects unsafe TeX commands, invalid math, unsafe links, unsupported commands, and repeated document environments.

## Canonical target taxonomy

The sole target taxonomy is `src/config/public-taxonomy.ts`. The old `src/data/site-taxonomy.mjs` is explicitly labeled an observed current Starlight dependency and is not authoritative for the target shell.

| Order | ID | Label | Route | Topics |
| ---: | --- | --- | --- | --- |
| 1 | `home-tech` | Home Tech | `/home-tech/` | `wifi-routers`, `computers-laptops`, `smart-home`, `tvs-streaming`, `privacy-security`, `power-cooling-storage` |
| 2 | `home` | Home & Apartment | `/home/` | `repairs-maintenance`, `apartment-comfort`, `heating-cooling`, `cleaning`, `tools-materials`, `utilities-energy` |
| 3 | `kitchen` | Kitchen | `/kitchen/` | `kitchen-appliances`, `cookware-tools`, `food-science`, `ingredient-substitutions`, `cheap-meals`, `troubleshooting-safety` |
| 4 | `shop` | Shop Smarter | `/shop/` | `product-comparisons`, `local-prices`, `used-refurbished`, `total-cost-ownership`, `deals-worth-considering`, `products-to-avoid`, `product-index` |
| 5 | `tools` | Tools | `/tools/` | `calculators`, `converters`, `price-checkers`, `checklists`, `decision-tools`, `templates` |

Each category has a stable ID, route, label, description, display order, artwork identifier, and metadata defaults. Each of the 31 topics has a stable scoped identity, canonical target route, description, display order, and threshold-gated publication policy.

`/articles/` remains the target canonical index. `All Guides` is the accepted target label, but current source still renders `All Articles` in the header and `Articles` on the page. The target label is therefore `implemented: false` in Phase A.

### Topic threshold semantics

The default contiguous policy is:

- 0 publishable guides: `hidden`.
- 1-2 publishable guides: `filter`.
- 3 or more publishable guides: `standalone`.

Only a normalized `guide` with a real category and topic counts. Draft, preview, thin, redirected, retired, search-excluded, or sitemap-excluded records do not count. Categoryless editorial standards never count toward a commercial topic. Unknown topics fail instead of behaving like zero.

With the real current article set:

- `home/heating-cooling`: one guide, so `filter`.
- `kitchen/food-science`: one guide, so `filter`.
- Every other target topic: zero guides, so `hidden`.

The existing six standalone Home Tech topic pages remain publicly exposed by the current Starlight shell. This is recorded baseline drift, not a claim that the target threshold is implemented.

## Normalized public-content contract

The Phase A adapter discovers tracked article sources with `git ls-files`:

- Standard MDX articles are parsed with the same `js-yaml` parser family used by Astro/Starlight dependencies.
- TeX articles are read through the real fail-closed LaTeX compiler.
- Ignored generated Salt MDX and generated modules are not rediscovered or double-counted.

The temporary classification manifest contains only fields absent from legacy source metadata. It is forbidden from duplicating titles, descriptions, formats, dates, feed flags, evidence, read time, or featured state. Source routes and classification routes must have exact set parity, so a newly added, removed, or renamed article fails QA until deliberately classified.

The validated record represents:

- Route, canonical route, and slug.
- Source title and description.
- Category and topic.
- Article type and editorial classification.
- Standard or LaTeX format.
- Publication and update dates.
- Feed, search, sitemap, `llms.txt`, and featured eligibility.
- Editorial priority.
- Read time and evidence.
- Testing, source notes, related content, and disclosure state.
- Draft, preview, thin, redirect, and retirement state.
- Legacy source path, source kind, division, and subtopic.
- Per-field provenance.

Legacy body-only source notes and related links are represented honestly as `legacy-body` with no fabricated structured items. Testing and disclosure absent from source are represented as `not-declared`. Phase B or C must migrate those fields into canonical content metadata before claiming structured generation from them.

### Existing article classifications

| Route | Category | Topic | Article type | Decision |
| --- | --- | --- | --- | --- |
| `/articles/why-salt-melts-ice/` | Home & Apartment | Heating & Cooling | Guide | Its practical intent is cold-weather de-icing around a home; this is more specific than general repairs. |
| `/articles/how-does-baking-powder-work/` | Kitchen | Food Science | Guide | It explains ingredient chemistry and failure mechanisms. |
| `/articles/why-are-some-answers-better-than-others/` | None | None | Editorial Standard | It remains categoryless as explicitly required; no commercial category is fabricated. |

## Route migration contract

Observed and target resolution use different functions. A caller cannot accidentally treat a future destination as current behavior.

| Route | Observed baseline | Accepted target | Phase A implementation |
| --- | --- | --- | --- |
| `/home-tech/` | `200` | Preserve | False |
| `/home/` | No canonical category | Create canonical category | False |
| `/kitchen/` | No canonical category | Create canonical category | False |
| `/shop/` | No canonical category | Create canonical category | False |
| `/tools/` | `200` | Preserve | False |
| `/articles/` | `200`, current labels | Preserve; label `All Guides` | False |
| `/make-do/` | `200` legacy page | `301` to `/home/` | False |
| `/cook/` | `200` legacy page | `301` to `/kitchen/` | False |
| `/buying-guides/` | `200` legacy page | `301` to `/shop/` | False |
| `/research-writing/` | `200` legacy page | `301` to `/editorial-policy/` | False |
| `/science/` | `200` legacy page | Reviewed terminal `404` or `410` | False |
| `/glossary/` | `200` legacy page | Reviewed terminal `404` or `410` | False |
| `/math/` | `404` | Recovery `404` or `410` linking BetterGrades | False |
| `/home-tech/gaming-pcs/` | `200` thin page | `301` to `computers-laptops` destination | False |
| `/home-tech/laptops/` | `200` thin page | `301` to `computers-laptops` destination | False |
| `/home-tech/streaming-tvs/` | `200` thin page | `301` to `tvs-streaming` destination | False |
| `/cooking/*` | Source `301` to legacy namespace | Direct target `/kitchen/:splat` | False |
| `/make-do-lab/*` | Source `301` to legacy namespace | Direct target `/home/:splat` | False |
| Three existing article routes | `200` canonicals | Preserve exactly | False |
| Six existing trust routes | `200` canonicals | Preserve | False |

No target redirect chain exists in the contract. The `computers-laptops` and `tvs-streaming` destinations are explicitly threshold-gated; Phase C must not publish thin destination pages merely to satisfy a redirect.

## Starlight dependency map

### Direct package and configuration dependencies

- `package.json`: `@astrojs/starlight` is a runtime dependency.
- `astro.config.mjs`: initializes Starlight, Pagefind, site metadata, analytics, component overrides, edit links, sidebar navigation, hard-coded latest articles, and trust navigation.
- `src/content.config.ts`: uses `docsLoader()` and `docsSchema()` from Starlight and supplies the `docs` collection consumed throughout the site.

### Direct component dependencies

- `src/components/SiteHeader.astro`: imports Starlight `Search` and `ThemeSelect` and consumes the legacy taxonomy module.
- `src/components/PersistentPageFrame.astro`: imports Starlight `Sidebar`, localization through `Astro.locals.t`, Starlight IDs, CSS variables, and layout layers.
- `src/components/FieldGuideTitle.astro`: imports Starlight `PageTitle` and reads `Astro.locals.starlightRoute`.
- `src/components/HomeHero.astro`: imports Starlight `Hero` and reads `Astro.locals.starlightRoute`.
- `src/components/SiteFooter.astro`: imports the Starlight `Footer`.
- `src/components/PersistentMenuToggle.astro`: reimplements the Starlight menu-button custom element contract and relies on Starlight IDs, CSS layers, and variables.
- `src/styles/biscuit.css`: targets `starlight-toc`, `mobile-starlight-toc`, Starlight class conventions, CSS layers, and variables.

### Implicit content and build dependencies

- All MDX pages are routed by Starlight's `docs` collection.
- Generated Salt MDX imports `LatexArticle.astro` and becomes public only because Starlight registers the generated document.
- `src/pages/feed.xml.js` and `src/pages/sitemap.xml.js` use `getCollection('docs')`; their data contract currently comes from the Starlight loader/schema even though the endpoint code is custom.
- Starlight owns current document rendering, canonical/head behavior, sidebar data, table of contents, search UI, theme UI, and Pagefind integration.
- Pagefind may be skipped only in the Pi-safe lane through the existing environment guard.

### Safe removal order

1. Accept this Phase A contract and record the exact completion commit.
2. In Phase B, add custom Astro shell/layout responsibilities while preserving all accepted routes, metadata, analytics identities, theme semantics, accessibility behavior, and static output.
3. Replace header, desktop navigation, top-positioned mobile navigation, focus management, theme initialization/control, footer, page frame, title/hero behavior, and search UI. Keep Pagefind generation and search behavior verified throughout.
4. Move current sidebar and hard-coded latest navigation to the accepted target taxonomy and normalized registry; do not implement Phase C route/content migrations early.
5. Adapt the Starlight route-local data currently read through `Astro.locals.starlightRoute` into explicit Astro props/content data.
6. Preserve the LaTeX compiler and wrapper seam while changing only the route/layout registration layer.
7. In Phase C, migrate public content pages, feed, sitemap, llms, route retirements, redirects, related content, and legacy metadata.
8. Remove the legacy taxonomy only after all consumers are migrated and target behavior is proven.
9. Remove `@astrojs/starlight` only after source search finds no imports, locals, elements, selectors, variables, schema/loader dependencies, or integration calls and full x64 Pagefind plus Pi-safe QA remain green.

## Exact LaTeX adaptation seam

Current flow:

1. Tracked source: `content/latex/articles/why-salt-melts-ice.tex`.
2. Parser/security boundary: `src/lib/latex/article-compiler.mjs`.
3. Generator: `scripts/compile-latex-articles.mjs`.
4. Ignored outputs: `src/generated/latex/<slug>.mjs` and `src/content/docs/articles/<slug>.mdx`.
5. Wrapper: `src/components/LatexArticle.astro` imports KaTeX CSS, renders the outline, and injects compiler-produced safe HTML.
6. Current public registration: the generated MDX is loaded by the Starlight `docs` collection.

Phase B must preserve steps 1-5 and replace only step 6 with the custom Astro article route/layout seam. It must pass compiler-produced `html` and `outline` without reparsing or weakening security.

The compiler's `LEGACY_LATEX_DIVISIONS` is a separately named, fail-closed input vocabulary for existing TeX. It is not the target public taxonomy. `science` remains accepted for the existing source; target-only `shop` is rejected until an explicit metadata migration changes the TeX source and compiler contract together.

`latex:check` now rejects:

- Missing or stale generated MDX.
- Missing or stale generated modules.
- Orphaned generated MDX.
- Orphaned generated modules.

## Independent review reconciliation

| Review concern | Reconciliation |
| --- | --- |
| `All Guides` cannot be changed under Phase A forbidden paths | Recorded as target-only with `implemented: false`; current labels remain observed baseline. |
| A test-only model would be dead code | The source adapter and contract validation run in `dev`, `check`, `build`, `qa`, Pi QA, and Sites packaging paths. |
| Full metadata is not present in legacy frontmatter | Missing states use explicit provenance such as `legacy-body` or `not-declared`; nothing is fabricated. |
| A route overlay could become another article registry | Real sources are discovered from tracked files; the temporary manifest contains only missing classifications and enforces exact route-set parity. |
| Raw ad-hoc frontmatter parsing would drift | The adapter uses declared `js-yaml`, the parser family used by Astro/Starlight dependencies, and validates normalized invariants. Phase B/C must move canonical fields into content metadata. |
| `.mjs` importing `.ts` would break Node workflows | No direct Node consumer imports TypeScript. A small loader compiles the standalone contract for QA, and a dedicated strict TypeScript project performs a real type check. |
| Strip-only execution would not type-check | `typecheck:contracts` checks `public-taxonomy.ts` with strict types and no ambient package types; full Astro source remains covered by `astro check`. |
| Product taxonomy could weaken TeX security | The legacy TeX input vocabulary remains separate, named, frozen, and fail-closed. |
| Target and legacy topic shapes could be conflated | The current legacy module is untouched; the target taxonomy uses its own types and is not re-exported into current consumers. |
| Topic visibility semantics were ambiguous | Publishable-guide rules and contiguous thresholds are explicit; unknown topics fail. |
| Planned routes could be returned as current | Observed and target resolvers are separate; all target records are unimplemented. |
| Real sources cannot cover edge cases | Real-source parity is tested separately from clearly synthetic draft, preview, thin, redirect, retirement, ordering, and relation edge cases. |
| Generated Salt could be counted twice | Discovery uses tracked sources, so ignored generated outputs cannot become second content records. |
| Equal tracker counts could mask replacement | Tests assert exact source URLs and IDs as sets. |
| A `/guides/` route could hide outside the new constants | Public source paths are scanned for route-bearing `/guides/` declarations. |
| Orphaned generated modules were not detected | Check-only generation and regression tests now cover that failure. |

Cross-model review was offered after the required fresh-context review. The owner chose to reconcile the current review without a second model.

## Validation contract

Required Phase A lanes:

- `npm ci`.
- `npm run check`.
- `npm test`.
- `npm run lint:content` after a build.
- `npm run qa:pi` on the Pi, with Pagefind skipped only for the known ARM64 environment limit.
- Full x64 `npm run qa`, including Pagefind.
- `npm run build:sites`, validating packaging only and not publishing.
- `git diff --check` and scoped status inspection.
- Baseline-versus-candidate artifact comparison for all 144 generated files.

Phase A adds a declared `js-yaml` dependency rather than relying on Astro's transitive installation. The audit result must be reported; dependency remediation is not authorized in this work order because it could change the production stack beyond the contract scope.

## Phase B entry package

After human acceptance, Phase B should start from the exact Phase A completion commit recorded in the canonical work-order report. Its first action must re-run the clean baseline checks and confirm the Phase B work order is no longer blocked.

Phase B may consume:

- `src/config/public-taxonomy.ts` as the sole target taxonomy.
- The validated public-content model and tracked-source adapter as a temporary migration seam.
- The observed-versus-target route contract for regression expectations, without implementing Phase C migrations.
- The Starlight dependency map and ordered removal plan.
- The exact LaTeX seam.
- Tracker, metadata, theme, navigation, search, and Pagefind baseline evidence.

Phase B must leave for Phase C:

- Category/content page rewrites.
- Final topic-page publication decisions.
- Redirect and retirement implementation.
- Feed, sitemap, Pagefind-eligibility, related-content, and generated `llms.txt` migration.

## Known limitations and risks

- Live `www` behavior disagrees with the declared source redirect.
- Current public Starlight menus, manual article cards, hard-coded latest navigation, feed, sitemap, Pagefind, and body-authored related links do not yet consume the target contract.
- Current source notes and related links are not structured in the normalized adapter.
- Two target topics have one publishable guide each; all others have zero. Thin topic pages must not be invented.
- Redirect targets for combined Home Tech topics are threshold-gated and require Phase C resolution before publication.
- Native Pi Pagefind remains unavailable because of the ARM64/16 KiB page-size incompatibility.
- `npm audit` findings remain unresolved and must be recorded with the final validation result.
- A raw repository-wide `tsc` invocation enters platform-dependent Starlight dependency sources on Linux and fails on an existing `RenderResult`/Astro type mismatch. The accepted gates are strict contract-scoped `tsc` plus full `astro check`; neither suppresses project diagnostics.
- The Sites bundle is packaging evidence only; no Sites save or deployment is authorized.

## Rollback

No production state changed. If Phase A is rejected:

1. Revert the Phase A feature-branch commit or delete the feature branch.
2. Leave Pi `main`, GitHub `main`, and the immutable production release unchanged at `99732e1c494e468df92fab22ed71c7da4ead39c5`.
3. Remove the unmerged Pi-local feature branch only after preserving the rejection report if required.
4. Do not purge Cloudflare or change DNS; neither is part of this rollback.

The canonical hub work-order report records the ending and exact completion commit after Git creation, because a commit cannot contain its own final hash.
