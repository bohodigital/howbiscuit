# How Biscuit Handoff 3.1 content-data and tools report

Date: 2026-07-24

Owning repository: `howbiscuit-site`

Source work-order key: `WO-HOWBISCUIT-H3.1-CONTENT-TOOLS-READINESS`

Canonical BP2 key: `WO-2026-07-24-HOWBISCUIT-H31-CONTENT-TOOLS-READINESS`

Broker child: `WO-2026-07-23-PUBLIC-API-BROKER-SAFE-NESTED-FIELDS`

Status: **production accepted — GO**

## Accepted release

- Application commit: `57d414dc6e69951e4b415282aded215201a32414`
- Application tree: `83de2970fda8a5be6a689dd0e638c9a0a23b5e9d`
- Handoff 3.1 implementation commit: `12ca491d46c14e20e0e16936acda2a06ed3de468`
- Broker commit: `a7c2aa43a2f1e5c95fa0172aeef09323544a9aeb`
- Accepted data release: `h31-content-tools-2026-07-24-r2`
- Accepted data digest: `daf8d23dc338b209179a769805f8a6182bbd842e8206cd9d694a0d7428da0b7a`
- Sites packaging commit: `55864242dcee5069bc94f4944d7804850156310d`

The accepted data release is immutable. Promotion and rollback update only the
locked `data/releases/accepted.json` pointer; accepted release directories are
never edited in place.

## Delivered data and tools

- 445 normalized records and 27 Research Packet v2 records.
- 55 HUD ZIP relationships, including four honestly ambiguous weighted ZIP
  mappings.
- 99 EIA observations covering residential electricity, residential natural
  gas, and weekly gasoline.
- 17 verified FoodData Central staple-food identities and 165 complete nutrient
  observations. Each nutrient retains its ID, name, numeric amount, unit, and
  `100 g` basis.
- Four MyMarketNews report definitions and 11 classified market observations,
  preserving wholesale and retail boundaries.
- 33 NASS statistics with final and forecast state preserved.
- 29 exact Kroger product mappings with brand, item size, quantity, evidence,
  reviewer, review expiry, and mapping digest; one governed store; 29 dated
  internal price observations; 23 available, two unavailable, and four unknown
  availability states; and two unresolved candidates. Missing fields never
  become fabricated prices or out-of-stock claims.
- Research Packet v2 approval, validation, evidence, review-date, table, chart,
  citation, source-classification, and disclosure controls.
- Atomic data promotion and rollback with locks, digest validation, and rename.
- Transactional D1 projection for all 15 Handoff 3 tables, with draft-first and
  published-last release markers, post-write count/digest checks, and an
  injected late-failure rollback proof.
- Package-driven tool compilation with runtime/JSON Schema parity checks.
- Five static-first public tools:
  - Agricultural Market Context Browser
  - Household Energy Benchmark Explorer
  - U.S. Crop Production Trend Explorer
  - USDA Staple Food Identity Explorer
  - ZIP-to-Metro Relationship Explainer
- One private, CLI-only Kroger research workflow. It has no public route and
  cannot write canonical records.
- Plan-only EIA and MyMarketNews schedules. They generate bounded plans only;
  they do not call providers or promote releases.
- Operator runbooks for releases, D1 projection, rollback, research packets,
  tools, schedules, and private Kroger research.

## Provider disposition

| Provider | Release use | Credential/auth evidence | Static public output | Runtime state | Refresh state | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| HUD | ZIP-to-metro relationships | Accepted release provenance; no browser credential | Enabled | Disabled | Operator-reviewed/manual | GO |
| EIA | Energy benchmarks | Accepted release provenance | Enabled | Disabled | Plan-only timer installed | GO |
| FoodData Central | Food identities and nutrients | Bounded broker live probe passed | Enabled | Broker available; public page remains static | Operator-reviewed/manual | GO |
| MyMarketNews | Market context | Accepted release provenance | Enabled | Disabled | Plan-only timer installed | GO |
| NASS | Crop production trends | Accepted release provenance | Enabled | Disabled | Operator-reviewed/manual | GO |
| Kroger | Exact product research, internal observations | Bounded broker live probes passed | Public live price/availability disabled | Private CLI/broker only | Manual/on-demand | GO internal; NO-GO public live pricing |
| Best Buy | None | Not in scope | Disabled | Disabled | None | Excluded |

The installed plan-only timers are active on Bohopi:

- `howbiscuit-data-plan-mymarketnews.timer`: Mondays at 02:00 CDT
- `howbiscuit-data-plan-eia.timer`: Saturdays at 01:30 CDT

## Verification evidence

Local acceptance:

- `npm run qa`: 180 passed, 0 failed.
- Astro diagnostics: 158 files, 0 errors.
- Static build: 34 HTML routes.
- Pagefind: 21 eligible routes and 21 indexed fragments.
- Browser QA at 320 px and 390 px covered representative pages and all five
  tools: no horizontal overflow, dead links, undersized controls, unlabeled
  links, browser errors, or active provider calls.
- JavaScript-disabled QA retained every tool's evidence table.
- Keyboard and filter QA passed for all five tools.
- Credential-pattern and built-artifact provider-load scans found no matches.

Bohopi acceptance:

- Exact-commit `npm run qa:pi` at `57d414d`: 180 passed, 0 failed.
- Astro diagnostics: 158 files, 0 errors.
- Static build: 34 routes; lint passed.
- D1 check projected all 15 tables and proved rollback.
- Broker focused provider suite: 11 passed, 0 failed.
- Broker full suite: 246 of 247 passed. The sole skill-count failure reproduced
  unchanged on the previous canonical `main`; the live skill directory has four
  entries while that unrelated test expects three.
- The legacy connector validator timed out identically on the previous
  canonical `main`.
- Production `local1-tunnel.service` restarted on broker commit `a7c2aa4`,
  remained healthy with zero restarts, and passed bounded live FoodData and
  Kroger probes.

Browser QA found and corrected two release defects before acceptance:

1. The no-JavaScript mobile navigation disclosure was only 18 px high; it now
   has a 44 px minimum target.
2. Unknown Sites routes returned an empty platform 404; the final worker now
   returns the governed custom 404 body while preserving status 404.

## Sites release

- Project: `appgprj_6a51d139d8648191a58b542729b7d2c5`
- Access: owner-only custom access; one allowed user, no groups
- Version: `appgprj_6a51d139d8648191a58b542729b7d2c5~appgver_ce7c5ed6f0548191a149d13f12dde2bb`
- Deployment: `appgdep_6a62fa7d10c08191b4dea5dd7df76772`
- URL: `https://howbiscuit-field-guide.mankopoppi.chatgpt.site`
- Package source: `55864242dcee5069bc94f4944d7804850156310d`
- Package digest: `sha256:6d31576c4c5c0833655952924a63bb730e3fea3de55955991d99b8ec991c5831`
- Package inventory: 151 files, 7,976,960 bytes

Authenticated live checks passed for the home page, tools index, all five
tools, sitemap, `llms.txt`, and governed custom 404. Unauthenticated access
correctly returns the owner-only sign-in wall. The prior known rollback version
is:

`appgprj_6a51d139d8648191a58b542729b7d2c5~appgver_0f0dcbdcbeb48191b7ffb31fc49af546`

## Cloudflare production release

- Deployment: `208a02b6-7b4d-4784-99e2-510daa8c5483`
- Immutable URL: `https://208a02b6.howbiscuit.pages.dev`
- Production: `https://howbiscuit.com`
- Artifact source: `57d414dc6e69951e4b415282aded215201a32414`
- Artifact digest: `112acc13063835fb18ed6f5395457489fafa7138c6e99e4ee23f5e2b86b0b01f`
- Inventory digest: `591b19f9b0b5ee7aba4a5ad2df42f10ad0208cf7422818247a8bdb53fe4d7e4c`
- Uploaded inventory: 149 files

The canonical digest-pinned secret-broker wrapper verified the clean Bohopi
checkout, GitHub `main`, expected commit, archive digest, safe archive shape,
complete inventory, and embedded release marker before deployment. It did not
expose or copy the Cloudflare credential.

Live acceptance passed on the immutable URL first and then the apex:

- Home, five categories/indexes, tools index, all five tools, article index,
  three articles, 12 metro pages, and six trust pages returned expected HTML.
- Feed, sitemap, robots, `llms.txt`, release marker, and Pagefind runtime assets
  returned their expected content types.
- The embedded production marker identifies repository
  `bohodigital/howbiscuit` and commit `57d414d`.
- Unknown routes return status 404 with the custom “Page not found” body.
- Metro pages retain `noindex`.
- Seven representative legacy routes return the governed 301 destinations.
- `www.howbiscuit.com` returns 301 to the apex.
- Security headers include `X-Content-Type-Options`, `Referrer-Policy`, and
  `Permissions-Policy`.
- A live scan of all 21 sitemap URLs found zero active HUD, EIA, FoodData,
  Kroger, MyMarketNews, or NASS provider loads. Provider URLs appear only as
  evidence/citation links.

Rollback is preserved in Cloudflare deployment
`0452d715-5a4d-424b-ae2b-1650bd06223a`
(`https://0452d715.howbiscuit.pages.dev`), with older deployment
`4331e1f9-bd9a-4f82-aa60-1143dc5c811c` retained behind it.

## D1 boundary

The tracked Sites manifest names the pre-existing binding `DB`. This Handoff
3.1 public release is static and does not read or write that remote binding.
The accepted-release projection was validated locally and on Bohopi; it must
not be substituted into a remote D1 database without a separate reviewed data
migration and deployment.

## Final decisions

- Overall Handoff 3.1: **GO**
- Content publishing: **GO**
- Five public static tools: **GO**
- HUD static relationships: **GO**; HUD runtime calls: **disabled**
- EIA static evidence: **GO**
- FoodData identities/nutrients: **GO**
- MyMarketNews context: **GO**
- NASS trends: **GO**
- Kroger private/internal workflow: **GO**
- Kroger public live pricing and availability: **NO-GO; disabled**
- Best Buy: **excluded**
- Sites owner-only deployment: **GO**
- Cloudflare public production deployment: **GO**

The application release is production accepted. The documentation commit that
contains this post-deployment evidence is intentionally later than the deployed
application commit; exact deployment evidence is therefore also retained in
the Bohopi operational audit rather than made self-referential.
