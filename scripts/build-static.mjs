import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { load as parseYaml } from 'js-yaml';

import {
  assertFullPagefindLane,
  assertPiPagefindSkipAllowed,
} from './lib/pagefind-platform-policy.mjs';
import { loadTypeScriptModule } from './lib/load-typescript-module.mjs';
import { createPublicSiteRegistry, isPublishablePublicRecord } from '../src/lib/public-content/model.mjs';
import { pagefindMetadataForRecord } from '../src/lib/public-content/pagefind-policy.mjs';
import { discoverTrackedPublicSources } from '../src/lib/public-content/source-adapter.mjs';

const root = process.cwd();
const piSkipRequested = process.argv.includes('--pi-pagefind-skip');
const sitesPackageFinalizationRequested = process.argv.includes('--finalize-sites-package');
const sitesPackageVerificationRequested = process.argv.includes('--verify-sites-package');
const environmentSkipRequested = process.env.HOWBISCUIT_SKIP_PAGEFIND === '1';
const taxonomy = await loadTypeScriptModule(path.join(root, 'src', 'config', 'public-taxonomy.ts'));
const normalizedPublicRegistry = createPublicSiteRegistry({
  sources: discoverTrackedPublicSources(root, { taxonomy }),
  taxonomy,
});

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function runNode(modulePath, args) {
  const result = spawnSync(process.execPath, [modulePath, ...args], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function collectFiles(directory, predicate) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(fullPath, predicate));
    else if (predicate(fullPath)) files.push(fullPath);
  }
  return files;
}

function routeFromSource(filePath, sourceRoot) {
  const relative = path.relative(sourceRoot, filePath).replaceAll('\\', '/').replace(/\.(md|mdx)$/, '');
  const withoutIndex = relative.replace(/(^|\/)index$/, '');
  return withoutIndex ? `/${withoutIndex}/` : '/';
}

function routeFromHtml(filePath, artifactRoot) {
  const relative = path.relative(artifactRoot, filePath).replaceAll('\\', '/');
  if (relative === 'index.html') return '/';
  if (relative === '404.html') return '/404.html';
  if (relative.endsWith('/index.html')) return `/${relative.slice(0, -'/index.html'.length)}/`;
  return `/${relative}`;
}

function sourceLastmod(filePath) {
  const source = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').replaceAll('\r\n', '\n');
  const match = source.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  invariant(match, `Content source has no YAML frontmatter: ${filePath}`);
  const data = parseYaml(match[1]);
  const value = data?.updatedDate ?? data?.lastUpdated ?? data?.pubDate ?? null;
  if (!value) return null;
  const normalized = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  invariant(/^\d{4}-\d{2}-\d{2}$/.test(normalized), `Content source has an invalid sitemap date: ${filePath}`);
  return normalized;
}

function assertSetsEqual(expected, actual, label) {
  const missing = [...expected].filter((value) => !actual.has(value)).sort();
  const extra = [...actual].filter((value) => !expected.has(value)).sort();
  invariant(
    missing.length === 0 && extra.length === 0,
    `${label} mismatch. Missing: ${missing.join(', ') || 'none'}. Extra: ${extra.join(', ') || 'none'}.`,
  );
}

function countText(value, needle) {
  return value.split(needle).length - 1;
}

function pagefindPayloadFromFragment(filePath) {
  const decoded = gunzipSync(readFileSync(filePath)).toString('utf8');
  const jsonStart = decoded.indexOf('{');
  invariant(jsonStart >= 0, `Pagefind fragment has no JSON payload: ${filePath}`);
  const payload = JSON.parse(decoded.slice(jsonStart));
  invariant(typeof payload.url === 'string' && payload.url.startsWith('/'), `Pagefind fragment has no route: ${filePath}`);
  return payload;
}

function verifyPageHtml(route, html) {
  const jsonLd = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  invariant((html.match(/<link\b[^>]*rel="canonical"[^>]*>/gi) ?? []).length === 1, `${route} must emit exactly one canonical link.`);
  invariant((html.match(/<meta\b[^>]*name="robots"[^>]*>/gi) ?? []).length === 1, `${route} must emit exactly one robots directive.`);
  invariant((html.match(/<meta\b[^>]*property="og:title"[^>]*>/gi) ?? []).length === 1, `${route} must emit exactly one Open Graph title.`);
  invariant((html.match(/<meta\b[^>]*property="og:image"[^>]*>/gi) ?? []).length === 1, `${route} must emit exactly one Open Graph image.`);
  invariant((html.match(/<meta\b[^>]*name="twitter:card"[^>]*>/gi) ?? []).length === 1, `${route} must emit exactly one Twitter card.`);
  invariant(jsonLd.length === 1, `${route} must emit exactly one JSON-LD payload.`);
  JSON.parse(jsonLd[0][1]);
  invariant((html.match(/<h1\b/gi) ?? []).length === 1, `${route} must render exactly one H1.`);

  const canonicalRoute = route === '/404.html' ? '/404/' : route;
  invariant(html.includes(`href="https://howbiscuit.com${canonicalRoute}"`), `${route} has the wrong canonical URL.`);

  const analyticsCounts = {
    umamiLoader: countText(html, 'https://analytics.bohodigitalservices.com/script.js'),
    umamiSite: countText(html, 'fefef93c-b1d6-4d04-95d3-064af3d38a41'),
    gaLoader: countText(html, 'https://www.googletagmanager.com/gtag/js?id=G-NG0NQMVFEH'),
    gaConfig: countText(html, "gtag('config', 'G-NG0NQMVFEH'"),
  };
  const expectedAnalyticsCount = route === '/404.html' ? 0 : 1;
  for (const [name, count] of Object.entries(analyticsCounts)) {
    invariant(count === expectedAnalyticsCount, `${route} has ${count} ${name} occurrences; expected ${expectedAnalyticsCount}.`);
  }

  if (route === '/404.html') {
    invariant(html.includes('content="noindex, nofollow"'), 'The 404 artifact must be noindex, nofollow.');
    invariant(html.includes('data-pagefind-ignore="all"'), 'The 404 artifact must be excluded from Pagefind.');
  } else {
    invariant(html.includes('content="index, follow"'), `${route} must remain index, follow.`);
  }
}

function verifyStaticArtifact(artifactRoot, { requirePagefind, label }) {
  invariant(existsSync(artifactRoot), `${label} root is missing: ${artifactRoot}`);
  const docsRoot = path.join(root, 'src', 'content', 'docs');
  const sourceFiles = collectFiles(docsRoot, (filePath) => /\.(md|mdx)$/.test(filePath));
  const sourceRoutes = new Set(sourceFiles.map((filePath) => routeFromSource(filePath, docsRoot)));
  const normalizedDocumentRoutes = new Set(
    normalizedPublicRegistry.filter(({ kind }) => kind !== 'topic').map(({ route }) => route),
  );
  assertSetsEqual(normalizedDocumentRoutes, sourceRoutes, 'Normalized source document route set');
  const inactiveContractRoutes = taxonomy.TARGET_ROUTE_CONTRACTS
    .filter(({ route, outcome }) => !route.includes('*') && ['redirect', 'terminal'].includes(outcome))
    .map(({ route }) => route);
  for (const route of inactiveContractRoutes) {
    invariant(!sourceRoutes.has(route), `Inactive source route remains in public content: ${route}`);
  }

  const htmlFiles = collectFiles(artifactRoot, (filePath) => filePath.endsWith('.html'));
  const htmlByRoute = new Map(htmlFiles.map((filePath) => [
    routeFromHtml(filePath, artifactRoot),
    readFileSync(filePath, 'utf8'),
  ]));
  const acceptedRecords = normalizedPublicRegistry.filter(isPublishablePublicRecord);
  const acceptedRoutes = new Set(acceptedRecords.map(({ route }) => route));
  const expectedHtmlRoutes = new Set([...acceptedRoutes, '/404.html']);
  assertSetsEqual(expectedHtmlRoutes, new Set(htmlByRoute.keys()), `${label} HTML route set`);
  for (const [route, html] of htmlByRoute) verifyPageHtml(route, html);

  const eligibleRoutes = new Set(
    [...htmlByRoute]
      .filter(([, html]) => html.includes('data-pagefind-body'))
      .map(([route]) => route),
  );
  const expectedEligibleRoutes = new Set(acceptedRecords.map(({ route }) => route));
  assertSetsEqual(expectedEligibleRoutes, eligibleRoutes, `${label} Pagefind-eligible route set`);

  const sitemap = readFileSync(path.join(artifactRoot, 'sitemap.xml'), 'utf8');
  const sitemapEntries = [...sitemap.matchAll(/<url>\s*<loc>https:\/\/howbiscuit\.com([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?\s*<\/url>/g)]
    .map((match) => ({ route: match[1], lastmod: match[2] ?? null }));
  const sitemapRoutes = new Set(sitemapEntries.map(({ route }) => route));
  assertSetsEqual(expectedEligibleRoutes, sitemapRoutes, `${label} sitemap route set`);
  const sourceLastmodByRoute = new Map(sourceFiles.map((filePath) => [
    routeFromSource(filePath, docsRoot),
    sourceLastmod(filePath),
  ]));
  for (const { route, lastmod } of sitemapEntries) {
    if (!sourceLastmodByRoute.has(route)) continue;
    invariant(
      lastmod === sourceLastmodByRoute.get(route),
      `${label} sitemap lastmod for ${route} must equal its source date or be omitted when the source has no date.`,
    );
  }

  const feed = readFileSync(path.join(artifactRoot, 'feed.xml'), 'utf8');
  const articleRoutes = acceptedRecords
    .filter(({ kind, feedEligible }) => kind === 'article' && feedEligible === true)
    .map(({ route }) => route);
  for (const route of articleRoutes) {
    invariant(feed.includes(`https://howbiscuit.com${route}`), `${label} feed is missing ${route}.`);
  }

  const llms = readFileSync(path.join(artifactRoot, 'llms.txt'), 'utf8');
  for (const route of expectedEligibleRoutes) {
    invariant(llms.includes(`https://howbiscuit.com${route}`), `${label} llms.txt is missing ${route}.`);
  }
  invariant(llms.includes('hello@howbiscuit.com'), `${label} llms.txt is missing the public contact route.`);

  const pagefindRoot = path.join(artifactRoot, 'pagefind');
  if (!requirePagefind) {
    invariant(!existsSync(pagefindRoot), `${label} must not retain a stale Pagefind directory in the guarded Pi artifact.`);
    return { htmlCount: htmlByRoute.size, eligibleCount: eligibleRoutes.size, fragmentCount: 0 };
  }

  invariant(existsSync(path.join(pagefindRoot, 'pagefind.js')), `${label} is missing pagefind/pagefind.js.`);
  const fragmentRoot = path.join(pagefindRoot, 'fragment');
  const fragments = existsSync(fragmentRoot)
    ? collectFiles(fragmentRoot, (filePath) => filePath.endsWith('.pf_fragment'))
    : [];
  const fragmentByRoute = new Map(fragments.map((filePath) => {
    const payload = pagefindPayloadFromFragment(filePath);
    return [payload.url, payload];
  }));
  const indexedRoutes = new Set(fragmentByRoute.keys());
  invariant(fragmentByRoute.size === fragments.length, `${label} has duplicate Pagefind route fragments.`);
  assertSetsEqual(eligibleRoutes, indexedRoutes, `${label} indexed Pagefind route set`);
  for (const record of acceptedRecords) {
    const expected = pagefindMetadataForRecord(record, taxonomy);
    const payload = fragmentByRoute.get(record.route);
    invariant(payload, `${label} has no Pagefind fragment for ${record.route}.`);
    invariant(
      payload.filters?.category?.includes(expected.filters.category),
      `${label} Pagefind category filter differs for ${record.route}.`,
    );
    invariant(
      payload.filters?.type?.includes(expected.filters.type),
      `${label} Pagefind type filter differs for ${record.route}.`,
    );
    for (const [name, value] of Object.entries(expected.meta)) {
      invariant(payload.meta?.[name] === value, `${label} Pagefind ${name} metadata differs for ${record.route}.`);
    }
  }
  return { htmlCount: htmlByRoute.size, eligibleCount: eligibleRoutes.size, fragmentCount: fragments.length };
}

function finalizeSitesPackage() {
  const serverRoot = path.join(root, 'dist', 'server');
  const redirectSource = readFileSync(path.join(root, 'dist', 'client', '_redirects'), 'utf8');
  const redirectRules = taxonomy.parseSitesRedirectRules(redirectSource);
  writeFileSync(path.join(serverRoot, 'index.js'), taxonomy.buildSitesWorkerSource(redirectSource));
  const wranglerPath = path.join(serverRoot, 'wrangler.json');
  const wrangler = JSON.parse(readFileSync(wranglerPath, 'utf8'));
  invariant(wrangler.assets?.binding === 'ASSETS', 'Sites finalization requires the accepted ASSETS binding.');
  wrangler.assets.run_worker_first = true;
  writeFileSync(wranglerPath, JSON.stringify(wrangler));
  return redirectRules.length;
}

async function verifySitesPackage() {
  const result = verifyStaticArtifact(path.join(root, 'dist', 'client'), {
    requirePagefind: true,
    label: 'Sites client package',
  });
  const serverRoot = path.join(root, 'dist', 'server');
  const workerPath = path.join(serverRoot, 'index.js');
  const worker = readFileSync(workerPath, 'utf8');
  invariant(worker.includes('env.ASSETS.fetch(request)'), 'Sites worker must delegate requests to the ASSETS binding.');
  invariant(worker.includes('www.howbiscuit.com'), 'Sites worker must implement www canonicalization.');
  invariant(worker.includes('Response.redirect(location, 301)'), 'Sites worker must emit permanent redirects before asset delegation.');
  const wrangler = JSON.parse(readFileSync(path.join(serverRoot, 'wrangler.json'), 'utf8'));
  invariant(wrangler.main === 'index.js', 'Sites wrangler main must be index.js.');
  invariant(wrangler.assets?.directory === '../client', 'Sites assets directory must be ../client.');
  invariant(wrangler.assets?.binding === 'ASSETS', 'Sites assets binding must be ASSETS.');
  invariant(wrangler.assets?.html_handling === 'auto-trailing-slash', 'Sites trailing-slash handling changed unexpectedly.');
  invariant(wrangler.assets?.not_found_handling === '404-page', 'Sites must use the custom 404 page.');
  invariant(wrangler.assets?.run_worker_first === true, 'Sites must run the redirect Worker before static assets.');
  const hostingSource = readFileSync(path.join(root, '.openai', 'hosting.json'), 'utf8');
  const hostingCopy = readFileSync(path.join(root, 'dist', '.openai', 'hosting.json'), 'utf8');
  invariant(hostingCopy === hostingSource, 'Sites package hosting metadata differs from the tracked source.');
  const hosting = JSON.parse(hostingCopy);
  invariant(typeof hosting.project_id === 'string' && hosting.project_id.length > 0, 'Sites package has no project_id.');

  const redirectSource = readFileSync(path.join(root, 'dist', 'client', '_redirects'), 'utf8');
  const redirectRules = taxonomy.parseSitesRedirectRules(redirectSource);
  const workerModule = await import(`${pathToFileURL(workerPath).href}?verify=${Date.now()}`);
  const assetRequests = [];
  const env = {
    ASSETS: {
      fetch(request) {
        assetRequests.push(request.url);
        return new Response('asset', { status: 200 });
      },
    },
  };
  async function assertSingleHop(requestUrl, expectedLocation) {
    const response = await workerModule.default.fetch(new Request(requestUrl), env);
    invariant(response.status === 301, `${requestUrl} must return 301 in the packaged Worker.`);
    invariant(response.headers.get('location') === expectedLocation, `${requestUrl} returned the wrong packaged Location header.`);
    const follow = await workerModule.default.fetch(new Request(expectedLocation), env);
    invariant(follow.status === 200 && follow.headers.get('location') === null, `${requestUrl} must reach packaged static assets after one redirect.`);
  }
  for (const { from, to } of redirectRules) {
    const sourcePath = from.replace('*', 'package-probe/');
    await assertSingleHop(`https://howbiscuit.com${sourcePath}?ref=sites`, `https://howbiscuit.com${to}?ref=sites`);
    await assertSingleHop(`https://www.howbiscuit.com${sourcePath}?ref=sites`, `https://howbiscuit.com${to}?ref=sites`);
  }
  await assertSingleHop(
    'https://www.howbiscuit.com/articles/?ref=sites',
    'https://howbiscuit.com/articles/?ref=sites',
  );
  await assertSingleHop(
    'https://preview.example.test/make-do/?ref=sites',
    'https://preview.example.test/home/?ref=sites',
  );
  const ordinaryResponse = await workerModule.default.fetch(new Request('https://howbiscuit.com/articles/?ref=sites'), env);
  invariant(ordinaryResponse.status === 200 && ordinaryResponse.headers.get('location') === null, 'The packaged Worker must delegate a current apex route without redirecting.');
  invariant(assetRequests.includes('https://howbiscuit.com/articles/?ref=sites'), 'The packaged Worker did not delegate a current route to static assets.');
  return result;
}

if (sitesPackageFinalizationRequested) {
  invariant(!sitesPackageVerificationRequested, 'Sites finalization and verification must be separate invocations.');
  const ruleCount = finalizeSitesPackage();
  console.log(`Finalized the Sites redirect Worker with ${ruleCount} path rules and www canonicalization.`);
} else if (sitesPackageVerificationRequested) {
  invariant(!piSkipRequested && !environmentSkipRequested, 'Sites package verification requires the full x64 Pagefind artifact.');
  const result = await verifySitesPackage();
  console.log(`Sites package verification passed: ${result.htmlCount} HTML routes, ${result.eligibleCount} eligible routes, ${result.fragmentCount} Pagefind fragments.`);
} else {
  if (piSkipRequested) {
    invariant(environmentSkipRequested, 'The guarded Pi build requires the wrapper-provided exception flag.');
    const pageSize = Number.parseInt(execFileSync('getconf', ['PAGESIZE'], { encoding: 'utf8' }).trim(), 10);
    assertPiPagefindSkipAllowed({ platform: process.platform, arch: process.arch, pageSize });
  } else {
    assertFullPagefindLane({ skipRequested: environmentSkipRequested, lane: 'The normal build' });
  }

  runNode(path.join(root, 'node_modules', 'astro', 'bin', 'astro.mjs'), ['build']);

  if (piSkipRequested) {
    const result = verifyStaticArtifact(path.join(root, 'dist'), { requirePagefind: false, label: 'Guarded Pi artifact' });
    console.log(`Astro build passed with ${result.htmlCount} routes and ${result.eligibleCount} Pagefind-eligible routes; Pagefind execution was skipped only for verified Linux ARM64/16 KiB validation.`);
  } else {
    runNode(path.join(root, 'node_modules', 'pagefind', 'lib', 'runner', 'bin.cjs'), [
      '--site',
      'dist',
      '--output-subdir',
      'pagefind',
    ]);
    const result = verifyStaticArtifact(path.join(root, 'dist'), { requirePagefind: true, label: 'Static x64 artifact' });
    console.log(`Astro and Pagefind static build passed: ${result.htmlCount} HTML routes, ${result.eligibleCount} eligible routes, ${result.fragmentCount} indexed fragments.`);
  }
}
