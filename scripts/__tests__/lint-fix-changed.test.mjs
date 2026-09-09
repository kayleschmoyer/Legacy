/**
 * Tests for scripts/lint-fix-changed.js (LS-8777).
 *
 * Run via: pnpm run test:scripts
 * Or:      node --test scripts/__tests__/lint-fix-changed.test.mjs
 *
 * Pins the two behaviors the ticket depends on: config-root resolution walks
 * up to the nearest eslint.config.* (bounded by root), and grouping only
 * keeps lintable extensions, dropping deleted/renamed-away files.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { resolveConfigDir, groupByConfigDir, getChangedFiles } = require(
  resolve(__dirname, '..', 'lint-fix-changed.js'),
);

function git(root, args) {
  execFileSync('git', args, { cwd: root, stdio: 'pipe' });
}

/** Real temp git repo — exercises getChangedFiles against actual `git` output
 * rather than mocked child_process, so it pins real diff-filter/merge-base
 * behavior instead of an assumption about it. */
function makeGitFixture() {
  const root = mkdtempSync(join(tmpdir(), 'lint-fix-changed-git-'));
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
  writeFileSync(join(root, 'base.ts'), '');
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'base']);
  git(root, ['branch', 'main']);
  return root;
}

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'lint-fix-changed-'));
  mkdirSync(join(root, 'apps', 'web', 'src'), { recursive: true });
  mkdirSync(join(root, 'lib', 'utils', 'src'), { recursive: true });
  writeFileSync(join(root, 'eslint.config.mjs'), '');
  writeFileSync(join(root, 'apps', 'web', 'eslint.config.mjs'), '');
  writeFileSync(join(root, 'apps', 'web', 'src', 'Foo.tsx'), '');
  writeFileSync(join(root, 'lib', 'utils', 'src', 'bar.ts'), '');
  return root;
}

test('resolveConfigDir walks up to the nearest eslint.config.* directory', () => {
  const root = makeFixture();
  try {
    const nested = join(root, 'apps', 'web', 'src', 'Foo.tsx');
    assert.equal(resolveConfigDir(nested, root), join(root, 'apps', 'web'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resolveConfigDir falls back to root when no nearer config exists', () => {
  const root = makeFixture();
  try {
    const nested = join(root, 'lib', 'utils', 'src', 'bar.ts');
    assert.equal(resolveConfigDir(nested, root), root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('groupByConfigDir groups files by their nearest config root', () => {
  const root = makeFixture();
  try {
    const groups = groupByConfigDir(
      ['apps/web/src/Foo.tsx', 'lib/utils/src/bar.ts'],
      root,
    );
    assert.equal(groups.size, 2);
    assert.deepEqual(groups.get(join(root, 'apps', 'web')), ['src/Foo.tsx']);
    assert.deepEqual(groups.get(root), ['lib/utils/src/bar.ts']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('groupByConfigDir drops non-lintable extensions and deleted files', () => {
  const root = makeFixture();
  try {
    const groups = groupByConfigDir(
      [
        'apps/web/src/Foo.tsx',
        'apps/web/README.md', // not lintable
        'apps/web/src/DoesNotExist.ts', // deleted/renamed-away
      ],
      root,
    );
    const files = [...groups.values()].flat();
    assert.deepEqual(files, ['src/Foo.tsx']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('getChangedFiles returns committed, staged, unstaged, and untracked files vs base', () => {
  const root = makeGitFixture();
  try {
    git(root, ['checkout', '-q', '-b', 'feature']);
    writeFileSync(join(root, 'committed.ts'), '');
    git(root, ['add', 'committed.ts']);
    git(root, ['commit', '-q', '-m', 'add committed.ts']);
    writeFileSync(join(root, 'staged.ts'), '');
    git(root, ['add', 'staged.ts']);
    writeFileSync(join(root, 'base.ts'), 'changed');
    writeFileSync(join(root, 'untracked.ts'), '');

    const files = getChangedFiles('main', root).sort();
    assert.deepEqual(files, [
      'base.ts',
      'committed.ts',
      'staged.ts',
      'untracked.ts',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('getChangedFiles omits deleted files (--diff-filter=ACMR)', () => {
  const root = makeGitFixture();
  try {
    git(root, ['checkout', '-q', '-b', 'feature']);
    writeFileSync(join(root, 'to-delete.ts'), '');
    git(root, ['add', 'to-delete.ts']);
    git(root, ['commit', '-q', '-m', 'add to-delete.ts']);
    git(root, ['rm', '-q', 'to-delete.ts']);
    git(root, ['commit', '-q', '-m', 'remove to-delete.ts']);

    const files = getChangedFiles('main', root);
    assert.deepEqual(files, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('getChangedFiles returns [] with no changes vs base', () => {
  const root = makeGitFixture();
  try {
    git(root, ['checkout', '-q', '-b', 'feature']);
    assert.deepEqual(getChangedFiles('main', root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('getChangedFiles fails safe (returns null) when git errors', () => {
  const root = mkdtempSync(join(tmpdir(), 'lint-fix-changed-notgit-'));
  try {
    assert.equal(getChangedFiles('main', root), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
