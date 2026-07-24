# Tool-package operator runbook

Every public tool is a package under `content/tools/<slug>/`:

```text
manifest.yaml
tool-definition.json
content.md
```

The manifest owns publication metadata, approval, accepted release and packet dependencies, discovery, related content, privacy, analytics, fallback, and review dates. The definition owns bounded inputs, table columns, optional chart fields, limitations, and the explicit zero-provider-call contract. `content.md` contains safe explanatory prose.

Create and review a package:

```sh
npm run tool:new -- --slug example-tool
npm run tool:validate
npm run tool:compile
npm run tool:compile:check
npm run tool:list
npm run tool:qa
```

The single dynamic route `src/pages/tools/[slug].astro` publishes every approved package. Adding a package does not require editing application routes. The compiler updates `src/generated/tools/tools.v1.json`; the public registry then includes each tool in Pagefind, sitemap, `llms.txt`, metadata, and the Tools category index.

Inputs are bounded enums from the accepted static release. They are filtered in the browser, are not transmitted, and are excluded from custom analytics. Without JavaScript, every tool still shows the complete accessible table. Raw scripts, HTML, directives, unknown components, unapproved releases, stale packets, unbounded inputs, personal information, and ordinary-load provider calls are rejected.

Retirement is a reviewed manifest change in a new commit. The command intentionally does not bypass governance.
