# Content-data release operator runbook

How Biscuit treats `data/releases/<release-id>/` as canonical, immutable build input. `data/releases/accepted.json` is the single atomic pointer used by the compiler. D1 is a projection of that accepted release, never the authoring database.

## Safe provider workflow

Repository code does not call external providers. Generate bounded broker plans with:

```sh
npm run data:plan
npm run data:refresh -- --provider eia
npm run data:refresh:all
```

Execute a plan only through the Local1 public-data broker. Save its sanitized response envelope outside Git, then validate it into isolated staging:

```sh
npm run data:import -- --provider eia --envelope /safe/path/envelope.json --release h31-YYYY-MM-DD-sequence
```

The importer rejects unknown fields, nested fields, credentials, private customer data, missing attribution, malformed dates, invalid digests, and more than 2,000 records. It never changes the accepted pointer. Complete provider normalization, manifests, human review, and owner/editorial approval in the new release directory before promotion.

## Validate, compare, promote, and roll back

```sh
npm run data:check
npm run data:diff -- --from <accepted> --to <candidate>
npm run data:promote -- --release <candidate>
npm run data:compile
npm run data:d1-sync -- --release <candidate> --database /safe/runtime/content.db
npm run data:d1-verify -- --release <candidate> --database /safe/runtime/content.db
```

Promotion takes an exclusive lock, validates every dataset and source digest, writes a temporary pointer, and renames it atomically. It cannot expose a partial release. If the process stops before rename, remove only a confirmed stale `.promotion.lock` after verifying no promotion process remains.

Rollback reloads an already validated immutable release:

```sh
npm run data:rollback -- --release <previous-release-id>
npm run data:compile
npm run data:d1-sync -- --release <previous-release-id> --database /safe/runtime/content.db
```

## D1 projection

`npm run data:d1-sync -- --check` creates an in-memory database from `drizzle/0004_h3_content_data.sql`, projects all fifteen content-data tables in one transaction, verifies counts and digests, injects a late failure, and proves the accepted marker survives. The release row starts as `draft`; `status=published` is written last. A failed transaction rolls back every row.

Use `--dry-run` to review table counts. The current Sites project has no bound D1 resource in `.openai/hosting.json`; bind a reviewed database before using a remote deployment. Never substitute an unreviewed production binding.

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
