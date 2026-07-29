import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const siteDir = path.join(root, "site");
const distDir = path.join(root, "dist");
const releasePath = path.join(root, "public-release.v1.json");
const promotionPath = path.join(root, "promotion-package.v1.json");
const maximumFiles = 3000;
const maximumBytes = 75 * 1024 * 1024;
const blockedLiterals = [
  "BEGIN RSA PRIVATE KEY",
  "BEGIN OPENSSH PRIVATE KEY",
  "BEGIN EC PRIVATE KEY",
];
const blockedPatterns = [
  /\b(?:CR|WO)-20\d{2}-[A-Z0-9-]{3,}\b/g,
  /\/(?:Users|home)\/[A-Za-z0-9._-]+\/(?:Documents|repos|local1)(?:\/|$)/g,
  /\/srv\/[A-Za-z0-9._-]+(?:\/|$)/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  /\bgh[oprsu]_[A-Za-z0-9]{30,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{30,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
  /\b(?:api[_-]?key|client[_-]?secret|access[_-]?token|password)\s*[:=]\s*["'][^"']{8,}["']/gi,
];

function fail(message) {
  throw new Error(message);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function collect(directory) {
  const files = [];
  async function visit(current, relative = "") {
    const names = (await readdir(current)).sort();
    for (const name of names) {
      const absolute = path.join(current, name);
      const rel = path.posix.join(relative, name);
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) fail(`symbolic link is forbidden: ${rel}`);
      if (info.isDirectory()) {
        await visit(absolute, rel);
      } else if (info.isFile()) {
        const contents = await readFile(absolute);
        files.push({
          path: rel,
          bytes: contents.length,
          sha256: `sha256:${sha256(contents)}`,
          contents,
        });
      } else {
        fail(`special filesystem entry is forbidden: ${rel}`);
      }
    }
  }
  await visit(directory);
  const bytes = files.reduce((sum, item) => sum + item.bytes, 0);
  if (files.length > maximumFiles) fail(`file limit exceeded: ${files.length}`);
  if (bytes > maximumBytes) fail(`byte limit exceeded: ${bytes}`);
  return { files, bytes };
}

function artifactDigest(files) {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.path);
    hash.update(Buffer.from([0]));
    hash.update(file.contents);
  }
  return `sha256:${hash.digest("hex")}`;
}

function routeFor(relative) {
  if (!relative.endsWith(".html")) return null;
  if (relative === "index.html") return "/";
  if (relative === "404.html") return "/404.html";
  if (relative.endsWith("/index.html")) return `/${relative.slice(0, -10)}`;
  return `/${relative}`;
}

function referenceTarget(filePaths, routes, missingReferences, rawReference, sourcePath) {
  const reference = rawReference.trim().replaceAll("&amp;", "&");
  if (!reference || reference.startsWith("#")) return false;
  if (/^(?:mailto|tel|data):/i.test(reference)) return false;
  if (/^javascript:/i.test(reference)) fail(`${sourcePath}: executable URL is forbidden`);

  const sourceRoute = sourcePath.endsWith("/index.html")
    ? `/${sourcePath.slice(0, -"index.html".length)}`
    : `/${sourcePath}`;
  let parsed;
  try {
    parsed = new URL(reference, `https://howbiscuit.com${sourceRoute}`);
  } catch {
    fail(`${sourcePath}: invalid reference ${reference}`);
  }
  if (!["howbiscuit.com", "www.howbiscuit.com"].includes(parsed.hostname)) return false;

  let pathname;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    fail(`${sourcePath}: reference has invalid percent encoding ${reference}`);
  }
  if (!pathname.startsWith("/") || pathname.includes("\\")) {
    fail(`${sourcePath}: unsafe internal reference ${reference}`);
  }
  if (pathname.split("/").includes("..")) fail(`${sourcePath}: internal reference escapes the public root`);

  const normalized = path.posix.normalize(pathname);
  const direct = normalized.slice(1);
  const indexPath = normalized === "/" ? "index.html" : `${direct.replace(/\/?$/, "/")}index.html`;
  const route = normalized.endsWith("/") ? normalized : `${normalized}/`;
  if (!filePaths.has(direct) && !filePaths.has(indexPath) && !routes.has(route)) {
    missingReferences.add(`${sourcePath} -> ${pathname}`);
    return false;
  }
  return true;
}

function verifyFullCorpusReferences(scan) {
  const filePaths = new Set(scan.files.map((file) => file.path));
  const routes = new Set(scan.files.map((file) => routeFor(file.path)).filter(Boolean));
  for (const required of ["_headers", "_redirects", "feed.xml", "llms.txt", "robots.txt", "search-index.json", "sitemap.xml"]) {
    if (!filePaths.has(required)) fail(`public discovery surface is missing ${required}`);
  }
  const headers = scan.files.find((file) => file.path === "_headers").contents.toString("utf8");
  if (headers.includes("'wasm-unsafe-eval'")) {
    fail("the public CSP must not relax script execution for browser search");
  }
  const headerAssets = scan.files
    .filter((file) => /^_astro\/SiteHeader[^/]*\.js$/.test(file.path))
    .map((file) => file.contents.toString("utf8"));
  if (headerAssets.length === 0) fail("a generated SiteHeader browser asset is required");
  if (!headerAssets.some((asset) => asset.includes("/search-index.json"))) {
    fail("a generated SiteHeader must load the first-party static search index");
  }
  if (headerAssets.some((asset) => asset.includes("/pagefind/pagefind.js"))) {
    fail("generated SiteHeader assets must not dynamically load the Pagefind runtime");
  }

  let searchPayload;
  try {
    searchPayload = JSON.parse(
      scan.files.find((file) => file.path === "search-index.json").contents.toString("utf8"),
    );
  } catch {
    fail("search-index.json must contain valid JSON");
  }
  if (
    searchPayload?.schemaVersion !== "howbiscuit-static-search.v1"
    || !Array.isArray(searchPayload.records)
    || searchPayload.records.length === 0
    || searchPayload.records.length > 1000
  ) {
    fail("search-index.json has an invalid schema or record count");
  }
  const searchRoutes = new Set();
  for (const record of searchPayload.records) {
    if (
      !record
      || typeof record !== "object"
      || typeof record.route !== "string"
      || !/^\/(?:[a-z0-9-]+\/)*$/.test(record.route)
      || typeof record.title !== "string"
      || record.title.length === 0
      || record.title.length > 240
      || typeof record.description !== "string"
      || record.description.length === 0
      || record.description.length > 1000
      || (record.category !== null && (typeof record.category !== "string" || record.category.length === 0 || record.category.length > 120))
      || typeof record.type !== "string"
      || record.type.length === 0
      || record.type.length > 120
      || typeof record.searchText !== "string"
      || record.searchText.length === 0
      || record.searchText.length > 4000
    ) {
      fail("search-index.json contains an invalid record");
    }
    if (searchRoutes.has(record.route)) fail(`search-index.json duplicates ${record.route}`);
    if (!routes.has(record.route)) fail(`search-index.json references a missing route: ${record.route}`);
    searchRoutes.add(record.route);
  }

  const missingReferences = new Set();
  let internalReferenceCount = 0;
  for (const file of scan.files) {
    if (file.path.endsWith(".html")) {
      const html = file.contents.toString("utf8");
      for (const match of html.matchAll(/\b(?:href|src|poster|data-src)=["']([^"']+)["']/gi)) {
        if (referenceTarget(filePaths, routes, missingReferences, match[1], file.path)) {
          internalReferenceCount += 1;
        }
      }
      for (const match of html.matchAll(/\bsrcset=["']([^"']+)["']/gi)) {
        for (const candidate of match[1].split(",")) {
          const reference = candidate.trim().split(/\s+/, 1)[0];
          if (referenceTarget(filePaths, routes, missingReferences, reference, file.path)) {
            internalReferenceCount += 1;
          }
        }
      }
    } else if (file.path.endsWith(".css")) {
      const css = file.contents.toString("utf8");
      for (const match of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
        if (referenceTarget(filePaths, routes, missingReferences, match[1], file.path)) {
          internalReferenceCount += 1;
        }
      }
    }
  }

  const feed = scan.files.find((file) => file.path === "feed.xml").contents.toString("utf8");
  const feedUrls = [...feed.matchAll(/https:\/\/(?:www\.)?howbiscuit\.com[^<"'\s]*/g)];
  if (feedUrls.length === 0) fail("feed.xml contains no canonical How Biscuit URLs");
  for (const match of feedUrls) {
    if (referenceTarget(filePaths, routes, missingReferences, match[0], "feed.xml")) {
      internalReferenceCount += 1;
    }
  }

  const llms = scan.files.find((file) => file.path === "llms.txt").contents.toString("utf8");
  const llmsReferences = [
    ...[...llms.matchAll(/\]\((\/[^)\s]+)\)/g)].map((match) => match[1]),
    ...[...llms.matchAll(/https:\/\/(?:www\.)?howbiscuit\.com[^)\s]*/g)].map((match) => match[0]),
  ];
  if (llmsReferences.length === 0) fail("llms.txt contains no internal discovery links");
  for (const reference of llmsReferences) {
    if (referenceTarget(filePaths, routes, missingReferences, reference, "llms.txt")) {
      internalReferenceCount += 1;
    }
  }

  const robots = scan.files.find((file) => file.path === "robots.txt").contents.toString("utf8");
  if (!robots.includes("Sitemap: https://howbiscuit.com/sitemap.xml")) {
    fail("robots.txt does not name the canonical sitemap");
  }
  if (missingReferences.size > 0) {
    fail(`full-corpus internal references are missing: ${[...missingReferences].sort().slice(0, 20).join(", ")}`);
  }
  return { routes: routes.size, internalReferences: internalReferenceCount };
}

function privacyScan(files) {
  for (const file of files) {
    const text = file.contents.toString("utf8");
    for (const literal of blockedLiterals) {
      if (text.includes(literal)) fail(`blocked private literal in ${file.path}`);
    }
    for (const pattern of blockedPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) fail(`blocked sensitive pattern in ${file.path}`);
    }
  }
}

function releaseFrom(scan) {
  const files = scan.files.map(({ contents: _contents, ...item }) => item);
  const routes = scan.files.map((item) => routeFor(item.path)).filter(Boolean).sort();
  return {
    schemaVersion: "public-release.v1",
    artifactDigest: artifactDigest(scan.files),
    fileCount: scan.files.length,
    byteCount: scan.bytes,
    htmlRouteCount: routes.length,
    routes,
    files,
  };
}

async function loadJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function writeJsonAtomic(file, value) {
  const temporary = path.join(root, `.${path.basename(file)}.${process.pid}.tmp`);
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  await rename(temporary, file);
}

async function verifyDirectory(directory, expected) {
  const scan = await collect(directory);
  privacyScan(scan.files);
  const references = verifyFullCorpusReferences(scan);
  const actual = releaseFrom(scan);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${path.basename(directory)} differs from the approved release manifest`);
  }
  return { release: actual, references };
}

async function verifyPromotion(release) {
  const promotion = await loadJson(promotionPath);
  if (promotion.schemaVersion !== "public-promotion-package.v1") fail("invalid promotion schema version");
  if (!/^[a-z0-9][a-z0-9._-]{2,79}$/.test(promotion.releaseId)) fail("invalid release ID");
  if (!/^sha256:[a-f0-9]{64}$/.test(promotion.approvalDigest)) fail("invalid approval digest");
  if (!Array.isArray(promotion.routes) || promotion.routes.length === 0) fail("promotion routes are required");
  if (!Array.isArray(promotion.files) || promotion.files.length === 0) fail("promotion files are required");
  if (!Array.isArray(promotion.removedFiles)) fail("promotion removedFiles is required");
  const releaseFiles = new Map(release.files.map((file) => [file.path, file]));
  const seenFiles = new Set();
  for (const file of promotion.files) {
    if (seenFiles.has(file.path)) fail(`duplicate promoted file: ${file.path}`);
    seenFiles.add(file.path);
    if (JSON.stringify(file) !== JSON.stringify(releaseFiles.get(file.path))) {
      fail(`promoted file differs from the accepted release: ${file.path}`);
    }
  }
  const removed = new Set();
  for (const file of promotion.removedFiles) {
    if (typeof file !== "string" || !/^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))[A-Za-z0-9._/-]+$/.test(file)) {
      fail(`invalid removed file: ${file}`);
    }
    if (removed.has(file)) fail(`duplicate removed file: ${file}`);
    removed.add(file);
    if (releaseFiles.has(file)) fail(`removed file is still present: ${file}`);
  }
  const seenRoutes = new Set();
  for (const route of promotion.routes) {
    if (seenRoutes.has(route)) fail(`duplicate promoted route: ${route}`);
    seenRoutes.add(route);
    if (!release.routes.includes(route)) fail(`promoted route is missing: ${route}`);
  }
}

async function verify() {
  const verified = await verifyDirectory(siteDir, await loadJson(releasePath));
  const release = verified.release;
  await verifyPromotion(release);
  console.log(`verified ${release.fileCount} files, ${release.byteCount} bytes`);
  console.log(`verified ${verified.references.internalReferences} internal references`);
  console.log(release.artifactDigest);
  return release;
}

async function build() {
  await verify();
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  await cp(siteDir, distDir, { recursive: true, errorOnExist: true });
  await verifyDirectory(distDir, await loadJson(releasePath));
  console.log("built reproducible dist/");
}

async function inventory() {
  const [releaseId, ...requestedRoutes] = process.argv.slice(3);
  if (!/^[a-z0-9][a-z0-9._-]{2,79}$/.test(releaseId ?? "")) {
    fail("inventory requires a valid release ID");
  }
  const routes = [...new Set(requestedRoutes)].sort();
  if (
    routes.length === 0
    || routes.some((route) => route !== "/" && !/^\/[A-Za-z0-9._/-]*\/$/.test(route))
  ) {
    fail("inventory requires one or more safe affected routes");
  }

  const previous = await loadJson(releasePath);
  const scan = await collect(siteDir);
  privacyScan(scan.files);
  verifyFullCorpusReferences(scan);
  const release = releaseFrom(scan);
  for (const route of routes) {
    if (!release.routes.includes(route)) fail(`affected route is missing: ${route}`);
  }

  const previousByPath = new Map(previous.files.map((file) => [file.path, file.sha256]));
  const releasePaths = new Set(release.files.map((file) => file.path));
  const files = release.files.filter((file) => previousByPath.get(file.path) !== file.sha256);
  const removedFiles = previous.files
    .map((file) => file.path)
    .filter((file) => !releasePaths.has(file))
    .sort();
  if (files.length === 0 && removedFiles.length === 0) fail("inventory found no changed files");

  const approvalBinding = {
    schemaVersion: "public-corpus-repair-approval.v1",
    releaseId,
    baseArtifactDigest: previous.artifactDigest,
    artifactDigest: release.artifactDigest,
    files,
    removedFiles,
    routes,
  };
  const promotion = {
    schemaVersion: "public-promotion-package.v1",
    releaseId,
    approvalDigest: `sha256:${sha256(Buffer.from(JSON.stringify(approvalBinding)))}`,
    files,
    removedFiles,
    routes,
  };

  await writeJsonAtomic(promotionPath, promotion);
  await writeJsonAtomic(releasePath, release);
  console.log(`inventoried ${files.length} changed and ${removedFiles.length} removed files`);
  console.log(release.artifactDigest);
  console.log(promotion.approvalDigest);
}

const command = process.argv[2] ?? "verify";
if (command === "verify") {
  await verify();
} else if (command === "build" || command === "test") {
  await build();
  if (command === "test") console.log("all public distribution tests passed");
} else if (command === "inventory") {
  await inventory();
} else {
  fail(`unknown command: ${command}`);
}
