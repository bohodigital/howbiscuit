# How Biscuit Handoff 1: Phase B Custom Astro Shell

Date: 2026-07-18

Work order: `WO-2026-07-17-HOWBISCUIT-HANDOFF1-CUSTOM-ASTRO-SHELL-002`

Accepted parent: `3856af487d7869c31600400de6cd78fbcbf7ad30`

Working branch: `feature/howbiscuit-h1-b-custom-astro-shell`

Implementation commit: `948237bc70810c0c16bea2583d0575739a95d110`

Documentation candidate transferred to Pi: `433c8a23b0f34b31fb5c6c16ca62ab839d991240`

Blocking-review reconciliation candidate validated on Pi: `d3bcea21a983e4fb4fbe9dd731f2d55b6583446c`

## Phase boundary and status

Phase B replaces Starlight's public rendering and shell responsibilities with a custom Astro implementation. This document describes an implementation candidate; it is not by itself an acceptance decision or production release.

- The accepted Phase A taxonomy, route, normalized-content, analytics, and LaTeX contracts remain authoritative.
- No target Phase C category, topic, or redirect route is activated.
- No merge to `main`, production deployment, Sites publication, DNS change, cache purge, analytics-property change, secret access, or external-account change is authorized by this phase.
- Phase C remains blocked until fresh-context implementation reviews pass and the Phase B completion commit receives owner acceptance through the canonical work-order lane.

## Implemented architecture

### Custom routing and layouts

The public site now uses the custom catch-all renderer at `src/pages/[...slug].astro` and the seven required layouts:

- `BaseLayout.astro`
- `HomeLayout.astro`
- `CategoryLayout.astro`
- `ArticleLayout.astro`
- `ShoppingLayout.astro`
- `ToolLayout.astro`
- `TrustLayout.astro`

The catch-all derives routes from the `docs` content collection and verifies every Phase A observed `serve` route still has a source. It intentionally does not consume `TARGET_ROUTE_CONTRACTS`; target route activation belongs to Phase C. `/articles/` remains the observed All Guides route and lists only normalized records with `searchEligible: true`.

`src/pages/404.astro` provides an explicit custom recovery page. It returns the static-host 404 artifact, declares `noindex, nofollow`, is excluded from Pagefind, and does not emit analytics.

### Base document ownership

`BaseLayout.astro` owns:

- The HTML document and English language declaration.
- System/light/dark theme bootstrap before paint.
- Title, description, canonical, robots, Open Graph, Twitter, `og.png`, and JSON-LD metadata.
- RSS and sitemap discovery.
- Skip link, header, main landmark, footer, and global styles.
- One Umami loader using the accepted site identity.
- One GA4 loader and one configuration using the accepted property.
- Central Pagefind body/exclusion attributes.

Stored theme values are allowlisted to `system`, `light`, or `dark`. Invalid or unavailable storage falls back to a readable system preference, while the no-JavaScript default remains readable light mode.

Light mode uses a separate `#b43a22` tomato foreground token for text on the paper background, preserving the brighter tomato token for decoration. Panic-strip hover links switch to fixed dark ink against the decorative tomato background. The measured contrast is greater than 4.5:1 for both text treatments in light and dark themes.

### Navigation and modal state

Desktop order is:

```text
How Biscuit
Home Tech
Home & Apartment
Kitchen
Shop Smarter
Tools
All Guides
Search
Theme
```

Target category routes are still unimplemented, so category names are disclosure controls rather than dead anchors. Topic labels are derived from normalized publishable-guide counts and the accepted Phase A threshold. Menus show at most two real eligible guides and no filler.

One reducer coordinates mobile navigation and search. It enforces mutual exclusion, one scroll-lock owner, deterministic Escape/outside/button/result closing, and focus return. When the viewport crosses back to desktop, an open mobile navigation dialog closes without attempting to focus its now-hidden trigger.

The mobile trigger is in the normal top header. The dialog contains all five categories and All Guides, supports nested categories, stays within the viewport, and has no horizontal overflow at 320 CSS pixels or the 640-CSS-pixel reflow equivalent of a 1280-pixel viewport at 200 percent zoom.

When JavaScript is unavailable, the scripted mobile controls remain hidden and a native disclosure exposes all five category labels, every real published guide link, and All Guides. The article DOM and visual order both keep content before the table of contents.

### Search

The Starlight search UI is replaced by a framework-free Pagefind dialog. It provides:

- A programmatic input label and focused input on open.
- Result title, description or snippet, route, category, and article type.
- Empty, loading, and error states.
- Keyboard closing and deterministic focus return.
- Index-time exclusion for draft, preview, thin, redirected, retired, recovery, and other ineligible surfaces.

The full x64 build invokes Pagefind directly. It compares both the source set and all 26 HTML artifacts including 404 against a frozen, explicit list of the 25 Phase A document routes; preserving only the count cannot hide a removed current route or an early Phase C route. It separately asserts that all Phase C-only document routes remain absent and requires the real Pagefind fragment URL set to equal the eligible HTML route set. The five known thin legacy routes (`/glossary/`, `/home-tech/gaming-pcs/`, `/home-tech/laptops/`, `/home-tech/streaming-tvs/`, and `/science/`) remain served until Phase C but are explicitly excluded from Pagefind. A generic environment flag cannot disable Pagefind in `build`, `qa`, or `build:sites`.

The same artifact verifier checks per-page canonical, robots, Open Graph, Twitter, JSON-LD, H1, Umami, and GA4 contracts. After `prepare-sites-build.mjs`, it also checks the full Pagefind client artifact, worker asset delegation, Wrangler asset/404 rules, and tracked Sites metadata without saving or publishing a Sites version.

### Reusable component families

The shell provides typed component families for:

- Article cards (`GuideCard`).
- Category cards (`PathCard` and `DivisionCard`).
- Topic filters.
- Product cards and shelves.
- Evidence and testing badges.
- Price-status badges.
- Source notes.
- Related guides.
- Breadcrumbs.
- Article metadata.
- Disclosure banners.
- Search result cards.
- Empty states.

Product components use a strict discriminated union and runtime fail-closed checks. Observed and stale prices require price, observation date, and source; estimates require price and source; unavailable products reject implied price observations. The components do not create product or offer records, and empty shelves render an honest no-verified-products state.

## Normalized content and LaTeX seam

The three accepted article classifications now live in their canonical MDX or LaTeX sources rather than a separate migration manifest. The normalized registry derives those classifications from source and remains the sole article registry used by navigation and article surfaces.

The LaTeX source now declares canonical category, topic, article type, editorial classification, and priority through allowlisted metadata commands. The old division value remains a validated compatibility field only; it is not independent taxonomy authority.

The compiler still preserves:

- Canonical `.tex` source ownership.
- Static KaTeX HTML and MathML.
- Outline, sources, related links, and specialized paper body.
- Package, command, protocol, macro, file-inclusion, and shell-escape restrictions.
- Deterministic generation and stale/orphan checks.
- Success and rejection tests.

Generated registration now renders through the custom catch-all and `ArticleLayout`. The layout suppresses its shell H1 for LaTeX records so the compiler-generated paper title is the only H1 and the Pagefind title.

## Starlight removal

The public runtime no longer contains:

- `@astrojs/starlight` as a package or integration.
- Starlight content loaders or schemas.
- Starlight route locals.
- Starlight header, footer, sidebar, search, theme, title, or menu components.
- Starlight custom elements, selectors, or CSS variables.

Historical Phase A contract comments remain in `public-taxonomy.ts` because they describe the observed parent state; they are not runtime dependencies.

## Architecture review reconciliation

The pre-implementation fresh-context architecture reviews were reconciled before RED tests. The candidate incorporates their valid findings:

- No premature target-route activation.
- Explicit 404 behavior.
- Observed-route parity.
- Central topic-threshold behavior.
- Direct exact build dependencies.
- Index-time Pagefind exclusion and full-build wiring.
- One shared modal coordinator and viewport cleanup.
- A fail-closed Pi-only Pagefind exception.

Fresh-context Codex architecture, frontend/accessibility, and test-evidence reviews of the first completed candidate all returned `BLOCK` and were treated as binding. Their material findings were reconciled as follows:

- Five known thin legacy routes are served but excluded from the real Pagefind index.
- Build and test lanes now verify exact artifact routes, Pagefind fragment routes, metadata, tracker counts, H1 counts, 404 behavior, and the complete non-published Sites package.
- Light-theme tomato text now uses a WCAG-AA foreground token while decorative tomato remains unchanged.
- Product price states now require their evidence fields through both types and runtime validation.
- Mobile article content and table-of-contents visual order now match DOM reading order.
- Mobile navigation has a native no-JavaScript fallback.
- Article dates label the published-date fallback as `Published` rather than `Updated`.
- Rollback instructions cover the complete multi-commit Phase B range rather than implying that reverting only the tip is sufficient.
- The accepted route boundary is an explicit 25-route contract shared by rendering, build verification, and tests; the three previously omitted observed Home Tech topics are now represented, and Phase C-only routes are asserted absent.
- Panic-strip hover links use a WCAG-AA dark foreground on the tomato background in both themes.

Fresh-context OpenAI/Codex re-reviews of the exact reconciled completion candidate remain blocking before acceptance.

## Validation evidence

### Windows x64

- LaTeX compilation: passed for one canonical article.
- Contract-scoped TypeScript: passed.
- Astro diagnostics: 73 files, 0 errors, 0 warnings, 0 hints.
- Node tests: 44 passed, 0 failed.
- Content lint: passed for 25 MDX sources and 33 built files.
- Static build: 26 pages.
- Pagefind: 20 eligible pages, 20 indexed fragments, 1,300 words, 2 filters; all five known thin routes were absent from the fragment route set.
- Artifact contracts: exact 26-route HTML set, one H1 and required metadata per page, exact tracker counts, and 404 exclusions passed.
- Sites package: 26 client HTML routes, 20 eligible routes, 20 Pagefind fragments, worker/asset/404 configuration, and hosting-metadata parity passed without publication.
- Built homepage: one Umami loader, one GA4 loader, and one GA4 configuration.
- Built 404: zero analytics loaders, `noindex, nofollow`, and Pagefind ignored.
- HTTP preview: home, representative article, Pagefind JavaScript, RSS, and sitemap index returned 200; an unknown route returned 404.

### Browser behavior

- Desktop navigation showed the exact five categories, All Guides, Search, and Theme in the required order.
- Only real eligible guide links appeared; target category and topic routes remained unlinked.
- Mouse/touch-style activation, one-menu-at-a-time behavior, outside close, Escape close, and focus return passed.
- Search returned two classified results for `freezing point` and a true empty state for `qzxvjkplmwnrty`.
- System/light/dark preference, accessible labels, persistence, and system restoration passed.
- The corrected light tomato text rendered as `#b43a22`; the dark token rendered as `#ff7759`.
- Mobile navigation and search dialogs fit within 320 pixels, locked body scrolling, closed with Escape, and returned focus.
- The 640-CSS-pixel reflow check had no overflow and represents a 1280-pixel viewport at 200 percent zoom.
- Reconciled article markup rendered content before the table of contents, with the table of contents at computed `grid-row: auto`.
- The standard article and LaTeX article each rendered one H1, exact canonicals, no permanent documentation sidebar, and no horizontal overflow.
- The LaTeX article rendered 14 MathML nodes.

### Raspberry Pi

The reconciliation candidate `d3bcea21a983e4fb4fbe9dd731f2d55b6583446c` was transferred through `/srv/local1/git/howbiscuit-site.git` and fast-forwarded into the clean worktree at `/srv/local1/worktrees/howbiscuit-h1-b-custom-astro-shell`. `main` remained at `99732e1c494e468df92fab22ed71c7da4ead39c5`.

Pi validation passed:

- Platform proof: Linux ARM64 with a 16,384-byte page size.
- Runtime: Node `v24.18.0`, npm `11.16.0`.
- `npm ci`: passed; the same six audit findings were reported.
- `npm run qa:pi`: passed.
- Astro diagnostics: 73 files, 0 errors, 0 warnings, 0 hints.
- Static build: 26 pages.
- Node tests: 44 passed, 0 failed.
- Content lint: 25 MDX sources and 32 Pi-built files.
- Artifact contracts: exact 26-route HTML set and 20 Pagefind-eligible routes passed; all five known thin routes were excluded.
- Native Pagefind execution: skipped only after the platform guard passed; `dist/pagefind/pagefind.js` was absent as required for the validation-only Pi artifact.
- Loopback preview: home 200, representative LaTeX article 200, unknown route 404.
- Preview cleanup: npm left its child preview process bound after the wrapper exited; the task-owned listener on port 4324 was stopped explicitly and the port was verified clear.
- Git worktree: clean at the transferred candidate.

The Pi artifact remains validation-only and must never be promoted as a release artifact. A release artifact still requires the full x64 Pagefind build.

## Known limitations and deferred work

- Phase C owns category/topic route activation, route migrations, target redirects, generated discovery migrations, related-content migration, and public content-surface conversion.
- The five known thin legacy routes remain served and search-engine indexable under the accepted observed-route contract, but are excluded from Pagefind until Phase C replaces or retires them.
- The current custom RSS and sitemap behavior remains the accepted Phase A observed behavior until Phase C; target discovery semantics are not claimed.
- Native Pagefind remains unavailable on the Pi's ARM64/16 KiB environment. Full x64 Pagefind output remains mandatory for every release artifact.
- `npm ci` reports six dependency audit findings: one low, four moderate, and one high. No automatic or forced dependency rewrite was applied in this phase.
- Production has not been changed or published.

## Rollback

Before merge, restoring the accepted parent requires removing or reverting the entire Phase B range `3856af487d7869c31600400de6cd78fbcbf7ad30..candidate` newest-to-oldest; reverting only the tip is insufficient. If the Phase B range is later squash-merged, revert that squash commit instead. Then run `npm ci`, the accepted x64 QA lane, and rebuild the prior Starlight artifact. Production rollback remains a separate owner-approved release action.

## Acceptance gate

The exact completion commit, Pi evidence, fresh-context review decisions, limitations, and recommended next action belong in the canonical work-order report:

`ops/intake/work-orders/reports/WO-2026-07-17-HOWBISCUIT-HANDOFF1-CUSTOM-ASTRO-SHELL-002.md`

Phase C must not start until that report records a passing candidate and the owner accepts Phase B.
