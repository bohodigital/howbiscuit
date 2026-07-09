# How Biscuit Launch Plan v0.1

Date: 2026-07-01
Status: planning document, not production copy

## Recommendation

Launch How Biscuit first as a clean, crawlable static publication shell. Do not scale content until the navigation, trust pages, sitemap, RSS, analytics, and publishing workflow are stable.

## Current Repo State

The repo is a small static site intended for Cloudflare Pages. The public site lives in `public/`. Existing public files include the homepage, stylesheet, two starter articles, sitemap, RSS feed, and robots file.

## Immediate Launch Sprint

1. Rewrite the homepage for readers, not internal SEO testing.
2. Add stable navigation: Articles, Topics, Tools, Glossary, About.
3. Add footer trust links: Privacy, Editorial Policy, Corrections, Affiliate Disclosure, Contact, Sitemap, RSS.
4. Create `/articles/`, `/topics/`, `/tools/`, and `/glossary/` landing pages.
5. Create six topic hubs for the approved first clusters.
6. Upgrade the baking powder article into a substantial answer-first article.
7. Reframe the better-answers article as an editorial/trust article or remove it from launch content.
8. Add an experiments template and monthly measurement template.
9. Update sitemap and RSS after every public page change.
10. Confirm all internal links return working pages.

## Stop Criteria

The launch shell is ready only when every linked page works, trust pages exist, the sitemap and RSS match public pages, no placeholders are visible, and analytics/Search Console setup is ready for indexing measurement.
