# Commands and QA

| Command | Effect | Platform | Publishes? |
| --- | --- | --- | --- |
| `npm run idea:score` | validates deterministic idea scores | Pi-safe | No |
| `npm run article:validate` | validates packages and current generated output | Pi-safe | No |
| `npm run article:compile` | writes normalized JSON/schema/generated MDX | Pi-safe | No |
| `npm run article:ingest -- <dir>` | validates and atomically adds a non-published package | Pi-safe | No |
| `npm run article:ingest -- <dir> --update` | governed replacement; invalidates approval | Pi-safe | No |
| `npm run product:validate` | validates canonical product records | Pi-safe | No |
| `npm run publishing:qa` | two semantic compilations and determinism check | Pi-safe | No |
| `npm run check` | records, contracts, TypeScript, and Astro diagnostics | Pi-safe | No |
| `npm test` / `npm run qa` | production build, Pagefind, tests, lint | x64 required for native Pagefind here | No |
| `npm run qa:pi` | ARM64/16 KiB-safe equivalent; skips only native Pagefind execution | Pi-safe | No |
| `npm run build:sites` | generates and verifies the Sites package | x64 | No |

All commands are local repository operations. Deployment is a separate governed release action. Do not hand-edit generated artifacts. Run `npm ci` before the final matrix. Run two clean publishing compilations and compare semantic output; Pagefind hashed filenames need not match.
