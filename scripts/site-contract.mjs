import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const siteDir = path.join(root, "site");
const distDir = path.join(root, "dist");
const manifestPath = path.join(root, "public-release.v1.json");
const maximumFiles = 2000;
const maximumBytes = 50 * 1024 * 1024;
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
      if (rel.split("/").some((part) => part === "." || part === "..")) {
        fail(`unsafe path: ${rel}`);
      }
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
  if (relative.endsWith("/index.html")) {
    return `/${relative.slice(0, -10)}`;
  }
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

async function verifyDirectory(directory, expected) {
  const scan = await collect(directory);
  privacyScan(scan.files);
  const actual = releaseFrom(scan);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${path.basename(directory)} differs from the approved release manifest`);
  }
  if (actual.htmlRouteCount !== 37) fail("expected exactly 37 HTML routes");
  const expectedPublicArticles = [
    "/articles/how-does-baking-powder-work/",
    "/articles/why-are-some-answers-better-than-others/",
    "/articles/why-salt-melts-ice/",
  ];
  for (const route of expectedPublicArticles) {
    if (!actual.routes.includes(route)) fail(`missing approved article route: ${route}`);
  }
  return actual;
}

async function loadManifest() {
  return JSON.parse(await readFile(manifestPath, "utf8"));
}

async function verify() {
  const manifest = await loadManifest();
  const release = await verifyDirectory(siteDir, manifest);
  console.log(`verified ${release.fileCount} files, ${release.byteCount} bytes`);
  console.log(release.artifactDigest);
  return release;
}

async function build() {
  const release = await verify();
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  await cp(siteDir, distDir, { recursive: true, errorOnExist: true });
  await verifyDirectory(distDir, await loadManifest());
  console.log("built reproducible dist/");
  return release;
}

async function inventory() {
  const scan = await collect(siteDir);
  privacyScan(scan.files);
  const release = releaseFrom(scan);
  await writeFile(manifestPath, `${JSON.stringify(release, null, 2)}\n`, {
    flag: "wx",
  });
  console.log(`wrote ${path.relative(root, manifestPath)}`);
}

const command = process.argv[2] ?? "verify";
if (command === "inventory") {
  await inventory();
} else if (command === "verify") {
  await verify();
} else if (command === "build") {
  await build();
} else if (command === "test") {
  await build();
  console.log("all public distribution tests passed");
} else {
  fail(`unknown command: ${command}`);
}
