import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { dump as dumpYaml, load as parseYaml } from 'js-yaml';

import { ingestArticlePackage, inspectIngestPackage } from '../scripts/publishing/article-ingest.mjs';

const sourceRepository = process.cwd();

function copyPath(root, relative) {
  cpSync(path.join(sourceRepository, relative), path.join(root, relative), { recursive: true });
}

function fixtureRepository() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'hb-ingest-repo-'));
  copyPath(root, '.gitignore');
  for (const relative of ['content', 'src/config', 'src/content/docs', 'src/generated/publishing', 'schemas/generated']) copyPath(root, relative);
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'fixture@howbiscuit.invalid'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'How Biscuit Fixture'], { cwd: root });
  execFileSync('git', ['add', '--', 'src/content/docs', 'content/latex/articles'], { cwd: root });
  return root;
}

function candidateFrom(root, slug) {
  const candidateRoot = mkdtempSync(path.join(os.tmpdir(), 'hb-ingest-candidate-'));
  const candidate = path.join(candidateRoot, slug);
  cpSync(path.join(root, 'content', 'articles', slug), candidate, { recursive: true });
  return { candidateRoot, candidate };
}

function readYaml(filePath) {
  return parseYaml(readFileSync(filePath, 'utf8'));
}

function writeYaml(filePath, value) {
  writeFileSync(filePath, dumpYaml(value, { noRefs: true, lineWidth: 120 }), 'utf8');
}

function invalidateApproval(candidate) {
  const manifestPath = path.join(candidate, 'manifest.yaml');
  const manifest = readYaml(manifestPath);
  manifest.approvalId = null;
  manifest.workflow.state = 'approved';
  manifest.workflow.history = manifest.workflow.history.filter(({ state }) => state !== 'published');
  writeYaml(manifestPath, manifest);
  return manifest;
}

function stagingEntries(root) {
  return readdirSync(path.join(root, 'content', 'articles')).filter((name) => name.startsWith('.ingest-'));
}

test('secure ingest atomically updates a valid standard package without publishing or generating output', async () => {
  const root = fixtureRepository();
  const { candidateRoot, candidate } = candidateFrom(root, 'how-does-baking-powder-work');
  try {
    const manifest = invalidateApproval(candidate);
    const generatedPath = path.join(root, 'src', 'generated', 'publishing', 'articles.v1.json');
    const generatedBefore = readFileSync(generatedPath, 'utf8');
    const result = await ingestArticlePackage(candidate, { root, update: true });
    assert.deepEqual(result, { id: manifest.id, slug: manifest.slug, route: `/articles/${manifest.slug}/`, mode: 'update', published: false });
    assert.equal(readYaml(path.join(root, 'content', 'articles', manifest.slug, 'manifest.yaml')).approvalId, null);
    assert.equal(readFileSync(generatedPath, 'utf8'), generatedBefore);
    assert.deepEqual(stagingEntries(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(candidateRoot, { recursive: true, force: true });
  }
});

test('secure ingest accepts a valid categoryless editorial-standard update', async () => {
  const root = fixtureRepository();
  const { candidateRoot, candidate } = candidateFrom(root, 'why-are-some-answers-better-than-others');
  try {
    const manifest = invalidateApproval(candidate);
    assert.equal(manifest.articleType, 'editorial-standard');
    assert.equal(manifest.categoryId, null);
    const result = await ingestArticlePackage(candidate, { root, update: true });
    assert.equal(result.published, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(candidateRoot, { recursive: true, force: true });
  }
});

test('secure ingest creates a new draft only after canonical governance resolves', async () => {
  const root = fixtureRepository();
  const original = 'how-does-baking-powder-work';
  const slug = 'fixture-new-standard-article';
  const candidateRoot = mkdtempSync(path.join(os.tmpdir(), 'hb-ingest-new-'));
  const candidate = path.join(candidateRoot, slug);
  cpSync(path.join(root, 'content', 'articles', original), candidate, { recursive: true });
  try {
    const manifestPath = path.join(candidate, 'manifest.yaml');
    const manifest = readYaml(manifestPath);
    Object.assign(manifest, {
      id: slug,
      slug,
      title: 'Fixture New Standard Article',
      ideaId: `idea-${slug}`,
      briefId: `brief-${slug}`,
      approvalId: null,
      relatedArticleIds: [original],
      workflow: { state: 'draft', history: [{ state: 'draft', at: '2026-07-20', actor: 'ingest-fixture' }] },
    });
    manifest.testingIds = [`testing-${slug}`];
    writeYaml(manifestPath, manifest);

    const idea = readYaml(path.join(root, 'content', 'ideas', `${original}.yaml`));
    idea.id = `idea-${slug}`;
    idea.title = 'Fixture new governed standard article';
    writeYaml(path.join(root, 'content', 'ideas', `${idea.id}.yaml`), idea);
    const brief = readYaml(path.join(root, 'content', 'briefs', `${original}.yaml`));
    brief.id = `brief-${slug}`;
    brief.ideaId = idea.id;
    brief.intendedArticleId = slug;
    writeYaml(path.join(root, 'content', 'briefs', `${brief.id}.yaml`), brief);
    const testing = readYaml(path.join(root, 'content', 'testing', `${original}.yaml`));
    testing.id = `testing-${slug}`;
    testing.articleId = slug;
    writeYaml(path.join(root, 'content', 'testing', `${testing.id}.yaml`), testing);

    const result = await ingestArticlePackage(candidate, { root });
    assert.equal(result.mode, 'create');
    assert.equal(result.published, false);
    assert(lstatSync(path.join(root, 'content', 'articles', slug)).isDirectory());
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(candidateRoot, { recursive: true, force: true });
  }
});

test('ingest rejects duplicate identity without explicit update mode and preserves canonical content', async () => {
  const root = fixtureRepository();
  const slug = 'how-does-baking-powder-work';
  const { candidateRoot, candidate } = candidateFrom(root, slug);
  try {
    invalidateApproval(candidate);
    const targetManifest = path.join(root, 'content', 'articles', slug, 'manifest.yaml');
    const before = readFileSync(targetManifest, 'utf8');
    await assert.rejects(() => ingestArticlePackage(candidate, { root }), /use explicit --update mode/);
    assert.equal(readFileSync(targetManifest, 'utf8'), before);
    assert.deepEqual(stagingEntries(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(candidateRoot, { recursive: true, force: true });
  }
});

test('ingest rejects stale publication approval and preserves the old package', async () => {
  const root = fixtureRepository();
  const slug = 'how-does-baking-powder-work';
  const { candidateRoot, candidate } = candidateFrom(root, slug);
  try {
    const targetManifest = path.join(root, 'content', 'articles', slug, 'manifest.yaml');
    const before = readFileSync(targetManifest, 'utf8');
    await assert.rejects(() => ingestArticlePackage(candidate, { root, update: true }), /ingestion cannot publish/);
    assert.equal(readFileSync(targetManifest, 'utf8'), before);
    assert.deepEqual(stagingEntries(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(candidateRoot, { recursive: true, force: true });
  }
});

test('ingest rejects unexpected files, unsafe media, oversized input, and invalid directives before mutation', async () => {
  const cases = [
    ['unexpected file', (candidate) => writeFileSync(path.join(candidate, 'notes.txt'), 'not allowed', 'utf8'), /unexpected file/],
    ['unsafe media', (candidate) => { mkdirSync(path.join(candidate, 'media')); writeFileSync(path.join(candidate, 'media', 'payload.svg'), '<svg/>', 'utf8'); }, /unsafe media extension/],
    ['mismatched media', (candidate) => { mkdirSync(path.join(candidate, 'media')); writeFileSync(path.join(candidate, 'media', 'fake.png'), 'not a png', 'utf8'); }, /mismatched media signature/],
    ['oversized article', (candidate) => writeFileSync(path.join(candidate, 'article.md'), Buffer.alloc(1024 * 1024 + 1, 0x61)), /file exceeds/],
    ['invalid directive', (candidate) => writeFileSync(path.join(candidate, 'article.md'), '::unknown{value="x"}\n', 'utf8'), /unknown directive/],
  ];
  for (const [label, mutate, expected] of cases) {
    const root = fixtureRepository();
    const slug = 'how-does-baking-powder-work';
    const { candidateRoot, candidate } = candidateFrom(root, slug);
    try {
      invalidateApproval(candidate);
      mutate(candidate);
      const before = readFileSync(path.join(root, 'content', 'articles', slug, 'manifest.yaml'), 'utf8');
      await assert.rejects(() => ingestArticlePackage(candidate, { root, update: true }), expected, label);
      assert.equal(readFileSync(path.join(root, 'content', 'articles', slug, 'manifest.yaml'), 'utf8'), before, label);
      assert.deepEqual(stagingEntries(root), [], label);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(candidateRoot, { recursive: true, force: true });
    }
  }
});

test('ingest rejects package and nested symlinks', { skip: process.platform === 'win32' ? 'Windows CI does not grant symlink creation.' : false }, async () => {
  const root = fixtureRepository();
  const slug = 'how-does-baking-powder-work';
  const { candidateRoot, candidate } = candidateFrom(root, slug);
  try {
    invalidateApproval(candidate);
    symlinkSync(path.join(candidate, 'article.md'), path.join(candidate, 'linked.md'));
    assert.throws(() => inspectIngestPackage(candidate), /symlinks are not allowed/);
    const linkedRoot = path.join(candidateRoot, 'linked-package');
    symlinkSync(candidate, linkedRoot, 'dir');
    await assert.rejects(() => ingestArticlePackage(linkedRoot, { root, update: true }), /real directory, not a symlink/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(candidateRoot, { recursive: true, force: true });
  }
});

test('failed validation leaves no partial package or staging directory', async () => {
  const root = fixtureRepository();
  const slug = 'how-does-baking-powder-work';
  const { candidateRoot, candidate } = candidateFrom(root, slug);
  try {
    invalidateApproval(candidate);
    writeFileSync(path.join(candidate, 'article.md'), '<script>alert(1)</script>\n', 'utf8');
    const target = path.join(root, 'content', 'articles', slug);
    const before = readFileSync(path.join(target, 'article.md'), 'utf8');
    await assert.rejects(() => ingestArticlePackage(candidate, { root, update: true }), /raw HTML, scripts, and JSX/);
    assert.equal(readFileSync(path.join(target, 'article.md'), 'utf8'), before);
    assert.deepEqual(stagingEntries(root), []);
    assert(existsSync(target));
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(candidateRoot, { recursive: true, force: true });
  }
});

test('concurrent same-repository ingests fail closed so exactly one validated writer commits', async () => {
  const root = fixtureRepository();
  const slug = 'how-does-baking-powder-work';
  const first = candidateFrom(root, slug);
  const second = candidateFrom(root, slug);
  try {
    invalidateApproval(first.candidate);
    invalidateApproval(second.candidate);
    const firstArticle = path.join(first.candidate, 'article.md');
    const secondArticle = path.join(second.candidate, 'article.md');
    writeFileSync(firstArticle, `${readFileSync(firstArticle, 'utf8')}\n\nFirst serialized candidate.\n`, 'utf8');
    writeFileSync(secondArticle, `${readFileSync(secondArticle, 'utf8')}\n\nSecond serialized candidate.\n`, 'utf8');
    const results = await Promise.allSettled([
      ingestArticlePackage(first.candidate, { root, update: true }),
      ingestArticlePackage(second.candidate, { root, update: true }),
    ]);
    assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
    const rejection = results.find(({ status }) => status === 'rejected');
    assert.match(rejection.reason.message, /Another article ingest is active/);
    const canonical = readFileSync(path.join(root, 'content', 'articles', slug, 'article.md'), 'utf8');
    assert.equal(/First serialized candidate\./.test(canonical) + /Second serialized candidate\./.test(canonical), 1);
    assert.deepEqual(stagingEntries(root), []);
    assert.equal(existsSync(path.join(root, 'content', 'articles', '.article-ingest.lock')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(first.candidateRoot, { recursive: true, force: true });
    rmSync(second.candidateRoot, { recursive: true, force: true });
  }
});
