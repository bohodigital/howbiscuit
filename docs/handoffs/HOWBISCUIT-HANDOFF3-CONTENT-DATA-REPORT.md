# How Biscuit Handoff 3.1 content-data and tools report

Date: 2026-07-24

Owning repository: `howbiscuit-site`

Candidate release: `h31-content-tools-2026-07-24`

Candidate release digest: `247e73890d3581ed0273dfc95fe03993008ddd3b625d6a038b090cae6ff69576`

## Candidate status

Handoff 3.1 is implemented and locally release-ready. It is not yet production-accepted: the
canonical Pi push, broker rollout, Pi QA, source refresh against the upgraded broker, Sites
version save, and production deployment require an explicitly authorized external-action window.

The accepted local release is immutable. Promotion and rollback update only the locked
`data/releases/accepted.json` pointer; accepted release directories are never edited in place.

## Delivered

- Eight broker-backed source policies across six provider families, with Best Buy explicitly
  excluded.
- One immutable accepted release with 278 normalized records and 27 Research Packet v2 records.
- Atomic release promotion and rollback with lock acquisition, digest validation, and rename.
- Parameterized D1 projection for all 15 Handoff 3 tables in one transaction, with a draft release
  marker written first, a published marker written last, post-write count and digest verification,
  and an injected late-failure rollback test.
- 55 HUD ZIP relationships, including four honestly ambiguous weighted ZIP mappings.
- 99 EIA observations across monthly residential electricity, monthly residential natural gas,
  and weekly gasoline sources.
- 15 verified FoodData Central staple-food identities. Nutrient observations remain at zero until
  the production broker exposes its new narrowly allowlisted nutrient fields.
- Four MyMarketNews report definitions and 11 classified market observations, preserving
  wholesale and retail boundaries.
- 33 NASS statistics with final and forecast status preserved.
- 29 exact Kroger product mappings, one governed store, 29 internal observations with
  `availability: unknown`, and two unresolved candidates. Missing broker fields never become
  out-of-stock or fabricated price records.
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
  auto-promote releases.
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
- `npm run qa`: 179 tests passed; 0 failed
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

## External dependency and honest limitations

Child work order `WO-2026-07-23-PUBLIC-API-BROKER-SAFE-NESTED-FIELDS` adds narrowly allowlisted
FoodData nutrient and Kroger item fields in `local1-mcp-server`. Its focused provider test suite
passes 11 tests locally. Its full Mac suite is not a valid acceptance signal because 44 unrelated
tests hit the repository's existing macOS `/var` versus `/private/var` path-hardening difference;
195 tests passed and 8 were skipped before those baseline failures were reported.

Until that child patch is pushed, verified on Bohopi, and deployed:

- FoodData nutrient coverage must remain zero.
- Kroger price and fulfillment coverage must remain unknown.
- No public live Kroger price surface may be enabled.

These are fail-closed limitations, not reasons to weaken identity, freshness, or evidence rules.

## Production acceptance still required

1. Push the broker child branch to the canonical Pi repository.
2. Run the broker's full Pi suite, review the patch, deploy it, and verify its bounded responses.
3. Refresh only the affected FoodData and Kroger source envelopes, validate a new immutable
   release, and promote it if the evidence is complete.
4. Commit and push the How Biscuit candidate to the canonical Pi repository.
5. Run `npm run qa:pi` and verify the Pi artifact against the candidate.
6. Push the exact accepted source state used for hosting.
7. Save a Sites version for project `appgprj_6a51d139d8648191a58b542729b7d2c5`.
8. Deploy that saved version, then run route, metadata, no-provider-load, and rollback smoke tests
   against production.

Production acceptance must record the exact broker commit, How Biscuit commit, accepted data
release digest, Sites version, deployment URL, Pi QA result, and smoke-test result.
