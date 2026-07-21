# Article package specification

An article package is one real directory named exactly for its lowercase slug. It contains exactly:

```text
<slug>/
  manifest.yaml
  article.md
  media/              # optional; approved raster media only
```

`manifest.yaml` uses schema version `1.0.0`. `article.md` accepts ordinary Markdown, governed citations such as `[@source-id]`, and only the controlled directives implemented by the compiler. Raw HTML, scripts, JSX, imports, unknown directives, malformed attributes, unsafe links, and unresolved IDs fail closed.

Every media file needs a matching active media-rights record with its exact package-relative path, digest, MIME type, attribution, and alt text. The package compiler checks sizes, symlinks, extensions, signatures, rights, workflow, taxonomy, governance records, commerce references, duplicate ID/slug/route, approval digest, and deterministic output.

Ingested packages must be non-published and have `approvalId: null`. An existing article may be replaced only with explicit `--update`; identity and route cannot change, and the replacement must obtain a new approval before publication. A repository-scoped atomic lock serializes canonical validation through rename/rollback; concurrent ingest fails closed without changing content.

See `templates/article-package/` for a starting shape. Templates are authoring aids, not owner approval.
