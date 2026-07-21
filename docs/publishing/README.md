# How Biscuit publishing system

Handoff 2 turns governed source records and article packages into deterministic static pages. Writers edit canonical YAML, Markdown, and approved media under `content/`; they do not hand-edit compiler output under `src/generated/publishing/` or compiler-owned article MDX under `src/content/docs/articles/`.

The safe sequence is:

1. score and approve an idea;
2. approve a brief and register sources, testing, and media rights;
3. prepare a non-published article package;
4. run `npm run article:ingest -- <package-directory>`;
5. run validation and compilation;
6. obtain a new owner approval bound to the current publication digest;
7. change the workflow to published through the governed editorial process;
8. run full QA and the governed release lane.

Ingestion never publishes and never generates public output. Product, destination, price, and recommendation records are static Handoff 2 records. Live offers, affiliate activation, geographic services, analytics, D1, R2, and Queues belong to Handoff 3.

Start with [ARTICLE-PACKAGE-SPEC.md](ARTICLE-PACKAGE-SPEC.md), [EDITORIAL-WORKFLOW.md](EDITORIAL-WORKFLOW.md), and [COMMANDS-AND-QA.md](COMMANDS-AND-QA.md).
