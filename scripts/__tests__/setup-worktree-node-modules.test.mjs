/**
 * Tests for scripts/setup-worktree-node-modules.mjs.
 *
 * Run via: pnpm run test:scripts
 * Or:      node --test scripts/__tests__/setup-worktree-node-modules.test.mjs
 *
 * Uses node:test (built-in, no extra deps). The script is invoked as a child
 * process so we exercise the full CLI surface — argument parsing, exit codes,
 * stdout/stderr — rather than re-importing internals.
 *
 * Symlink-creation tests are skipped on Windows because mklink /D requires
 * Developer Mode, which is not reliably enabled in CI runners. The detection,
 * validation, and error-path tests run on every platform.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  symlinkSync,
  realpathSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, '..', 'setup-worktree-node-modules.mjs');
const IS_WINDOWS = process.platform === 'win32';

/**
 * Spawn the script as a child process and capture its outcome.
 * Always returns — never throws — so tests can assert on non-zero exits.
 */
function runScript(args = []) {
  try {
    const stdout = execFileSync('node', [SCRIPT, ...args], {
      encoding: 'utf-8',
      timeout: 15_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      code: err.status ?? -1,
      stdout: String(err.stdout ?? ''),
      stderr: String(err.stderr ?? ''),
    };
  }
}

/**
 * Build a fixture: a temporary directory that mirrors the
 * <main-repo>/.claude/worktrees/<wt> layout, with main repo node_modules
 * populated enough to satisfy the script's health checks (.bin/<bin> + nx/).
 *
 * Caller is responsible for `rmSync(root, { recursive: true, force: true })`.
 */
function makeFixture({ populated = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'wt-setup-test-'));
  const mainRepo = join(root, 'legacy-sports');
  const worktree = join(mainRepo, '.claude', 'worktrees', 'test-wt');
  mkdirSync(worktree, { recursive: true });

  if (populated) {
    const mainNm = join(mainRepo, 'node_modules');
    mkdirSync(join(mainNm, '.bin'), { recursive: true });
    mkdirSync(join(mainNm, 'nx'), { recursive: true });
    // tsx is what the SessionStart MCP precondition check looks for.
    writeFileSync(join(mainNm, '.bin', 'tsx'), '#!/bin/sh\nexit 0\n');
  }

  return { root, mainRepo, worktree };
}

// ---------------------------------------------------------------------------
// Auto-detection / argument handling
// ---------------------------------------------------------------------------

test('exits 1 with a helpful error when worktree is not in a known pattern', () => {
  const root = mkdtempSync(join(tmpdir(), 'wt-setup-test-'));
  try {
    const { code, stderr } = runScript([`--worktree=${root}`]);
    assert.equal(code, 1, 'should fail auto-detect for arbitrary tmp dir');
    assert.match(stderr, /Cannot auto-detect main repo/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('auto-detects main repo from native worktree pattern (.claude/worktrees/)', () => {
  const { root, worktree } = makeFixture();
  try {
    const { code, stdout } = runScript([`--worktree=${worktree}`]);
    // On Windows without Developer Mode the create step may fail, but
    // auto-detection should still succeed and print the resolved paths.
    const resolvedMain = realpathSync(join(root, 'legacy-sports'));
    assert.match(stdout, /main repo/);
    assert.ok(
      stdout.includes(resolvedMain) ||
        stdout.includes(join(root, 'legacy-sports')),
      `stdout should mention main repo path: ${stdout}`,
    );
    // Either created (0) or platform-blocked (1 with explanatory error).
    assert.ok(code === 0 || code === 1, `unexpected exit code ${code}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('auto-detects main repo from sibling worktree pattern (<repo>.worktrees/)', () => {
  const root = mkdtempSync(join(tmpdir(), 'wt-setup-test-'));
  const mainRepo = join(root, 'legacy-sports');
  const worktree = join(root, 'legacy-sports.worktrees', 'feature-x');
  mkdirSync(join(mainRepo, 'node_modules', '.bin'), { recursive: true });
  mkdirSync(join(mainRepo, 'node_modules', 'nx'), { recursive: true });
  writeFileSync(join(mainRepo, 'node_modules', '.bin', 'tsx'), '#!/bin/sh\n');
  mkdirSync(worktree, { recursive: true });

  try {
    const { code, stdout } = runScript([`--worktree=${worktree}`]);
    assert.match(stdout, /main repo/);
    // mainRepo path should appear somewhere in the script's output.
    assert.ok(
      stdout.includes(mainRepo) || stdout.includes(realpathSync(mainRepo)),
      `stdout should mention sibling main repo: ${stdout}`,
    );
    assert.ok(code === 0 || code === 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Error paths
// ---------------------------------------------------------------------------

test('exits 1 when main repo node_modules is missing', () => {
  const { root, worktree } = makeFixture({ populated: false });
  try {
    const { code, stderr } = runScript([`--worktree=${worktree}`]);
    assert.equal(code, 1);
    assert.match(stderr, /Main repo node_modules not found/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('exits 1 when node_modules is a real directory (not a symlink)', () => {
  const { root, worktree } = makeFixture();
  // Create a real directory at the link path — script must refuse to nuke it.
  mkdirSync(join(worktree, 'node_modules'), { recursive: true });
  try {
    const { code, stderr } = runScript([`--worktree=${worktree}`]);
    assert.equal(code, 1);
    assert.match(stderr, /node_modules is a real directory/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Symlink creation + idempotency (POSIX only — mklink /D needs Developer Mode)
// ---------------------------------------------------------------------------

test(
  'creates a symlink in a fresh worktree pointing at the main repo',
  { skip: IS_WINDOWS ? 'mklink /D requires Developer Mode' : false },
  () => {
    const { root, mainRepo, worktree } = makeFixture();
    try {
      const { code, stdout } = runScript([`--worktree=${worktree}`]);
      assert.equal(code, 0, `unexpected exit ${code}: ${stdout}`);
      const linkPath = join(worktree, 'node_modules');
      assert.ok(existsSync(linkPath), 'symlink should exist');
      // Resolves to the main repo's node_modules (not some other path).
      assert.equal(
        realpathSync(linkPath),
        realpathSync(join(mainRepo, 'node_modules')),
      );
      // tsx is reachable through the symlink (the original motivating use case).
      assert.ok(existsSync(join(linkPath, '.bin', 'tsx')));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  'is idempotent — second invocation reports the link is already healthy',
  { skip: IS_WINDOWS ? 'mklink /D requires Developer Mode' : false },
  () => {
    const { root, worktree } = makeFixture();
    try {
      const first = runScript([`--worktree=${worktree}`]);
      assert.equal(first.code, 0);

      const second = runScript([`--worktree=${worktree}`]);
      assert.equal(second.code, 0);
      assert.match(second.stdout, /already exists and is healthy/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  'replaces a symlink that points to the wrong target',
  { skip: IS_WINDOWS ? 'mklink /D requires Developer Mode' : false },
  () => {
    const { root, mainRepo, worktree } = makeFixture();
    // Plant a symlink pointing somewhere other than mainRepo/node_modules.
    const decoy = join(root, 'decoy-node-modules');
    mkdirSync(join(decoy, '.bin'), { recursive: true });
    mkdirSync(join(decoy, 'nx'), { recursive: true });
    writeFileSync(join(decoy, '.bin', 'tsx'), '#!/bin/sh\n');
    symlinkSync(decoy, join(worktree, 'node_modules'), 'dir');

    try {
      const { code, stdout } = runScript([`--worktree=${worktree}`]);
      assert.equal(code, 0, `unexpected exit ${code}: ${stdout}`);
      assert.equal(
        realpathSync(join(worktree, 'node_modules')),
        realpathSync(join(mainRepo, 'node_modules')),
        'symlink should now point to the real main repo',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
