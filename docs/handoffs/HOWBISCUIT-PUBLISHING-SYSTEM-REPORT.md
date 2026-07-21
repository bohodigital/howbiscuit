# How Biscuit publishing system report

## Baseline and packet lineage

Handoff 2 began from completed Handoff 1 commit `8382c6e90ae7c3a489eafec5a23abf34f510aa74`.

| Packet | Commit | Result |
| --- | --- | --- |
| 2A compiler | `035e45d91a8fceb6ea92b8b559ea34f53532974b` | Deterministic article-package compiler and governed normalized output |
| 2B editorial | `31fade3e9188f01f52dfdd414e62ca2dfaf3e11c` | Ideas, briefs, sources, testing, media rights, approvals, and three migrated articles |
| 2C products | `38d3cde96314bba6bedf84cd192fb735512b61c8` | Canonical static product/group/destination/price/recommendation system |
| 2D release | Commit containing this report | Secure ingest, rejection suite, current docs/templates, and release QA |

Git cannot place a commit's own future SHA inside that commit without changing it. Bohopi request `CR-2026-07-17-HOWBISCUIT-HANDOFF2-PUBLISHING-SYSTEM-001` records the resolved 2D commit, final main commit/tree, deployment ID, production URL, rollback deployment, and live-verification evidence after each value exists.

## Architecture and sources of truth

| Concern | Canonical source | Generated consumer |
| --- | --- | --- |
| Taxonomy and route thresholds | `src/config/public-taxonomy.ts` | Registry, navigation, build contracts |
| Article prose and metadata | `content/articles/<slug>/` and governed LaTeX source | Normalized JSON and compiler-owned MDX |
| Editorial governance | `content/ideas`, `briefs`, `sources`, `testing`, `media-rights`, `link-previews`, `approvals` | Publication digest and public evidence fields |
| Products and shopping | `content/products`, `product-groups`, `merchant-destinations`, `price-claims`, `recommendation-claims` | Static product catalog and article directives |
| Public documents | One normalized public registry | Homepage, categories, All Guides, related guides, RSS, sitemap, `llms.txt`, Pagefind, JSON-LD |
| Release truth | Git main, Cloudflare Pages deployment, production marker, Bohopi request | Rollback and next-handoff baseline |

Writers edit canonical YAML, Markdown, LaTeX in its bounded adapter, and rights-approved media. Generated JSON, schemas, MDX, Pagefind artifacts, and deployment packages are not hand-edited.

## Package, governance, and migrations

An article package contains `manifest.yaml`, `article.md`, and optional approved raster media. The compiler rejects executable markup, unsafe links/media, unresolved references, duplicate identity/routes, invalid taxonomy/workflow, false evidence or commerce claims, missing rights, stale approvals, and stale output. Approval digests bind package files and all approval-relevant governance records.

The baking-powder guide and categoryless editorial standard are canonical Markdown packages. The salt-and-ice guide remains in the narrow governed LaTeX adapter. All three compile into one normalized schema and retain their exact canonical routes.

Secure directory ingestion inspects before mutation, stages on the canonical filesystem, compiles and resolves the candidate without changing canonical content, rejects accidental overwrite, and renames only a validated non-published package. Existing articles require `--update`, unchanged identity/route, `approvalId: null`, and a new approval before publication. Ingestion generates and publishes nothing.

## Product state

The product system enforces exact variant identity, identifier integrity, provenance/testing agreement, evidence-bound groups and rankings, static dated price claims, and exact unpaid merchant destinations without query strings or fragments. Production catalogs intentionally contain zero records until verified real products exist; no placeholder or fake shopping data was published.

## Commands and QA

The supported commands are `idea:score`, `article:validate`, `article:compile`, `article:ingest`, `product:validate`, `publishing:qa`, `check`, `test`, `lint:content`, `qa`, `qa:pi`, and `build:sites`. Their mutation/platform behavior is recorded in `docs/publishing/COMMANDS-AND-QA.md`.

Packet QA includes schema/runtime parity, deterministic semantic compilation, workflow and approval invalidation, source/testing/media/product resolution, the full rejection matrix, atomic ingest and stale-approval rejection, contract/type/Astro checks, static routes, Pagefind policy, content lint, accessibility guards, analytics host guards, Worker redirects/headers, and Pi ARM64 validation. Exact final counts and x64/browser/live results are appended to the canonical Bohopi request after the immutable final artifacts exist.

## Release, limitations, and rollback

The release lane fast-forwards the accepted integration branch to `main`, builds from exact main, deploys the existing Cloudflare Pages production project, and verifies the public marker equals Git. Live verification covers every canonical route, redirects, search, discovery files, related guides, LaTeX/MathML, analytics cardinality/host guards, 404 metadata, mobile navigation/focus, console, and overflow. The exact deployment evidence is intentionally external to this commit to avoid self-referential release hashes.

Known nonblocking limitation: the pinned dependency audit is platform-dependent and currently reports seven noncritical findings on Pi (one low and six moderate) and ten on Windows x64 (three low and seven moderate); Handoff 2 added no dependency and did not force a breaking audit rewrite. Pagefind native execution requires the x64 lane; Pi QA verifies the guarded ARM64/16 KiB skip and all remaining build/test contracts.

Rollback uses the recorded prior Cloudflare Pages production deployment. Source rollback uses a normal `git revert` of the bounded Handoff 2 range or the final fast-forward range; never force-push. Ingestion failures preserve the old canonical package and remove staging state.

Handoff 3 begins only from the exact final main commit recorded in Bohopi and the live production marker. Handoff 3 owns live offers, retailer adapters, live prices/availability, geography, ZIP/ZCTA/CBSA behavior, fuel prices, affiliate activation, click analytics, D1, R2, Queues, quotas, and kill switches. No Handoff 3 implementation is included here.
