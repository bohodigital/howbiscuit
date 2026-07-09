# How Biscuit Site

Astro Starlight publishing shell for `howbiscuit.com`, skinned as the Biscuit Field Guide.

## What How Biscuit Is

How Biscuit publishes plain answers for school, cooking, home tech, and making do. The site explains the mechanism, shows the practical move, names the failure modes, and gives the cheap safe version.

This repository is currently in the shell phase: navigation, trust pages, RSS, sitemap, reusable components, and the two preserved starter article routes are live. It is not an ad, affiliate, comments, auth, or database-backed site.

## Current Theme

- Framework: Astro Starlight
- Theme: Biscuit Field Guide
- CSS: `src/styles/biscuit.css`
- Content: `src/content/docs/`
- Components: `src/components/`

The old static `public/` HTML version is archived at `legacy-static/public-before-starlight/`. Do not put routed HTML back in Astro's `public/` directory.

## Local Development

```powershell
npm install
npm run dev
npm run qa
npm run build
npm run preview
```

## Cloudflare Pages Deployment

| Setting | Value |
| --- | --- |
| Framework preset | `Astro` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Production branch | `main` |

Target platform: Cloudflare Pages project `howbiscuit`.

## Content Routes

Major divisions:

- `/math/`
- `/research-writing/`
- `/cook/`
- `/home-tech/`
- `/make-do/`
- `/tools/`

Supporting hubs:

- `/buying-guides/`
- `/science/`
- `/glossary/`
- `/articles/`

Preserved article routes:

- `/articles/how-does-baking-powder-work/`
- `/articles/why-are-some-answers-better-than-others/`

Trust pages:

- `/about/`
- `/editorial-policy/`
- `/corrections/`
- `/privacy/`
- `/affiliate-disclosure/`
- `/contact/`

Support routes:

- `/feed.xml`
- `/robots.txt`
- `/sitemap.xml`

## QA

`npm run qa` runs Astro diagnostics, builds the static site, and runs the content lint against source and built output. `scripts/lint-content.mjs` checks required shell files, frontmatter, preserved article feed inclusion, old public HTML conflicts, and public placeholder/internal-strategy strings.

## Operating Docs

- `docs/how-biscuit-constitution-v0.2.md`
- `docs/launch-plan-2026-07-01.md`
- `docs/codex-construction-plan-v0.1.md`
