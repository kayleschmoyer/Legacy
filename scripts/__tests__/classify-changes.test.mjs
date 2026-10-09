/**
 * Tests for scripts/classify-changes.js (LS-8718).
 *
 * Run via: pnpm run test:scripts
 * Or:      node --test scripts/__tests__/classify-changes.test.mjs
 *
 * Reproduces the stale-but-valid-ancestor `origin/main` bug: a local
 * remote-tracking ref that lags behind the real origin/main (but is still a
 * true ancestor in the object graph, e.g. via a container's lazily-synced
 * git-proxy cache) makes `git merge-base` resolve against the older commit,
 * so the branch's diff is inflated with unrelated commits that landed on
 * main between the stale point and the true fork point. `refreshBaseRef`
 * must fetch `origin/main` before diffing so this can't happen.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { classify, refreshBaseRef } = require(
  join(__dirname, '..', 'classify-changes.js'),
);

function git(cwd, args) {
  return execFileSync('git', args, { cwd, stdio: 'pipe' }).toString().trim();
}

/**
 * Builds a bare "remote" plus a local clone that has fully fetched the
 * remote's history (so both commits' objects are present locally), then
 * winds the local `origin/main` ref back to simulate a stale git-proxy
 * cache — exactly what the LS-8718 incident described: the checkout has
 * the current objects, but the cached remote-tracking ref lags behind.
 */
function makeFixture() {
  const remoteRoot = mkdtempSync(join(tmpdir(), 'classify-changes-remote-'));
  git(remoteRoot, ['init', '-q', '--bare', '--initial-branch=main']);

  const seedRoot = mkdtempSync(join(tmpdir(), 'classify-changes-seed-'));
  git(seedRoot, ['init', '-q', '--initial-branch=main']);
  git(seedRoot, ['config', 'user.email', 'test@example.com']);
  git(seedRoot, ['config', 'user.name', 'Test']);
  writeFileSync(join(seedRoot, 'base.txt'), 'base');
  git(seedRoot, ['add', '-A']);
  git(seedRoot, ['commit', '-q', '-m', 'base']);
  git(seedRoot, ['remote', 'add', 'origin', remoteRoot]);
  git(seedRoot, ['push', '-q', 'origin', 'main']);
  const staleSha = git(seedRoot, ['rev-parse', 'HEAD']);

  // An unrelated DB change lands on main after the stale point.
  mkdirSync(join(seedRoot, 'lib', 'db-client'), { recursive: true });
  writeFileSync(join(seedRoot, 'lib', 'db-client', 'schema.sql'), 'unrelated');
  git(seedRoot, ['add', '-A']);
  git(seedRoot, ['commit', '-q', '-m', 'unrelated db change on main']);
  git(seedRoot, ['push', '-q', 'origin', 'main']);
  const currentSha = git(seedRoot, ['rev-parse', 'HEAD']);

  // Local clone fetches full history (has both commits' objects), then the
  // feature branch forks from the true current main tip.
  const localRoot = mkdtempSync(join(tmpdir(), 'classify-changes-local-'));
  git(localRoot, ['clone', '-q', remoteRoot, localRoot]);
  git(localRoot, ['config', 'user.email', 'test@example.com']);
  git(localRoot, ['config', 'user.name', 'Test']);
  git(localRoot, ['checkout', '-q', '-b', 'feature', currentSha]);
  writeFileSync(join(localRoot, 'feature.txt'), 'feature');
  git(localRoot, ['add', '-A']);
  git(localRoot, ['commit', '-q', '-m', 'feature change']);

  // Wind the cached remote-tracking ref back to simulate a stale
  // git-proxy cache, even though the objects for `currentSha` are present.
  git(localRoot, ['update-ref', 'refs/remotes/origin/main', staleSha]);

  return { remoteRoot, seedRoot, localRoot, staleSha, currentSha };
}

test('reproduction: a stale-but-ancestor cached origin/main ref inflates the raw diff with unrelated DB changes', () => {
  // Documents the LS-8718 bug mechanism directly against git (bypassing
  // classify(), which now always refreshes first) — merge-base resolves
  // against the stale ref since it's a true ancestor of HEAD, so the diff
  // spans every commit main picked up between the stale point and HEAD's
  // real fork point, not just the branch's own change.
  const { localRoot, staleSha } = makeFixture();
  try {
    assert.equal(git(localRoot, ['rev-parse', 'origin/main']), staleSha);
    assert.equal(
      git(localRoot, ['merge-base', 'origin/main', 'HEAD']),
      staleSha,
    );

    const diff = git(localRoot, ['diff', '--name-only', 'origin/main...HEAD']);
    assert.match(diff, /lib\/db-client\/schema\.sql/);
  } finally {
    rmSync(localRoot, { recursive: true, force: true });
  }
});

test('classify() refreshes origin/main before diffing, fixing the misclassification', () => {
  const { localRoot, staleSha, currentSha } = makeFixture();
  const originalCwd = process.cwd();
  try {
    process.chdir(localRoot);
    assert.equal(git(localRoot, ['rev-parse', 'origin/main']), staleSha);

    const result = classify('origin/main');

    // classify() must have refreshed the ref to the true current tip...
    assert.equal(git(localRoot, ['rev-parse', 'origin/main']), currentSha);
    // ...so merge-base resolves to the real fork point and only the
    // feature branch's own commit shows up in the diff.
    assert.equal(result.hasDb, false);
  } finally {
    process.chdir(originalCwd);
    rmSync(localRoot, { recursive: true, force: true });
  }
});

test('refreshBaseRef fetches origin/main before diffing, fixing the misclassification', () => {
  const { localRoot, currentSha } = makeFixture();
  const originalCwd = process.cwd();
  try {
    process.chdir(localRoot);

    refreshBaseRef('origin/main');
    assert.equal(git(localRoot, ['rev-parse', 'origin/main']), currentSha);

    const refreshed = classify('origin/main');
    // Once origin/main is current, merge-base resolves to the true fork
    // point, so only the feature branch's own commit is in the diff.
    assert.equal(refreshed.hasDb, false);
  } finally {
    process.chdir(originalCwd);
    rmSync(localRoot, { recursive: true, force: true });
  }
});

test('refreshBaseRef is a no-op for non-origin base refs', () => {
  assert.doesNotThrow(() => refreshBaseRef('main'));
  assert.doesNotThrow(() => refreshBaseRef('HEAD~1'));
});

/**
 * PC_HAS_PS1 flag (LS-8729): make pc-test only runs `nx affected -t test`,
 * which never exercises scripts/__tests__/*.ps1 since scripts/ isn't an Nx
 * project. classify() must flag scripts/**\/*.ps1 changes so pc-test can
 * additionally run `pnpm run test:scripts:ps` when relevant.
 */
function makeSimpleFixture() {
  const root = mkdtempSync(join(tmpdir(), 'classify-changes-ps1-'));
  git(root, ['init', '-q', '--initial-branch=main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
  writeFileSync(join(root, 'base.txt'), 'base');
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'base']);
  git(root, ['checkout', '-q', '-b', 'feature']);
  return root;
}

test('classify() sets hasPs1 when a scripts/*.ps1 file changed', () => {
  const root = makeSimpleFixture();
  const originalCwd = process.cwd();
  try {
    mkdirSync(join(root, 'scripts', '__tests__'), { recursive: true });
    writeFileSync(
      join(root, 'scripts', '__tests__', 'new-thing.test.ps1'),
      '# ps1 test',
    );
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'add ps1 test']);

    process.chdir(root);
    const result = classify('main');
    assert.equal(result.hasPs1, true);
  } finally {
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
  }
});

test('classify() leaves hasPs1 false when no .ps1 files changed', () => {
  const root = makeSimpleFixture();
  const originalCwd = process.cwd();
  try {
    writeFileSync(join(root, 'unrelated.ts'), 'export const x = 1;');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'unrelated change']);

    process.chdir(root);
    const result = classify('main');
    assert.equal(result.hasPs1, false);
  } finally {
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * PC_HAS_GH_SCRIPTS flag (LS-9964): `.github/scripts/` has no nx project.json,
 * so `nx affected -t test` (make pc-test) is structurally blind to its unit
 * suites — a change confined there yields "No tasks were run" and exits 0.
 * classify() must flag those changes so pc-workflows can run the suites
 * directly via `pnpm run test:github-scripts`.
 */
test('classify() sets hasGithubScripts when a .github/scripts file changed', () => {
  const root = makeSimpleFixture();
  const originalCwd = process.cwd();
  try {
    mkdirSync(join(root, '.github', 'scripts', '__tests__'), {
      recursive: true,
    });
    writeFileSync(
      join(root, '.github', 'scripts', '__tests__', 'thing.test.mjs'),
      '// test',
    );
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'add github script test']);

    process.chdir(root);
    const result = classify('main');
    assert.equal(result.hasGithubScripts, true);
  } finally {
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
  }
});

test('classify() leaves hasGithubScripts false for .github/workflows-only changes', () => {
  const root = makeSimpleFixture();
  const originalCwd = process.cwd();
  try {
    mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'name: ci');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'workflow-only change']);

    process.chdir(root);
    const result = classify('main');
    assert.equal(result.hasGithubScripts, false);
    assert.equal(result.hasWorkflows, true);
  } finally {
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
  }
});

test('classify() sets hasWorkflows for .github/actions-only changes (LS-10351)', () => {
  const root = makeSimpleFixture();
  const originalCwd = process.cwd();
  try {
    mkdirSync(join(root, '.github', 'actions', 'setup'), { recursive: true });
    writeFileSync(
      join(root, '.github', 'actions', 'setup', 'action.yml'),
      'name: setup',
    );
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'composite-action-only change']);

    process.chdir(root);
    const result = classify('main');
    assert.equal(result.hasWorkflows, true);
    assert.equal(result.hasGithubScripts, false);
  } finally {
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * PC_HAS_ROOT_SCRIPTS flag (LS-10178): scripts/ has no nx project.json
 * either, so `nx affected -t test` (make pc-test) is just as blind to
 * scripts/__tests__/*.test.mjs as it is to .github/scripts/'s suites —
 * a change confined to scripts/ yielded a green pc-test that never ran
 * the suite CI's custom-checks job gates on via test:scripts. classify()
 * must flag those changes so pc-test can run test:scripts directly.
 */
test('classify() sets hasRootScripts when a scripts/ file changed', () => {
  const root = makeSimpleFixture();
  const originalCwd = process.cwd();
  try {
    mkdirSync(join(root, 'scripts', '__tests__'), { recursive: true });
    writeFileSync(
      join(root, 'scripts', '__tests__', 'new-thing.test.mjs'),
      '// test',
    );
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'add root script test']);

    process.chdir(root);
    const result = classify('main');
    assert.equal(result.hasRootScripts, true);
  } finally {
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
  }
});

test('classify() leaves hasRootScripts false when no scripts/ files changed', () => {
  const root = makeSimpleFixture();
  const originalCwd = process.cwd();
  try {
    writeFileSync(join(root, 'unrelated.ts'), 'export const x = 1;');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'unrelated change']);

    process.chdir(root);
    const result = classify('main');
    assert.equal(result.hasRootScripts, false);
  } finally {
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
  }
});

test('classify() leaves hasRootScripts false for .github/scripts-only changes', () => {
  const root = makeSimpleFixture();
  const originalCwd = process.cwd();
  try {
    mkdirSync(join(root, '.github', 'scripts', '__tests__'), {
      recursive: true,
    });
    writeFileSync(
      join(root, '.github', 'scripts', '__tests__', 'thing.test.mjs'),
      '// test',
    );
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'github script change only']);

    process.chdir(root);
    const result = classify('main');
    assert.equal(result.hasRootScripts, false);
    assert.equal(result.hasGithubScripts, true);
  } finally {
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * LS-10202: uncommitted work (0 commits ahead of base) must be classified from
 * the working tree instead of tripping the "no changes" fail-safe.
 */
test('classify() scopes uncommitted tracked changes instead of the no-changes fail-safe', () => {
  const root = makeSimpleFixture();
  const originalCwd = process.cwd();
  try {
    writeFileSync(join(root, 'base.txt'), 'edited');
    process.chdir(root);
    const result = classify('main');
    assert.equal(result.reason, null);
    assert.equal(result.hasDb, false);
    assert.equal(result.hasWorkflows, false);
    assert.equal(result.hasGithubScripts, false);
    assert.equal(result.hasPs1, false);
    assert.equal(result.hasRootScripts, false);
  } finally {
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
  }
});

test('classify() detects untracked and staged files', () => {
  const root = makeSimpleFixture();
  const originalCwd = process.cwd();
  try {
    mkdirSync(join(root, 'scripts'), { recursive: true });
    writeFileSync(join(root, 'scripts', 'new.mjs'), '// untracked');
    mkdirSync(join(root, 'lib', 'db-client'), { recursive: true });
    writeFileSync(join(root, 'lib', 'db-client', 'x.sql'), 'staged');
    git(root, ['add', 'lib/db-client/x.sql']);
    process.chdir(root);
    const result = classify('main');
    assert.equal(result.reason, null);
    assert.equal(result.hasRootScripts, true);
    assert.equal(result.hasDb, true);
    assert.equal(result.hasWorkflows, false);
  } finally {
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
  }
});

test('classify() still fail-safes when nothing at all changed', () => {
  const root = makeSimpleFixture();
  const originalCwd = process.cwd();
  try {
    process.chdir(root);
    const result = classify('main');
    assert.equal(result.reason, 'no-changes');
    assert.equal(result.hasWorkflows, true);
  } finally {
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
  }
});

test('refreshBaseRef does not throw when the fetch fails (offline fail-safe)', () => {
  const root = mkdtempSync(join(tmpdir(), 'classify-changes-noremote-'));
  const originalCwd = process.cwd();
  try {
    git(root, ['init', '-q', '--initial-branch=main']);
    git(root, ['config', 'user.email', 'test@example.com']);
    git(root, ['config', 'user.name', 'Test']);
    writeFileSync(join(root, 'a.txt'), 'a');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'init']);
    // No `origin` remote configured — fetch must fail, not throw.
    process.chdir(root);
    assert.doesNotThrow(() => refreshBaseRef('origin/main'));
  } finally {
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
  }
});
