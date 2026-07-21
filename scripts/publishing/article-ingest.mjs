import { randomBytes } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { load as parseYaml } from 'js-yaml';

import {
  compileArticlePackages,
  createPublishingContext,
  repositoryRoot,
  validateArticlePackage,
  validateNormalizedArticleUniqueness,
} from './article-compiler.mjs';
import { normalizedArticleRoute } from './contracts.mjs';

const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_ARTICLE_BYTES = 1024 * 1024;
const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 25 * 1024 * 1024;
const SAFE_MEDIA_EXTENSIONS = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.webp']);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function packageLabel(root, target) {
  const relative = path.relative(root, target).replaceAll('\\', '/');
  return relative && !relative.startsWith('../') ? relative : path.basename(target);
}

function hasSafeMediaSignature(filePath, extension) {
  const data = readFileSync(filePath);
  if (extension === '.png') return data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (extension === '.jpg' || extension === '.jpeg') return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (extension === '.gif') return ['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString('ascii'));
  if (extension === '.webp') return data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP';
  if (extension === '.avif') return data.length >= 12 && data.subarray(4, 8).toString('ascii') === 'ftyp' && /^(?:avif|avis|mif1|msf1)$/.test(data.subarray(8, 12).toString('ascii'));
  return false;
}

export function inspectIngestPackage(sourceDirectory) {
  const source = path.resolve(sourceDirectory);
  assert(existsSync(source), `Ingest source does not exist: ${sourceDirectory}`);
  const sourceStatus = lstatSync(source);
  assert(sourceStatus.isDirectory() && !sourceStatus.isSymbolicLink(), 'Ingest source must be a real directory, not a symlink.');

  const files = [];
  let totalBytes = 0;
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(source, absolute).replaceAll('\\', '/');
      const segments = relative.split('/');
      assert(relative !== '' && !path.isAbsolute(relative) && !relative.startsWith('../') && !segments.includes('..'), `${relative}: absolute paths and traversal are not allowed.`);
      assert(!entry.name.includes('\\') && !entry.name.includes('\0'), `${relative}: unsafe path name.`);
      const status = lstatSync(absolute);
      assert(!status.isSymbolicLink(), `${relative}: symlinks are not allowed.`);
      if (status.isDirectory()) {
        assert(relative === 'media' || relative.startsWith('media/'), `${relative}: unexpected directory.`);
        walk(absolute);
        continue;
      }
      assert(status.isFile(), `${relative}: only regular files are allowed.`);
      const topLevel = !relative.includes('/');
      assert((topLevel && ['manifest.yaml', 'article.md'].includes(relative)) || relative.startsWith('media/'), `${relative}: unexpected file.`);
      const extension = path.extname(entry.name).toLowerCase();
      const maximum = relative === 'manifest.yaml' ? MAX_MANIFEST_BYTES : relative === 'article.md' ? MAX_ARTICLE_BYTES : MAX_MEDIA_BYTES;
      assert(status.size <= maximum, `${relative}: file exceeds ${maximum} bytes.`);
      if (relative.startsWith('media/')) {
        assert(SAFE_MEDIA_EXTENSIONS.has(extension), `${relative}: unsafe media extension.`);
        assert(hasSafeMediaSignature(absolute, extension), `${relative}: unsafe or mismatched media signature.`);
      }
      totalBytes += status.size;
      assert(totalBytes <= MAX_PACKAGE_BYTES, `Package exceeds ${MAX_PACKAGE_BYTES} bytes.`);
      files.push(Object.freeze({ absolute, relative, size: status.size }));
    }
  };
  walk(source);
  assert(files.some(({ relative }) => relative === 'manifest.yaml'), 'Package requires manifest.yaml.');
  assert(files.some(({ relative }) => relative === 'article.md'), 'Package requires article.md.');
  const manifest = parseYaml(readFileSync(path.join(source, 'manifest.yaml'), 'utf8'));
  assert(manifest && typeof manifest === 'object' && !Array.isArray(manifest), 'manifest.yaml must contain a mapping.');
  return Object.freeze({ source, files: Object.freeze(files), manifest, totalBytes });
}

function copyInspectedPackage(inventory, destination) {
  mkdirSync(destination, { recursive: false });
  for (const file of inventory.files) {
    const target = path.join(destination, ...file.relative.split('/'));
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(file.absolute, target);
  }
  const copied = inspectIngestPackage(destination);
  assert(copied.totalBytes === inventory.totalBytes, 'Package changed while it was copied into secure staging.');
  return copied;
}

function assertDraftIngest(compiled, label) {
  const { manifest } = compiled;
  assert(manifest.workflow.state !== 'published', `${label}: ingestion cannot publish; use a non-published workflow state.`);
  assert(manifest.approvalId === null, `${label}: ingestion requires approvalId null so publication approval is a separate action.`);
}

function validateCandidateAgainstCanonical(candidate, canonical, update, targetExists) {
  const normalized = candidate.normalizedArticle;
  const existingIndex = canonical.allCompiled.findIndex(({ normalizedArticle }) => (
    normalizedArticle.id === normalized.id
    || normalizedArticle.slug === normalized.slug
    || normalizedArticle.route === normalized.route
  ));
  if (!update) {
    assert(!targetExists && existingIndex === -1, `Article ${normalized.id}: ID, slug, or route already exists; use explicit --update mode.`);
  } else {
    assert(targetExists && existingIndex !== -1, `Article ${normalized.id}: --update requires an existing canonical article package.`);
    const existing = canonical.allCompiled[existingIndex].normalizedArticle;
    assert(existing.sourceKind === 'article-package', `Article ${normalized.id}: --update cannot replace a non-package source.`);
    assert(existing.id === normalized.id && existing.slug === normalized.slug && existing.route === normalized.route, `Article ${normalized.id}: update identity and route must remain unchanged.`);
  }
  const candidates = canonical.allCompiled.map(({ normalizedArticle }) => normalizedArticle);
  if (existingIndex === -1) candidates.push(normalized);
  else candidates.splice(existingIndex, 1, normalized);
  validateNormalizedArticleUniqueness(candidates);
  const routes = new Set(candidates.map(({ route }) => route));
  for (const relatedId of normalized.relatedArticleIds) {
    assert(relatedId !== normalized.id && routes.has(normalizedArticleRoute(relatedId)), `Article ${normalized.id}: unresolved or self-related article ${relatedId}.`);
  }
}

export async function ingestArticlePackage(sourceDirectory, { root = repositoryRoot, update = false } = {}) {
  const canonicalRoot = path.resolve(root);
  const articleRoot = path.join(canonicalRoot, 'content', 'articles');
  assert(existsSync(articleRoot) && lstatSync(articleRoot).isDirectory(), 'Canonical content/articles directory is missing.');
  const sourceInventory = inspectIngestPackage(sourceDirectory);
  const slug = sourceInventory.manifest.slug;
  assert(typeof slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug), 'Manifest slug must be a canonical lowercase ID before staging.');
  assert(path.basename(sourceInventory.source) === slug, 'Source directory name must exactly match manifest slug.');

  const nonce = `${process.pid}-${randomBytes(8).toString('hex')}`;
  const stagingRoot = path.join(articleRoot, `.ingest-${nonce}`);
  const stagedPackage = path.join(stagingRoot, slug);
  const target = path.join(articleRoot, slug);
  const backupRoot = path.join(articleRoot, `.ingest-backup-${nonce}`);
  const backup = path.join(backupRoot, slug);
  const lockRoot = path.join(articleRoot, '.article-ingest.lock');
  let targetMoved = false;
  try {
    mkdirSync(lockRoot, { recursive: false });
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error('Another article ingest is active; canonical content was not changed.');
    throw error;
  }
  try {
    mkdirSync(stagingRoot, { recursive: false });
    copyInspectedPackage(sourceInventory, stagedPackage);
    const context = await createPublishingContext(canonicalRoot);
    const candidate = validateArticlePackage(stagedPackage, context);
    assertDraftIngest(candidate, packageLabel(canonicalRoot, stagedPackage));
    const canonical = await compileArticlePackages({ root: canonicalRoot });
    const targetExists = existsSync(target);
    validateCandidateAgainstCanonical(candidate, canonical, update, targetExists);

    if (update) {
      mkdirSync(backupRoot, { recursive: false });
      renameSync(target, backup);
      targetMoved = true;
    }
    renameSync(stagedPackage, target);
    targetMoved = false;
    rmSync(stagingRoot, { recursive: true, force: true });
    if (update) rmSync(backupRoot, { recursive: true, force: true });
    return Object.freeze({ id: candidate.manifest.id, slug, route: candidate.normalizedArticle.route, mode: update ? 'update' : 'create', published: false });
  } catch (error) {
    if (targetMoved && !existsSync(target) && existsSync(backup)) renameSync(backup, target);
    rmSync(stagingRoot, { recursive: true, force: true });
    rmSync(backupRoot, { recursive: true, force: true });
    throw error;
  } finally {
    rmSync(lockRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const update = args.includes('--update');
  const paths = args.filter((argument) => argument !== '--update');
  assert(paths.length === 1 && args.every((argument) => argument === '--update' || !argument.startsWith('--')), 'Usage: article-ingest.mjs <package-directory> [--update]');
  const result = await ingestArticlePackage(paths[0], { update });
  process.stdout.write(`Ingested ${result.id} in ${result.mode} mode as non-published canonical content. Run article:compile separately.\n`);
}
