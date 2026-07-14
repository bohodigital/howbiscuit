import katex from 'katex';

const SAFE_DIVISIONS = new Set([
  'research-writing',
  'cook',
  'home-tech',
  'make-do',
  'tools',
  'buying-guides',
  'science',
  'glossary',
]);

const SAFE_PACKAGES = new Set(['amsmath', 'amssymb']);
const FORBIDDEN_COMMANDS = [
  'catcode',
  'csname',
  'def',
  'edef',
  'endcsname',
  'everyjob',
  'gdef',
  'immediate',
  'include',
  'includeonly',
  'input',
  'let',
  'loop',
  'newcommand',
  'openin',
  'openout',
  'read',
  'renewcommand',
  'repeat',
  'RequirePackage',
  'shipout',
  'special',
  'usepackagewithoptions',
  'write',
  'xdef',
];

const REQUIRED_METADATA = [
  'title',
  'hbslug',
  'hbdescription',
  'hbdivision',
  'hbevidence',
  'hbpubdate',
  'hbupdated',
  'hbreadtime',
];

function fail(message, sourcePath) {
  const prefix = sourcePath ? `${sourcePath}: ` : '';
  throw new Error(`${prefix}${message}`);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function stripComments(source) {
  return source
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .split('\n')
    .map((line) => {
      for (let index = 0; index < line.length; index += 1) {
        if (line[index] !== '%') continue;
        let slashes = 0;
        for (let cursor = index - 1; cursor >= 0 && line[cursor] === '\\'; cursor -= 1) {
          slashes += 1;
        }
        if (slashes % 2 === 0) return line.slice(0, index);
      }
      return line;
    })
    .join('\n');
}

function readBraced(source, start, sourcePath) {
  let cursor = start;
  while (/\s/.test(source[cursor] ?? '')) cursor += 1;
  if (source[cursor] !== '{') fail('Expected a braced argument.', sourcePath);

  const contentStart = cursor + 1;
  let depth = 1;
  cursor += 1;
  while (cursor < source.length) {
    const character = source[cursor];
    const escaped = source[cursor - 1] === '\\' && source[cursor - 2] !== '\\';
    if (!escaped && character === '{') depth += 1;
    if (!escaped && character === '}') depth -= 1;
    if (depth === 0) {
      return { value: source.slice(contentStart, cursor), end: cursor + 1 };
    }
    cursor += 1;
  }

  fail('Unclosed braced argument.', sourcePath);
}

function parseCommandAt(source, start, name, argumentCount, sourcePath) {
  const token = `\\${name}`;
  if (!source.startsWith(token, start)) return null;
  const next = source[start + token.length] ?? '';
  if (/[A-Za-z@]/.test(next)) return null;

  const values = [];
  let cursor = start + token.length;
  for (let argument = 0; argument < argumentCount; argument += 1) {
    const parsed = readBraced(source, cursor, sourcePath);
    values.push(parsed.value.trim());
    cursor = parsed.end;
  }
  return { values, end: cursor };
}

function extractCommands(source, name, argumentCount, sourcePath) {
  const matches = [];
  const ranges = [];
  let cursor = 0;

  while (cursor < source.length) {
    const start = source.indexOf(`\\${name}`, cursor);
    if (start === -1) break;
    const parsed = parseCommandAt(source, start, name, argumentCount, sourcePath);
    if (!parsed) {
      cursor = start + name.length + 1;
      continue;
    }
    matches.push(parsed.values);
    ranges.push([start, parsed.end]);
    cursor = parsed.end;
  }

  let cleaned = source;
  for (const [start, end] of ranges.reverse()) {
    cleaned = `${cleaned.slice(0, start)}${cleaned.slice(end)}`;
  }
  return { matches, source: cleaned };
}

function takePreambleCommand(state, name, count, { required = false, multiple = false } = {}) {
  const result = extractCommands(state.source, name, count, state.sourcePath);
  state.source = result.source;
  if (required && result.matches.length !== 1) {
    fail(`Expected exactly one \\${name}{...} command.`, state.sourcePath);
  }
  if (!multiple && result.matches.length > 1) {
    fail(`The \\${name}{...} command may appear only once.`, state.sourcePath);
  }
  return multiple ? result.matches : result.matches[0];
}

function validateDate(value, label, sourcePath) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T12:00:00Z`))) {
    fail(`\\${label}{...} must use YYYY-MM-DD.`, sourcePath);
  }
  return value;
}

function validateUrl(value, sourcePath) {
  if (value.startsWith('/') || value.startsWith('#')) return value;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`Unsafe or invalid URL: ${value}`, sourcePath);
  }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    fail(`Only credential-free HTTP(S), root-relative, and hash URLs are allowed: ${value}`, sourcePath);
  }
  return parsed.toString();
}

function parsePreamble(source, sourcePath) {
  const state = { source, sourcePath };

  const documentClass = state.source.match(/\\documentclass(?:\[[^\]]*\])?\{([^}]+)\}/);
  if (!documentClass || documentClass[1].trim() !== 'article') {
    fail('The source must use \\documentclass{article}.', sourcePath);
  }
  state.source = state.source.replace(documentClass[0], '');

  state.source = state.source.replace(
    /\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/g,
    (_full, packageList) => {
      const packages = packageList.split(',').map((item) => item.trim()).filter(Boolean);
      for (const packageName of packages) {
        if (!SAFE_PACKAGES.has(packageName)) {
          fail(`Unsupported package \\usepackage{${packageName}}.`, sourcePath);
        }
      }
      return '';
    },
  );

  const values = {};
  for (const name of REQUIRED_METADATA) {
    values[name] = takePreambleCommand(state, name, 1, { required: true })[0];
  }
  values.author = takePreambleCommand(state, 'author', 1)?.[0] ?? 'How Biscuit';
  values.date = takePreambleCommand(state, 'date', 1)?.[0] ?? values.hbpubdate;
  values.tags = takePreambleCommand(state, 'hbtag', 1, { multiple: true }).map(([tag]) => tag);
  values.feed = takePreambleCommand(state, 'hbfeed', 1)?.[0] ?? 'true';
  values.featured = takePreambleCommand(state, 'hbfeatured', 1)?.[0] ?? 'false';

  if (state.source.trim()) {
    fail(`Unsupported preamble content: ${state.source.trim().slice(0, 80)}`, sourcePath);
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.hbslug)) {
    fail('\\hbslug{...} must be a lowercase, hyphen-separated URL slug.', sourcePath);
  }
  if (!SAFE_DIVISIONS.has(values.hbdivision)) {
    fail(`Unknown How Biscuit division: ${values.hbdivision}`, sourcePath);
  }
  if (!['true', 'false'].includes(values.feed) || !['true', 'false'].includes(values.featured)) {
    fail('\\hbfeed and \\hbfeatured must be true or false.', sourcePath);
  }
  if (values.title.length < 8 || values.hbdescription.length < 40) {
    fail('The title or description is too thin for a publishable article.', sourcePath);
  }

  return {
    title: values.title,
    slug: values.hbslug,
    description: values.hbdescription,
    division: values.hbdivision,
    evidence: values.hbevidence,
    pubDate: validateDate(values.hbpubdate, 'hbpubdate', sourcePath),
    updatedDate: validateDate(values.hbupdated, 'hbupdated', sourcePath),
    readTime: values.hbreadtime,
    author: values.author,
    displayDate: values.date,
    tags: values.tags,
    feed: values.feed === 'true',
    featured: values.featured === 'true',
  };
}

function renderMath(tex, displayMode, sourcePath) {
  try {
    return katex.renderToString(tex.trim(), {
      displayMode,
      output: 'htmlAndMathml',
      strict: 'error',
      throwOnError: true,
      trust: false,
    });
  } catch (error) {
    fail(`KaTeX could not render ${JSON.stringify(tex.trim())}: ${error.message}`, sourcePath);
  }
}

function renderText(value) {
  return escapeHtml(value)
    .replaceAll('---', '&mdash;')
    .replaceAll('--', '&ndash;')
    .replaceAll('~', '&nbsp;');
}

function renderInline(source, sourcePath) {
  let html = '';
  let plain = '';
  let cursor = 0;

  const appendText = (text) => {
    html += renderText(text);
    plain += text.replaceAll('---', '—').replaceAll('--', '–').replaceAll('~', ' ');
  };

  while (cursor < source.length) {
    if (source.startsWith('$$', cursor)) {
      fail('Use \\[...\\] or an equation environment instead of $$.', sourcePath);
    }

    if (source[cursor] === '$') {
      const end = source.indexOf('$', cursor + 1);
      if (end === -1) fail('Unclosed inline math delimiter.', sourcePath);
      const tex = source.slice(cursor + 1, end);
      html += renderMath(tex, false, sourcePath);
      plain += tex;
      cursor = end + 1;
      continue;
    }

    if (source.startsWith('\\(', cursor)) {
      const end = source.indexOf('\\)', cursor + 2);
      if (end === -1) fail('Unclosed \\(...\\) inline math delimiter.', sourcePath);
      const tex = source.slice(cursor + 2, end);
      html += renderMath(tex, false, sourcePath);
      plain += tex;
      cursor = end + 2;
      continue;
    }

    if (source[cursor] === '\\') {
      const escapedCharacters = {
        '%': '%',
        '&': '&',
        '#': '#',
        '_': '_',
        '$': '$',
        '{': '{',
        '}': '}',
      };
      const escaped = escapedCharacters[source[cursor + 1]];
      if (escaped) {
        appendText(escaped);
        cursor += 2;
        continue;
      }
      if (source.startsWith('\\\\', cursor)) {
        html += '<br>';
        plain += ' ';
        cursor += 2;
        continue;
      }
      if (source.startsWith('\\LaTeX', cursor)) {
        html += '<span class="hb-latex-wordmark">L<sup>A</sup>T<sub>E</sub>X</span>';
        plain += 'LaTeX';
        cursor += '\\LaTeX'.length;
        continue;
      }

      const inlineCommands = [
        ['textbf', 'strong'],
        ['textit', 'em'],
        ['emph', 'em'],
        ['texttt', 'code'],
      ];
      let matched = false;
      for (const [command, tag] of inlineCommands) {
        const parsed = parseCommandAt(source, cursor, command, 1, sourcePath);
        if (!parsed) continue;
        const nested = renderInline(parsed.values[0], sourcePath);
        html += `<${tag}>${nested.html}</${tag}>`;
        plain += nested.plain;
        cursor = parsed.end;
        matched = true;
        break;
      }
      if (matched) continue;

      const href = parseCommandAt(source, cursor, 'href', 2, sourcePath);
      if (href) {
        const url = validateUrl(href.values[0], sourcePath);
        const label = renderInline(href.values[1], sourcePath);
        const external = /^https?:/.test(url) ? ' rel="noopener noreferrer"' : '';
        html += `<a href="${escapeHtml(url)}"${external}>${label.html}</a>`;
        plain += label.plain;
        cursor = href.end;
        continue;
      }

      const urlCommand = parseCommandAt(source, cursor, 'url', 1, sourcePath);
      if (urlCommand) {
        const url = validateUrl(urlCommand.values[0], sourcePath);
        const external = /^https?:/.test(url) ? ' rel="noopener noreferrer"' : '';
        html += `<a href="${escapeHtml(url)}"${external}>${escapeHtml(url)}</a>`;
        plain += url;
        cursor = urlCommand.end;
        continue;
      }

      const command = source.slice(cursor).match(/^\\([A-Za-z@]+)/)?.[1] ?? source.slice(cursor, cursor + 12);
      fail(`Unsupported prose command \\${command}.`, sourcePath);
    }

    let next = cursor + 1;
    while (next < source.length && source[next] !== '\\' && source[next] !== '$') next += 1;
    appendText(source.slice(cursor, next));
    cursor = next;
  }

  return { html, plain: plain.replace(/\s+/g, ' ').trim() };
}

function commandLine(line, name, argumentCount, sourcePath) {
  const parsed = parseCommandAt(line, 0, name, argumentCount, sourcePath);
  if (!parsed || line.slice(parsed.end).trim()) return null;
  return parsed.values;
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'section';
}

class BodyParser {
  constructor(body, metadata, sourcePath) {
    this.lines = body.split('\n');
    this.metadata = metadata;
    this.sourcePath = sourcePath;
    this.index = 0;
    this.section = 0;
    this.subsection = 0;
    this.equation = 0;
    this.outline = [];
    this.ids = new Map();
    this.abstractHtml = '';
    this.seenMaketitle = false;
  }

  uniqueId(label) {
    const base = slugify(label);
    const count = this.ids.get(base) ?? 0;
    this.ids.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  }

  isBlockStart(line) {
    const trimmed = line.trim();
    return !trimmed
      || trimmed === '\\maketitle'
      || trimmed.startsWith('\\section')
      || trimmed.startsWith('\\subsection')
      || trimmed.startsWith('\\paragraph')
      || trimmed.startsWith('\\begin{')
      || trimmed.startsWith('\\end{')
      || trimmed.startsWith('\\[');
  }

  collectEnvironment(name) {
    const content = [];
    let depth = 1;
    while (this.index < this.lines.length) {
      const line = this.lines[this.index];
      this.index += 1;
      if (line.trim().startsWith(`\\begin{${name}}`)) depth += 1;
      if (line.trim() === `\\end{${name}}`) {
        depth -= 1;
        if (depth === 0) return content;
      }
      content.push(line);
    }
    fail(`Unclosed ${name} environment.`, this.sourcePath);
  }

  collectDisplayMath(openingLine) {
    const opening = openingLine.trim();
    if (opening.endsWith('\\]') && opening.length > 4) {
      return opening.slice(2, -2);
    }
    const content = [opening.slice(2)];
    while (this.index < this.lines.length) {
      const line = this.lines[this.index];
      this.index += 1;
      const end = line.indexOf('\\]');
      if (end !== -1) {
        content.push(line.slice(0, end));
        if (line.slice(end + 2).trim()) fail('Text after \\] is not supported.', this.sourcePath);
        return content.join('\n');
      }
      content.push(line);
    }
    fail('Unclosed \\[...\\] display math block.', this.sourcePath);
  }

  renderParagraphs(lines) {
    const paragraphs = [];
    let buffer = [];
    const flush = () => {
      if (!buffer.length) return;
      const rendered = renderInline(buffer.join(' ').trim(), this.sourcePath);
      paragraphs.push(`<p>${rendered.html}</p>`);
      buffer = [];
    };
    for (const line of lines) {
      if (!line.trim()) flush();
      else buffer.push(line.trim());
    }
    flush();
    return paragraphs.join('\n');
  }

  renderList(lines, ordered) {
    const items = [];
    let current = [];
    for (const line of lines) {
      const match = line.trim().match(/^\\item(?:\s+|$)(.*)$/);
      if (match) {
        if (current.length) items.push(current.join(' '));
        current = [match[1]];
      } else if (line.trim()) {
        if (!current.length) fail('List content must begin with \\item.', this.sourcePath);
        current.push(line.trim());
      }
    }
    if (current.length) items.push(current.join(' '));
    if (!items.length) fail('Lists must contain at least one \\item.', this.sourcePath);
    const tag = ordered ? 'ol' : 'ul';
    return `<${tag} class="hb-latex-list">${items.map((item) => `<li>${renderInline(item, this.sourcePath).html}</li>`).join('')}</${tag}>`;
  }

  renderSources(lines) {
    const sources = lines.filter((line) => line.trim());
    if (!sources.length) fail('The sourcenotes environment cannot be empty.', this.sourcePath);
    const items = sources.map((line) => {
      const values = commandLine(line.trim(), 'source', 3, this.sourcePath);
      if (!values) fail('Source notes must use \\source{title}{publisher}{url}.', this.sourcePath);
      const title = renderInline(values[0], this.sourcePath);
      const publisher = renderInline(values[1], this.sourcePath);
      const url = validateUrl(values[2], this.sourcePath);
      return `<li><a href="${escapeHtml(url)}" rel="noopener noreferrer">${title.html}</a><span>${publisher.html}</span></li>`;
    });
    return `<section class="hb-latex-sources" aria-labelledby="latex-source-notes"><header><span>Sources reviewed</span><h2 id="latex-source-notes">Source notes</h2></header><ol>${items.join('')}</ol></section>`;
  }

  renderRelated(lines) {
    const related = lines.filter((line) => line.trim());
    if (!related.length) fail('The related environment cannot be empty.', this.sourcePath);
    const items = related.map((line) => {
      const values = commandLine(line.trim(), 'related', 3, this.sourcePath);
      if (!values) fail('Related links must use \\related{label}{title}{url}.', this.sourcePath);
      const url = validateUrl(values[2], this.sourcePath);
      return `<a href="${escapeHtml(url)}"><span>${renderInline(values[0], this.sourcePath).html}</span><strong>${renderInline(values[1], this.sourcePath).html}</strong><i aria-hidden="true">→</i></a>`;
    });
    return `<section class="hb-latex-related"><h2>Keep going</h2><div>${items.join('')}</div></section>`;
  }

  renderEquation(tex, environment) {
    const numbered = !environment.endsWith('*');
    if (numbered) this.equation += 1;
    const normalized = environment.startsWith('align')
      ? `\\begin{aligned}${tex}\\end{aligned}`
      : tex;
    const math = renderMath(normalized, true, this.sourcePath);
    const label = numbered ? `<span class="hb-latex-equation-number" aria-label="Equation ${this.equation}">(${this.equation})</span>` : '';
    return `<div class="hb-latex-equation">${math}${label}</div>`;
  }

  renderHeading(line, name, level) {
    const values = commandLine(line, name, 1, this.sourcePath);
    if (!values) fail(`Malformed \\${name}{...} heading.`, this.sourcePath);
    const rendered = renderInline(values[0], this.sourcePath);
    let number;
    if (level === 2) {
      this.section += 1;
      this.subsection = 0;
      number = `${this.section}`;
    } else if (level === 3) {
      if (!this.section) fail('A subsection must follow a section.', this.sourcePath);
      this.subsection += 1;
      number = `${this.section}.${this.subsection}`;
    }
    const id = this.uniqueId(rendered.plain);
    if (level <= 3) this.outline.push({ depth: level, id, label: rendered.plain, number });
    return `<h${level} id="${id}"><span>${number ?? ''}</span>${rendered.html}</h${level}>`;
  }

  parse() {
    const blocks = [];
    while (this.index < this.lines.length) {
      const rawLine = this.lines[this.index];
      const line = rawLine.trim();
      this.index += 1;
      if (!line) continue;

      if (line === '\\maketitle') {
        if (this.seenMaketitle) fail('\\maketitle may appear only once.', this.sourcePath);
        this.seenMaketitle = true;
        continue;
      }

      if (line.startsWith('\\section')) {
        blocks.push(this.renderHeading(line, 'section', 2));
        continue;
      }
      if (line.startsWith('\\subsection')) {
        blocks.push(this.renderHeading(line, 'subsection', 3));
        continue;
      }
      if (line.startsWith('\\paragraph')) {
        blocks.push(this.renderHeading(line, 'paragraph', 4));
        continue;
      }

      if (line.startsWith('\\[')) {
        blocks.push(`<div class="hb-latex-display-math">${renderMath(this.collectDisplayMath(rawLine), true, this.sourcePath)}</div>`);
        continue;
      }

      const begin = line.match(/^\\begin\{([^}]+)\}(.*)$/);
      if (begin) {
        const environment = begin[1];
        const remainder = begin[2].trim();
        const supported = new Set(['abstract', 'itemize', 'enumerate', 'quote', 'equation', 'equation*', 'align', 'align*', 'biscuitbox', 'sourcenotes', 'related']);
        if (!supported.has(environment)) fail(`Unsupported environment: ${environment}`, this.sourcePath);
        const content = this.collectEnvironment(environment);

        if (environment === 'abstract') {
          if (this.abstractHtml) fail('Only one abstract is allowed.', this.sourcePath);
          if (remainder) fail('The abstract environment takes no argument.', this.sourcePath);
          this.abstractHtml = this.renderParagraphs(content);
        } else if (environment === 'itemize' || environment === 'enumerate') {
          if (remainder) fail(`${environment} takes no argument.`, this.sourcePath);
          blocks.push(this.renderList(content, environment === 'enumerate'));
        } else if (environment === 'quote') {
          if (remainder) fail('The quote environment takes no argument.', this.sourcePath);
          blocks.push(`<blockquote>${this.renderParagraphs(content)}</blockquote>`);
        } else if (['equation', 'equation*', 'align', 'align*'].includes(environment)) {
          if (remainder) fail(`${environment} takes no argument.`, this.sourcePath);
          blocks.push(this.renderEquation(content.join('\n'), environment));
        } else if (environment === 'biscuitbox') {
          const title = readBraced(remainder, 0, this.sourcePath);
          if (remainder.slice(title.end).trim()) fail('biscuitbox accepts one title argument.', this.sourcePath);
          blocks.push(`<aside class="hb-latex-box"><h2>${renderInline(title.value, this.sourcePath).html}</h2>${this.renderParagraphs(content)}</aside>`);
        } else if (environment === 'sourcenotes') {
          if (remainder) fail('sourcenotes takes no argument.', this.sourcePath);
          blocks.push(this.renderSources(content));
        } else if (environment === 'related') {
          if (remainder) fail('related takes no argument.', this.sourcePath);
          blocks.push(this.renderRelated(content));
        }
        continue;
      }

      if (line.startsWith('\\end{')) fail(`Unexpected ${line}.`, this.sourcePath);

      const paragraph = [line];
      while (this.index < this.lines.length && !this.isBlockStart(this.lines[this.index])) {
        paragraph.push(this.lines[this.index].trim());
        this.index += 1;
      }
      blocks.push(`<p>${renderInline(paragraph.join(' '), this.sourcePath).html}</p>`);
    }

    if (!this.seenMaketitle) fail('The document body must include \\maketitle.', this.sourcePath);
    if (!this.abstractHtml) fail('The document body must include an abstract environment.', this.sourcePath);
    if (!this.outline.some((item) => item.depth === 2)) fail('The article must contain at least one \\section.', this.sourcePath);

    return { bodyHtml: blocks.join('\n'), abstractHtml: this.abstractHtml, outline: this.outline };
  }
}

function assertNoForbiddenCommands(source, sourcePath) {
  for (const command of FORBIDDEN_COMMANDS) {
    const pattern = new RegExp(`\\\\${command}(?![A-Za-z@])`);
    if (pattern.test(source)) fail(`Forbidden command \\${command}.`, sourcePath);
  }
}

function articleHtml(metadata, parsed) {
  const title = renderInline(metadata.title, '').html;
  const author = renderInline(metadata.author, '').html;
  const date = renderInline(metadata.displayDate, '').html;
  return [
    '<article class="hb-latex-paper" data-article-format="latex">',
    '  <header class="hb-latex-masthead">',
    '    <p class="hb-latex-kicker">How Biscuit field paper</p>',
    `    <h1>${title}</h1>`,
    `    <p class="hb-latex-author">${author}</p>`,
    `    <p class="hb-latex-date">${date}</p>`,
    `    <section class="hb-latex-abstract" aria-labelledby="latex-abstract"><h2 id="latex-abstract">Abstract</h2>${parsed.abstractHtml}</section>`,
    '  </header>',
    `  <div class="hb-latex-copy">${parsed.bodyHtml}</div>`,
    '</article>',
  ].join('\n');
}

export function compileLatexArticle(rawSource, { sourcePath = '' } = {}) {
  if (typeof rawSource !== 'string' || !rawSource.trim()) fail('LaTeX source is empty.', sourcePath);
  const source = stripComments(rawSource);
  assertNoForbiddenCommands(source, sourcePath);

  const beginToken = '\\begin{document}';
  const endToken = '\\end{document}';
  const begin = source.indexOf(beginToken);
  const end = source.lastIndexOf(endToken);
  if (begin === -1 || end === -1 || end < begin) fail('Expected one complete document environment.', sourcePath);
  if (source.indexOf(beginToken, begin + beginToken.length) !== -1 || source.indexOf(endToken) !== end) {
    fail('Nested or repeated document environments are not allowed.', sourcePath);
  }
  if (source.slice(end + endToken.length).trim()) fail('Content after \\end{document} is not allowed.', sourcePath);

  const metadata = parsePreamble(source.slice(0, begin), sourcePath);
  const body = source.slice(begin + beginToken.length, end);
  const parsed = new BodyParser(body, metadata, sourcePath).parse();

  return {
    metadata,
    outline: parsed.outline,
    html: articleHtml(metadata, parsed),
  };
}

function yamlString(value) {
  return JSON.stringify(value);
}

export function generatedMdx(article) {
  const { metadata } = article;
  const tags = metadata.tags.length ? `[${metadata.tags.map(yamlString).join(', ')}]` : '[]';
  return `---
title: ${yamlString(metadata.title)}
description: ${yamlString(metadata.description)}
kind: article
articleFormat: latex
division: ${metadata.division}
feed: ${metadata.feed}
pubDate: ${metadata.pubDate}
updatedDate: ${metadata.updatedDate}
lastUpdated: ${metadata.updatedDate}
tags: ${tags}
evidence: ${yamlString(metadata.evidence)}
readTime: ${yamlString(metadata.readTime)}
featured: ${metadata.featured}
---

{/* Generated by compile-latex-articles.mjs. Edit the matching .tex source. */}
import LatexArticle from '../../../components/LatexArticle.astro';
import article from '../../../generated/latex/${metadata.slug}.mjs';

<LatexArticle article={article} />
`;
}

export function generatedModule(article) {
  return `// Generated by compile-latex-articles.mjs. Edit the matching .tex source.\nexport default ${JSON.stringify(article, null, 2)};\n`;
}
