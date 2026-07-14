# LaTeX article pipeline

How Biscuit can publish an article from one canonical `.tex` file without running a TeX engine in the browser or on a Cloudflare Worker. The build validates a constrained document dialect, renders mathematics with KaTeX, and generates ignored Astro content files before the normal Starlight build.

## Authoring flow

1. Copy `content/latex/articles/why-salt-melts-ice.tex` to a new `.tex` file.
2. Set the required preamble metadata and write the article between `\begin{document}` and `\end{document}`.
3. Run `npm run latex:compile` while drafting.
4. Run `npm test` for compiler tests, then `npm run qa` for the complete article and site build.
5. Commit the `.tex` source, compiler/layout changes, and any article-index change. Do not commit `src/generated/latex/` or flat generated files in `src/content/docs/articles/`.

The route comes from `\hbslug{...}`. For example, `\hbslug{why-salt-melts-ice}` becomes `/articles/why-salt-melts-ice/`.

## Required preamble

```tex
\documentclass[11pt]{article}
\usepackage{amsmath,amssymb}

\title{A useful, specific title}
\author{How Biscuit}
\date{July 13, 2026}
\hbslug{useful-specific-title}
\hbdescription{A complete search and social description of at least 40 characters.}
\hbdivision{science}
\hbevidence{What kinds of evidence were reviewed}
\hbpubdate{2026-07-13}
\hbupdated{2026-07-13}
\hbreadtime{8 min read}
\hbtag{first tag}
\hbfeed{true}
\hbfeatured{false}
```

Valid divisions are `research-writing`, `cook`, `home-tech`, `make-do`, `tools`, `buying-guides`, `science`, and `glossary`. Only `amsmath` and `amssymb` are accepted package declarations; KaTeX already supplies the supported math behavior.

## Supported document vocabulary

- Structure: `\maketitle`, `abstract`, `\section`, `\subsection`, and `\paragraph`.
- Prose: ordinary paragraphs, `\textbf`, `\textit`, `\emph`, `\texttt`, `\href`, `\url`, escaped special characters, and `\LaTeX`.
- Lists and quotations: `itemize`, `enumerate`, `\item`, and `quote`.
- Math: `$...$`, `\(...\)`, `\[...\]`, `equation`, `equation*`, `align`, and `align*` using KaTeX-supported math commands.
- How Biscuit blocks: `\begin{biscuitbox}{Title}`, `sourcenotes` with `\source{title}{publisher}{url}`, and `related` with `\related{label}{title}{url}`.

Block commands and environment boundaries should occupy their own lines. This keeps compiler errors precise and the source pleasant to edit in Overleaf or any text editor.

## Deliberate safety boundary

This is a publishing compiler, not a general TeX runtime. File inclusion, shell escape, arbitrary macro definitions, package loading outside the allowlist, untrusted protocols, and unknown prose commands stop the build. KaTeX renders with `trust: false`, strict parsing, and errors enabled. The resulting page ships static HTML, MathML, CSS, and fonts; it ships no client-side parser.

Do not weaken the allowlist to make one article pass. Add a narrowly tested language feature to `src/lib/latex/article-compiler.mjs`, document it here, and include both a success test and a rejection test.

## Generated files and failure recovery

`scripts/compile-latex-articles.mjs` creates:

- `src/content/docs/articles/<slug>.mdx`, which registers the route with Starlight, RSS, sitemap, and Pagefind.
- `src/generated/latex/<slug>.mjs`, which contains the validated static article HTML and outline.

Both paths are ignored. Delete them and run `npm run latex:compile` to regenerate from source. `npm run latex:check` fails if generated output is missing, stale, or orphaned.

To roll back the pipeline, revert the pipeline commit and rebuild. Existing hand-authored MDX articles live in article subdirectories and are not overwritten by the flat generated-file convention.
