# Content-data release operator runbook

How Biscuit treats `data/releases/<release-id>/` as canonical, immutable build input. `data/releases/accepted.json` is the single atomic pointer used by the compiler. D1 is a projection of that accepted release, never the authoring database.

## Safe provider workflow

Repository code does not call external providers. Generate bounded broker plans with:

```sh
npm run data:plan
npm run data:refresh -- --provider eia
npm run data:refresh:all
```

Execute a plan only through the Local1 public-data broker. Save the broker's
sanitized result array outside Git, flatten only the provider-specific
allowlisted fields into the strict envelope, then validate it into isolated
staging:

```sh
npm run data:broker-envelope -- --provider fooddata --input /safe/path/results.json --output /safe/path/envelope.json
npm run data:import -- --provider fooddata --envelope /safe/path/envelope.json --release h31-YYYY-MM-DD-sequence
npm run data:finalize -- --release h31-YYYY-MM-DD-sequence
```

The envelope builder understands only the governed FoodData and Kroger response
shapes. The importer rejects unknown fields, nesting after flattening,
credentials, private customer data, missing attribution, malformed dates,
invalid digests, and more than 2,000 records. Import writes only to isolated
staging. Finalization clones the accepted release into a temporary build,
normalizes the staged sources, regenerates source and dataset manifests,
Research Packet release references, machine and Markdown diffs, validates the
complete candidate, and atomically renames it to its immutable release ID. None
of these steps changes the accepted pointer.

## Validate, compare, promote, and roll back

```sh
npm run data:check
npm run data:diff -- --from <accepted> --to <candidate>
npm run data:promote -- --release <candidate>
npm run data:compile
npm run data:d1-sync -- --release <candidate> --database /safe/runtime/content.db
npm run data:d1-verify -- --release <candidate> --database /safe/runtime/content.db
```

Review both `diff.json` and `diff.md` inside the candidate release before
promotion. A package-size mismatch, absent exact Kroger product, incomplete
nutrient, digest change, or evidence reference failure rejects finalization.

Promotion takes an exclusive lock, validates every dataset and source digest, writes a temporary pointer, and renames it atomically. It cannot expose a partial release. If the process stops before rename, remove only a confirmed stale `.promotion.lock` after verifying no promotion process remains.

Rollback reloads an already validated immutable release:

```sh
npm run data:rollback -- --release <previous-release-id>
npm run data:compile
npm run data:d1-sync -- --release <previous-release-id> --database /safe/runtime/content.db
```

## D1 projection

`npm run data:d1-sync -- --check` creates an in-memory database from `drizzle/0004_h3_content_data.sql`, projects all fifteen content-data tables in one transaction, verifies counts and digests, injects a late failure, and proves the accepted marker survives. The release row starts as `draft`; `status=published` is written last. A failed transaction rolls back every row.

Use `--dry-run` to review table counts. The tracked Sites manifest names the
pre-existing binding `DB`, but the Handoff 3.1 static public tools do not read
or write it. Never substitute the validated local/Pi projection into that
remote binding without a separately reviewed data migration and deployment.

## Schedules

The governed cadence is in `ops/schedules/content-data-refresh.v1.json`. The included user-unit templates generate plans only; they do not call providers or auto-promote.

Install on the canonical Pi only after operator review:

```sh
install -m 0644 ops/systemd/user/howbiscuit-data-plan@.service ~/.config/systemd/user/
install -m 0644 ops/systemd/user/howbiscuit-data-plan-*.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now howbiscuit-data-plan-eia.timer howbiscuit-data-plan-mymarketnews.timer
systemctl --user list-timers 'howbiscuit-data-plan-*'
```

Disable with `systemctl --user disable --now <timer>`. Kroger remains manual/on-demand. A schedule failure leaves the accepted release unchanged and requires operator review; it has no automatic retry or promotion.
