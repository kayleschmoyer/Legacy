/**
 * Tests for scripts/hash-design-bundle.mjs (LS-9020).
 *
 * Run via: pnpm run test:scripts
 * Or:      node --test scripts/__tests__/hash-design-bundle.test.mjs
 *
 * Verifies the hash matches the algorithm documented in
 * .agents/skills/design-sync/references/manifest-schema.md §Hashing:
 * sorted relative-path list, per-file sha256, tab/newline-joined manifest
 * string, sha256 of that string prefixed with "sha256-".
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import { hashBundle } from '../hash-design-bundle.mjs';

// hashBundle rejects any dir outside the repo, so fixtures must live under a
// repo-relative scratch dir rather than the system tmpdir.
const scratchRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'scratch',
  'hash-design-bundle-tests',
);
mkdirSync(scratchRoot, { recursive: true });

function sha256Hex(input) {
  return createHash('sha256').update(input).digest('hex');
}

function makeBundle(files) {
  const root = mkdtempSync(join(scratchRoot, 'bundle-'));
  for (const [relPath, content] of Object.entries(files)) {
    const full = join(root, relPath);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

test('hashBundle matches the documented algorithm', () => {
  const root = makeBundle({
    'project/index.html': '<html></html>',
    'README.md': '# hello',
    'chats/chat1.md': 'transcript',
  });
  try {
    const { hash, fileCount } = hashBundle(root);
    const expectedManifest = [
      'README.md',
      'chats/chat1.md',
      'project/index.html',
    ]
      .map((p) => `${p}\t${sha256Hex(readFileSync(join(root, p)))}\n`)
      .join('');
    assert.equal(fileCount, 3);
    assert.equal(hash, `sha256-${sha256Hex(expectedManifest)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('hashBundle excludes SYNC-REPORT.md', () => {
  const root = makeBundle({
    'project/index.html': '<html></html>',
    'SYNC-REPORT.md': 'this must never affect the hash',
  });
  try {
    const withoutReport = hashBundle(root);
    writeFileSync(
      join(root, 'SYNC-REPORT.md'),
      'changed content, still excluded',
    );
    const afterEdit = hashBundle(root);
    assert.equal(withoutReport.hash, afterEdit.hash);
    assert.equal(withoutReport.fileCount, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('hashBundle is order-independent (directory listing order does not matter)', () => {
  const rootA = makeBundle({
    'b.txt': 'B',
    'a.txt': 'A',
  });
  const rootB = makeBundle({
    'a.txt': 'A',
    'b.txt': 'B',
  });
  try {
    assert.equal(hashBundle(rootA).hash, hashBundle(rootB).hash);
  } finally {
    rmSync(rootA, { recursive: true, force: true });
    rmSync(rootB, { recursive: true, force: true });
  }
});

test('hashBundle changes when a single byte changes', () => {
  const root = makeBundle({ 'project/index.html': 'v1' });
  try {
    const before = hashBundle(root).hash;
    writeFileSync(join(root, 'project', 'index.html'), 'v2');
    const after = hashBundle(root).hash;
    assert.notEqual(before, after);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('hashBundle throws on a missing directory', () => {
  assert.throws(() =>
    hashBundle(join(scratchRoot, 'does-not-exist-hash-bundle')),
  );
});

test('hashBundle rejects a bundleDir outside the repo', () => {
  assert.throws(() => hashBundle('/etc'), /must resolve inside the repo/);
  assert.throws(
    () => hashBundle(mkdtempSync(join(tmpdir(), 'outside-repo-'))),
    /must resolve inside the repo/,
  );
});
