# How Biscuit Handoff 3.1 content-data and tools report

Date: 2026-07-24

Owning repository: `howbiscuit-site`

Accepted data release: `h31-content-tools-2026-07-24-r2`

Accepted data release digest: `daf8d23dc338b209179a769805f8a6182bbd842e8206cd9d694a0d7428da0b7a`

## Candidate status

Handoff 3.1 is implemented and release-ready. The broker child is deployed on
Bohopi at `a7c2aa43a2f1e5c95fa0172aeef09323544a9aeb`; its bounded live FoodData
and Kroger probes pass. The final How Biscuit commit, second Pi QA, Sites
version, deployment, and live acceptance are recorded after they exist.

The accepted local release is immutable. Promotion and rollback update only the locked
`data/releases/accepted.json` pointer; accepted release directories are never edited in place.

## Delivered

- Eight broker-backed source policies across six provider families, with Best Buy explicitly
  excluded.
- One immutable accepted release with 445 normalized records and 27 Research Packet v2 records.
- Atomic release promotion and rollback with lock acquisition, digest validation, and rename.
- Parameterized D1 projection for all 15 Handoff 3 tables in one transaction, with a draft release
  marker written first, a published marker written last, post-write count and digest verification,
  and an injected late-failure rollback test.
- 55 HUD ZIP relationships, including four honestly ambiguous weighted ZIP mappings.
- 99 EIA observations across monthly residential electricity, monthly residential natural gas,
  and weekly gasoline sources.
- 17 verified FoodData Central staple-food identities and 165 complete nutrient
  observations with nutrient ID, name, numeric amount, unit, and `100 g` basis.
  The collection includes baking staples, pantry staples, dairy, fruit, and
  vegetables.
- Four MyMarketNews report definitions and 11 classified market observations, preserving
  wholesale and retail boundaries.
- 33 NASS statistics with final and forecast status preserved.
- 29 exact Kroger product mappings with refreshed brand, exact item size,
  quantity, evidence, reviewer, review expiry, and mapping digest fields; one
  governed store; 29 dated internal price observations; 23 explicit available,
  two explicit unavailable, and four unknown states; and two unresolved
  candidates. Missing broker fields never become out-of-stock or fabricated
  price records. Public live comparison remains disabled.
- Research Packet v2 governance with approved/current/validated state, evidence-bound claims,
  tables, charts, citations, review dates, source classifications, and disclosure fields.
- Static article directives for research summaries, tables, charts, and source notes.
- A package-driven tool compiler with runtime and JSON Schema parity checks.
- Five static-first public tools:
  - Agricultural Market Context Browser
  - Household Energy Benchmark Explorer
  - U.S. Crop Production Trend Explorer
  - USDA Staple Food Identity Explorer
  - ZIP-to-Metro Relationship Explainer
- One private, CLI-only Kroger research workflow. It has no public route and cannot write canonical
  records.
- Plan-only refresh schedules for EIA and MyMarketNews. They do not call providers or
  auto-promote releases. Installation and enablement state is recorded during
  the production release.
- Operator runbooks for data releases, D1 projection, rollback, research packets, tools, schedules,
  and the private Kroger workflow.

## Local verification evidence

- `npm run data:check`
- `npm run data:d1-sync -- --check`
- `npm run research:validate`
- `npm run tool:compile`
- `npm run tool:qa`
- `npm run contracts:check`
- `npm run offers:migration-check`
- `npm run offers:catalog-sync -- --check --commit HEAD`
- `npm run publishing:qa`
- `npm run qa`: 180 tests passed; 0 failed
- `npm run build:sites`: 34 HTML routes, 21 Pagefind-eligible routes, 21 indexed fragments
- Browser QA at 320 px and 390 px across representative pages and all five tools:
  no horizontal overflow, no undersized controls, no unlabeled links, no browser errors, and no
  provider calls
- JavaScript-disabled QA: every tool retained its static evidence table
- Keyboard and filter QA: every tool select accepted a bounded alternative and focus advanced to a
  button
- Credential-pattern scan and built-artifact provider-host scan: no matches

Browser QA found and corrected one shared-shell defect before acceptance: the no-JavaScript mobile
navigation disclosure was only 18 px high. It now has a 44 px minimum target.

## Broker deployment and honest limitations

Child work order `WO-2026-07-23-PUBLIC-API-BROKER-SAFE-NESTED-FIELDS` adds narrowly allowlisted
FoodData nutrient and Kroger item fields in `local1-mcp-server`. Its focused
provider suite passes 11 tests locally and on Bohopi. The Pi full suite passed
246 of 247 tests; the lone agent-skill-count failure reproduced unchanged on
the previous canonical `main` because the live skill directory contains four
entries while that unrelated test expects three. The legacy connector validator
also timed out identically on the previous `main`. Compilation, the focused
suite, service health, bounded live provider probes, warning logs, and restart
stability all pass after deployment.

Kroger observations remain single-location, dated, and internal-only. No public
live Kroger price surface is enabled. The Sites project has no reviewed D1
binding, so D1 projection is verified locally and on the Pi but is not attached
to the public static runtime.

## Production acceptance still required

1. Commit and push the exact How Biscuit release candidate.
2. Run `npm run qa:pi` on that exact final commit.
3. Build the fresh x64 Pagefind and Sites package from the exact final commit.
4. Save a Sites version for project `appgprj_6a51d1398648191a58b542729b7d2c5`.
5. Deploy that saved version, then run route, metadata, no-provider-load, and rollback smoke tests
   against production.

Production acceptance must record the exact broker commit, How Biscuit commit, accepted data
release digest, Sites version, deployment URL, Pi QA result, and smoke-test result.
