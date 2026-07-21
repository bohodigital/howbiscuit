# Publishing fixture and rejection matrix

The suite uses canonical migrated records, documented draft templates, and isolated temporary package mutations. It does not copy fake records into production content.

| Required class | Executable evidence |
| --- | --- |
| Valid standard and categoryless editorial-standard articles | `article-ingest.test.mjs` secure update tests; canonical compiler tests |
| Valid source, testing, media-rights, and link preview | `publishing-fixtures.test.mjs` schema fixtures |
| Valid product, exact variant, group, unpaid destination, and dated price | `publishing-fixtures.test.mjs` and `product-records.test.mjs` |
| Raw HTML, script, JSX, imports, unknown/malformed directives | `publishing-compiler.test.mjs` Markdown rejection subtests |
| Unresolved source, testing, media, product, group, destination | editorial, compiler, and product resolution tests |
| Missing rights and alt text | duplicate/unregistered media tests and media-rights schema fixture rejection |
| Duplicate article ID/slug/route and product ID | compiler uniqueness and product-record load tests |
| Invalid taxonomy and workflow | public contract and editorial workflow tests |
| Missing or stale approval | editorial digest tests and ingest stale-publication rejection |
| False testing/personal-use claims | editorial first-hand and product provenance tests |
| Unsupported ranking, undated price, affiliate destination, live availability, merchant URL | product commerce rejection tests |
| Path traversal and unsafe URLs | compiler encoded-traversal and safe-URL rejection subtests; ingest normalized-path inventory guard |
| Symlink, oversized package, unsafe media, unexpected file | compiler and ingest filesystem rejection tests on Linux |
| Stale generated output | compiler check-only stale-output tests |

Every ingest rejection test also proves the prior canonical package remains byte-identical and staging directories are removed.
