import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
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

async function verifyDirectory(directory, expected) {
  const scan = await collect(directory);
  privacyScan(scan.files);
  const actual = releaseFrom(scan);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${path.basename(directory)} differs from the approved release manifest`);
  }
  return actual;
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
  const release = await verifyDirectory(siteDir, await loadJson(releasePath));
  await verifyPromotion(release);
  console.log(`verified ${release.fileCount} files, ${release.byteCount} bytes`);
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

const command = process.argv[2] ?? "verify";
if (command === "verify") {
  await verify();
} else if (command === "build" || command === "test") {
  await build();
  if (command === "test") console.log("all public distribution tests passed");
} else {
  fail(`unknown command: ${command}`);
}
