# How Biscuit Codex Construction Plan v0.1

Date: 2026-07-01
Target repo: `thepresidentofai/howbiscuit_main`
Target site: `howbiscuit.com`
Theme direction: Astro Starlight re-skinned as the **Biscuit Field Guide**

## 0. Read These First

Before editing, inspect:

- `README.md`
- `docs/how-biscuit-constitution-v0.2.md`
- `docs/launch-plan-2026-07-01.md`
- current `public/` files

Do not guess the repo state. Do not delete working URLs until their replacement routes exist and build successfully.

## 1. Current State

The repo is currently a static Cloudflare Pages starter. `README.md` says:

- framework preset: `None`
- build command: blank
- build output directory: `public`
- production branch: `main`

This must change after migration to Astro/Starlight:

- framework preset: `Astro` if Cloudflare offers it, otherwise manual
- build command: `npm run build`
- build output directory: `dist`
- production branch: `main`

Do not use SSR, Workers bindings, databases, auth, comments, ads, affiliate widgets, or client-heavy interactivity in this phase.

## 2. Product Goal

Build a sleek, simple, funny, reader-first knowledge base.

Public promise:

> Plain answers for school, cooking, home tech, and making do.

Internal promise:

> Explain the mechanism, show the practical move, name the failure modes, and give the cheap safe version.

The site should feel like:

- a practical field guide
- a clean student handbook
- a recipe card box
- a survival notebook for cheap apartment life
- a calm math tutor who knows the textbook is being annoying

It must not feel like:

- a generic SaaS landing page
- a dark-mode AI content farm
- a chaotic meme site
- an affiliate review swamp
- a docs template with the default paint still wet

## 3. Base Theme Decision

Use Astro Starlight as the base.

Reasons:

- Markdown/MDX content workflow
- docs-style navigation
- search-ready knowledge-base structure
- readable typography
- sidebar and table-of-contents patterns
- static-friendly output
- works well for course paths, guides, glossaries, and tools

Do not use AstroWind for How Biscuit unless Starlight fails. AstroWind is better for agency/marketing pages. How Biscuit needs a knowledge-base center of gravity.

## 4. Branch and Safety Rules

Work on a feature branch:

```bash
git checkout -b feature/biscuit-field-guide-starlight
```

Before migration, preserve the current static site:

```bash
mkdir -p legacy-static
cp -R public legacy-static/public-before-starlight
```

Do not leave old HTML pages inside Astro's `public/` directory. In Astro, `public/` is for static assets copied into `dist`, not the source of routed pages. Existing public HTML must be ported into Starlight/MDX routes.

Do not push or merge until:

```bash
npm install
npm run qa
npm run build
```

passes locally.

## 5. Install / Migration Strategy

Preferred approach:

1. Generate a fresh Starlight project in a temporary directory.
2. Copy the generated Astro/Starlight structure into this repo.
3. Port existing content and docs.
4. Remove the temporary directory.

Suggested commands:

```bash
npm create astro@latest hb-starlight -- --template starlight
rsync -a hb-starlight/ ./ --exclude .git
rm -rf hb-starlight
npm install
```

If the Astro CLI prompts, choose the Starlight template, TypeScript yes/strict if offered, install dependencies yes, initialize git no.

If the command fails because of CLI prompt behavior, manually create the Starlight files using the official template as reference. Do not improvise a fake Starlight structure.

## 6. Required Package Scripts

Update `package.json` with these scripts:

```json
{
  "scripts": {
    "dev": "astro dev",
    "build": "astro check && astro build",
    "preview": "astro preview",
    "check": "astro check",
    "lint:content": "node scripts/lint-content.mjs",
    "qa": "npm run check && npm run lint:content && npm run build"
  }
}
```

Install/keep these dependencies as needed:

```bash
npm install astro @astrojs/starlight @astrojs/sitemap
npm install -D @astrojs/check typescript
```

If Starlight template already includes some of these, do not duplicate them.

## 7. Target File Tree

Create or update this structure:

```text
astro.config.mjs
package.json
package-lock.json
tsconfig.json
src/content.config.ts
src/styles/biscuit.css
src/assets/how-biscuit-mark.svg
src/components/BiscuitBox.astro
src/components/DivisionCard.astro
src/components/EvidenceBadge.astro
src/components/RiskBadge.astro
src/components/ToolPreview.astro
src/content/docs/index.mdx
src/content/docs/math/index.mdx
src/content/docs/research-writing/index.mdx
src/content/docs/cook/index.mdx
src/content/docs/home-tech/index.mdx
src/content/docs/make-do/index.mdx
src/content/docs/tools/index.mdx
src/content/docs/buying-guides/index.mdx
src/content/docs/science/index.mdx
src/content/docs/glossary/index.mdx
src/content/docs/articles/index.mdx
src/content/docs/articles/how-does-baking-powder-work.mdx
src/content/docs/articles/why-are-some-answers-better-than-others.mdx
src/content/docs/about/index.mdx
src/content/docs/editorial-policy/index.mdx
src/content/docs/corrections/index.mdx
src/content/docs/privacy/index.mdx
src/content/docs/affiliate-disclosure/index.mdx
src/content/docs/contact/index.mdx
src/pages/feed.xml.ts
public/robots.txt
public/favicon.svg
scripts/lint-content.mjs
.github/workflows/build.yml
README.md
```

Optional but useful:

```text
src/data/divisions.ts
src/data/site.ts
```

## 8. Astro / Starlight Configuration

Configure `astro.config.mjs` with:

```js
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://howbiscuit.com',
  integrations: [
    starlight({
      title: 'How Biscuit',
      description: 'Plain answers for school, cooking, home tech, and making do.',
      customCss: ['./src/styles/biscuit.css'],
      nav: [
        { label: 'Math', link: '/math/' },
        { label: 'Research & Writing', link: '/research-writing/' },
        { label: 'Cooking', link: '/cook/' },
        { label: 'Home Tech', link: '/home-tech/' },
        { label: 'Make-Do Lab', link: '/make-do/' },
        { label: 'Tools', link: '/tools/' }
      ],
      sidebar: [
        { label: 'Start Here', items: [
          { label: 'Home', link: '/' },
          { label: 'Articles', link: '/articles/' },
          { label: 'Tools', link: '/tools/' }
        ]},
        { label: 'Math', autogenerate: { directory: 'math' } },
        { label: 'Research & Writing', autogenerate: { directory: 'research-writing' } },
        { label: 'Cooking', autogenerate: { directory: 'cook' } },
        { label: 'Home Tech', autogenerate: { directory: 'home-tech' } },
        { label: 'Make-Do Lab', autogenerate: { directory: 'make-do' } },
        { label: 'Tools', autogenerate: { directory: 'tools' } },
        { label: 'More', items: [
          { label: 'Buying Guides', link: '/buying-guides/' },
          { label: 'Everyday Science', link: '/science/' },
          { label: 'Glossary', link: '/glossary/' },
          { label: 'About', link: '/about/' }
        ]}
      ],
      head: [
        { tag: 'link', attrs: { rel: 'alternate', type: 'application/rss+xml', title: 'How Biscuit RSS Feed', href: '/feed.xml' } }
      ]
    }),
    sitemap()
  ]
});
```

If Starlight's current API differs, follow current official docs and preserve equivalent behavior. Do not force stale code to work just because this plan contains a snippet.

## 9. Content Collection Setup

Create `src/content.config.ts` using the current Starlight-recommended docs collection setup.

Target shape:

```ts
import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema(),
  }),
};
```

If the generated Starlight template uses a slightly different setup, keep the generated setup unless it fails.

## 10. Visual Design System

Create `src/styles/biscuit.css`.

The site should be warm, sleek, and readable. No visual clutter. No animations in phase 0 except subtle hover/focus states.

Palette:

```css
:root {
  --hb-bg: #fff8e7;
  --hb-surface: #ffffff;
  --hb-text: #241a12;
  --hb-muted: #66584b;
  --hb-honey: #f4b400;
  --hb-honey-dark: #9a5b00;
  --hb-green: #2d6a4f;
  --hb-jam: #d95d39;
  --hb-cocoa: #1e1b18;
}
```

Starlight theme override goals:

```css
:root {
  --sl-font: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --sl-font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  --sl-color-accent-low: #fff0bf;
  --sl-color-accent: #f4b400;
  --sl-color-accent-high: #5f3b00;
  --sl-color-bg: #fff8e7;
  --sl-color-bg-sidebar: #fff3cf;
  --sl-color-bg-nav: #fffaf0;
  --sl-color-text: #241a12;
}

:root[data-theme='dark'] {
  --sl-color-bg: #14110e;
  --sl-color-bg-sidebar: #1e1b18;
  --sl-color-bg-nav: #1a1714;
  --sl-color-text: #fff8e7;
  --sl-color-accent-low: #3a2800;
  --sl-color-accent: #f4b400;
  --sl-color-accent-high: #ffe8a3;
}
```

Add component classes:

```css
.hb-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; }
.hb-card { border: 1px solid color-mix(in srgb, var(--hb-honey), transparent 65%); border-radius: 18px; padding: 1rem; background: var(--hb-surface); box-shadow: 0 8px 30px rgb(36 26 18 / 0.06); }
.hb-card:hover { transform: translateY(-2px); transition: transform 160ms ease, box-shadow 160ms ease; }
.hb-box { border-radius: 16px; padding: 1rem; margin: 1rem 0; border: 1px solid color-mix(in srgb, var(--hb-honey), transparent 55%); background: #fffaf0; }
.hb-box[data-variant='warning'] { border-color: color-mix(in srgb, var(--hb-jam), transparent 45%); }
.hb-box[data-variant='cheap'] { border-color: color-mix(in srgb, var(--hb-green), transparent 45%); }
.hb-badge { display: inline-flex; align-items: center; gap: .35rem; border-radius: 999px; padding: .2rem .55rem; font-size: .78rem; font-weight: 700; }
```

If `color-mix()` causes compatibility concerns, replace with static hex values. No CSS wizardry worship.

## 11. Components

### `BiscuitBox.astro`

Props:

```ts
type Variant = 'short-answer' | 'common-mistake' | 'cheap-safe' | 'dont-be-fooled' | 'source-note';
```

Render:

- title
- variant label
- slot body

Default labels:

- `short-answer`: Short answer
- `common-mistake`: Common mistake
- `cheap-safe`: Cheap safe version
- `dont-be-fooled`: Don't be fooled
- `source-note`: Source note

### `DivisionCard.astro`

Props:

- title
- href
- iconName or emoji fallback
- description
- accent

Use for homepage and topic index pages.

### `EvidenceBadge.astro`

Allowed values:

- Tested
- Researched
- Theoretical

Do not use `Tested` unless testing actually happened.

### `RiskBadge.astro`

Allowed values:

- Green
- Yellow
- Orange
- Red

Use primarily in Make-Do Lab.

### `ToolPreview.astro`

Props:

- title
- href
- description
- status: `live` | `planned`

Do not show `planned` tools on production homepage. Planned status is only for internal or docs pages if unavoidable.

## 12. Homepage Requirements

Build `src/content/docs/index.mdx` as the homepage, or use `src/pages/index.astro` if Starlight splash pages are too limiting.

Homepage must include:

1. Hero
2. Search-forward framing
3. Six division cards
4. Start-here strip
5. Featured tools section
6. Editorial promise section
7. Footer/trust links through Starlight/global footer if supported

Exact hero copy:

```text
Plain answers for school, cooking, home tech, and making do.
```

Subheadline:

```text
How Biscuit explains the thing, shows the practical move, names the failure modes, and gives the cheap safe version.
```

Primary CTA:

```text
Start with Math
```

Secondary CTA:

```text
Browse Tools
```

Start-here cards:

- Homework panic: `Go to Math`
- Cooking failure: `Go to Cooking`
- Wi-Fi chaos: `Go to Home Tech`
- Cheap apartment fix: `Go to Make-Do Lab`

Tone: fun, confident, not try-hard.

Do not use:

- “SEO experiment”
- “traffic laboratory”
- “broad informational SEO”
- “content strategy”

Those are internal phrases. Readers do not care about our tiny ranking laboratory.

## 13. Required Public Routes

Build working pages for:

```text
/
/math/
/research-writing/
/cook/
/home-tech/
/make-do/
/tools/
/buying-guides/
/science/
/glossary/
/articles/
/articles/how-does-baking-powder-work/
/articles/why-are-some-answers-better-than-others/
/about/
/editorial-policy/
/corrections/
/privacy/
/affiliate-disclosure/
/contact/
/feed.xml
/robots.txt
/sitemap-index.xml or /sitemap.xml depending on Astro sitemap output
```

Preserve existing article URLs exactly:

```text
/articles/how-does-baking-powder-work/
/articles/why-are-some-answers-better-than-others/
```

## 14. Hub Page Copy Requirements

Each hub page must be real enough to stand alone. No “coming soon.” No fake article inventory.

Each hub needs:

- one-sentence mission
- “Start here” section
- “What this section covers” bullets
- “How we handle evidence” note when relevant
- link to related sections

Example for Make-Do Lab:

```mdx
---
title: Make-Do Lab
description: Cheap, practical, safety-bounded fixes for apartment life, groceries, repairs, cooling, and basic setup.
---

# Make-Do Lab

Cheap fixes are useful. Cheap fixes that create mold, fire, or landlord drama are just expensive fixes wearing a fake mustache.

The Make-Do Lab collects safe, reversible, low-cost ways to make a home work better when the budget is rude.

## Start here

- Apartment cooling
- Grocery stretching
- First apartment setup
- Cheap repairs

## Our rule

Every guide should name the cheap version, the safer version, and the point where you should stop.
```

Make all hub pages concise at first. Do not pad them.

## 15. Existing Article Migration

Port the two current articles into MDX.

### Baking powder article

File:

```text
src/content/docs/articles/how-does-baking-powder-work.mdx
```

Keep the canonical URL as:

```text
https://howbiscuit.com/articles/how-does-baking-powder-work/
```

Do not invent citations or testing. It is okay to leave a clearly labeled internal TODO in a draft comment, but do not show TODOs in rendered production.

### Better answers article

File:

```text
src/content/docs/articles/why-are-some-answers-better-than-others.mdx
```

Reframe it as an editorial/trust article. Do not feature it as a main content pillar on the homepage.

## 16. Trust Pages

Create honest, short pages:

### `/about/`

Explain:

- How Biscuit publishes practical explainers
- current focus areas
- not a professional advice site
- not monetized yet

### `/editorial-policy/`

Include:

- source standards
- AI use policy
- evidence labels
- correction process
- no fake reviews/testing/authors/credentials

### `/corrections/`

Include:

- how to report errors
- what gets corrected
- how modified dates are handled

### `/privacy/`

Keep simple. Mention Cloudflare/Web Analytics only if actually used. Do not invent tracking tools.

### `/affiliate-disclosure/`

Say no affiliate links are currently used if true. Explain future disclosure policy.

### `/contact/`

Use a simple contact method if available. If no email is configured, state that contact details are being finalized and do not put fake addresses.

## 17. RSS Feed

Create `src/pages/feed.xml.ts`.

It should:

- use site title `How Biscuit`
- use site URL `https://howbiscuit.com/`
- include only real article pages under `/articles/`
- exclude indexes, hubs, trust pages, tools, glossary pages unless intentionally marked as articles
- use frontmatter title/description/date when available

If the RSS implementation becomes fragile, pause and report rather than shipping a broken feed.

## 18. Robots and Sitemap

Create `public/robots.txt`:

```text
User-agent: *
Allow: /

Sitemap: https://howbiscuit.com/sitemap-index.xml
```

If Astro sitemap outputs `/sitemap.xml` instead, use that exact URL. Validate after build by inspecting `dist/`.

Use `@astrojs/sitemap` or Starlight's current recommended sitemap approach. The final built output must include a sitemap with public canonical routes.

## 19. Content Lint Script

Create `scripts/lint-content.mjs`.

It should fail the build if rendered source files contain obvious junk:

Forbidden strings in `src/content` and built `dist`:

```text
TODO
Lorem ipsum
coming soon
placeholder
Insert text here
TBD
SEO experiment
traffic laboratory
```

Allow exceptions only inside `docs/` planning documents, not in public rendered source.

Also check:

- every public MDX page has title frontmatter
- every public MDX page has description frontmatter
- no internal links point to `/feed.xml` incorrectly
- no `href="#articles"` remains from old homepage

Keep this lint simple. Do not install a cathedral of linting dependencies just to search for six strings.

## 20. GitHub Actions Build Check

Create `.github/workflows/build.yml`:

```yaml
name: Build

on:
  pull_request:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run qa
```

If dependency install fails because Node version differs from Astro requirements, adjust to the supported LTS version and document the change.

## 21. README Update

Update `README.md` to reflect the new architecture.

Required README sections:

- What How Biscuit is
- Current theme: Biscuit Field Guide on Astro Starlight
- Local development commands
- Cloudflare Pages deployment settings
- Content routes
- QA commands
- Constitution/doc links

Deployment settings section must say:

```text
Framework preset: Astro
Build command: npm run build
Build output directory: dist
Production branch: main
```

Mention that the old static `public/` HTML version was moved to `legacy-static/public-before-starlight/` during migration.

## 22. Cloudflare Pages Settings for Human

After merge, the human must update Cloudflare Pages settings:

```text
Framework preset: Astro
Build command: npm run build
Build output directory: dist
Production branch: main
```

If Cloudflare already has the project connected with old settings, the build will fail or deploy stale output until these settings are changed. Do not pretend this is a code problem if deployment is still pointed at `public`. That is not debugging; that is ritual suffering.

## 23. QA Checklist

Run:

```bash
npm install
npm run qa
npm run build
npm run preview
```

Then manually check:

```text
/
/math/
/research-writing/
/cook/
/home-tech/
/make-do/
/tools/
/articles/
/articles/how-does-baking-powder-work/
/articles/why-are-some-answers-better-than-others/
/about/
/editorial-policy/
/privacy/
/corrections/
/affiliate-disclosure/
/contact/
/feed.xml
/robots.txt
```

Check built output:

```bash
find dist -maxdepth 3 -type f | sort
cat dist/robots.txt
grep -R "TODO\|Lorem ipsum\|coming soon\|placeholder\|TBD\|SEO experiment\|traffic laboratory" dist || true
```

The grep command should return nothing except false positives that are intentionally documented and not visible to readers.

## 24. Design Acceptance Criteria

The finished shell must:

- feel warm, smart, and practical
- use cream/honey/chocolate visual language
- preserve high contrast
- work in light and dark mode
- avoid novelty body fonts
- avoid image-heavy hero sections
- avoid busy animations
- make search and navigation obvious
- make the six major divisions obvious
- include funny microcopy only where it helps
- remain readable on mobile

Do not over-design. The site should pop because the structure and components are good, not because the CSS discovered fireworks.

## 25. Content Acceptance Criteria

The finished shell must:

- have no public placeholders
- preserve the two existing article routes
- avoid fake citations
- avoid fake testing claims
- avoid fake monetization disclosure
- avoid fake author credentials
- use reader-facing language on homepage
- use internal strategy language only in docs, not public pages

## 26. Stop Conditions

Stop and report instead of forcing a bad merge if:

- Starlight fails to build and the error is not understood
- old public HTML conflicts with new Astro routes
- RSS generation becomes brittle
- sitemap output path is unclear
- Cloudflare deployment settings cannot be changed
- public pages require fake placeholder text to look complete
- the design becomes less readable than default Starlight

## 27. Definition of Done

This construction phase is done when:

- Astro/Starlight is installed
- Biscuit Field Guide CSS is applied
- all required public routes build
- existing article URLs are preserved
- homepage is reader-facing and fun
- six major divisions are visible
- trust pages exist
- RSS exists
- robots exists
- sitemap exists
- build workflow exists
- README is updated
- `npm run qa` passes
- no public placeholder text remains
- Cloudflare deployment settings are documented for the human

Do not write all articles now. Build the machine that will publish them cleanly.
