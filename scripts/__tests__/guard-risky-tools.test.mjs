/**
 * Tests for .claude/hooks/guard-risky-tools.mjs — the `pnpm-install-symlink`
 * rule and its filesystem gate (LS-9828, LS-9837).
 *
 * Run via: pnpm run test:scripts
 * Or:      node --test scripts/__tests__/guard-risky-tools.test.mjs
 *
 * The rule guards one specific hazard: pnpm writing THROUGH a worktree symlink
 * rewrites the immutable pool slot every other worktree on the machine is
 * linked to. It has been narrowed three times for firing outside that hazard —
 * once for main-repo checkouts where node_modules is a real directory
 * (LS-8731), once for the detached state that install-packages.md's own step 1
 * creates (LS-9828), and once for a `pnpm install --lockfile-only` that `cd`s
 * into an isolated tmpdir with no node_modules of its own before running
 * (LS-9837, `make lockfile`). All three narrowings are false-positive fixes, so
 * the tests below pin the hazard case just as hard as the allowed cases: a
 * regression that reopens the block is annoying, but a regression that lets
 * `pnpm add` run through a live symlink corrupts a slot other sessions are
 * executing from.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const HOOK = resolve(
  import.meta.dirname,
  '..',
  '..',
  '.claude',
  'hooks',
  'guard-risky-tools.mjs',
);

/**
 * Can this host create a directory symlink the way modules-pool/link.mjs does?
 * Windows needs Developer Mode; without it the symlink cases are unrunnable
 * (and the repo already requires it for real work), so they skip rather than
 * fail. Mirrors the capability probe in scripts/modules-pool/pool.test.mjs.
 */
function canSymlink() {
  const dir = mkdtempSync(join(tmpdir(), 'grt-cap-'));
  const target = join(dir, 'target');
  const link = join(dir, 'link');
  mkdirSync(target);
  try {
    makeDirSymlink(link, target);
    return existsSync(link);
  } catch {
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Create a directory symlink the same way link.mjs does. */
function makeDirSymlink(linkPath, target) {
  if (process.platform === 'win32') {
    execFileSync('cmd', ['/c', 'mklink', '/D', linkPath, target], {
      encoding: 'utf-8',
    });
  } else {
    symlinkSync(target, linkPath);
  }
}

const SYMLINK_OK = canSymlink();

/**
 * Build a fake project root.
 *
 * @param {object} opts
 * @param {'symlink'|'real'|'absent'} opts.nodeModules  shape of node_modules
 * @param {boolean} opts.linkedWorktree  `.git` as a file (worktree) vs dir (main repo)
 */
function makeRoot({ nodeModules, linkedWorktree }) {
  const root = mkdtempSync(join(tmpdir(), 'grt-root-'));
  if (linkedWorktree) {
    writeFileSync(
      join(root, '.git'),
      'gitdir: /somewhere/.git/worktrees/wt1\n',
    );
  } else {
    mkdirSync(join(root, '.git'));
  }
  if (nodeModules === 'real') {
    mkdirSync(join(root, 'node_modules'));
  } else if (nodeModules === 'symlink') {
    const slot = join(root, 'slot');
    mkdirSync(slot);
    makeDirSymlink(join(root, 'node_modules'), slot);
  }
  return root;
}

/**
 * Run the hook against a Bash command in `root`. Returns { code, stderr }.
 * The hook exits 2 to block and 0 to allow; the block reason goes to stderr.
 */
function runHook(command, root) {
  const res = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command },
      cwd: root,
      session_id: 'guard-risky-tools-test',
    }),
    encoding: 'utf-8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  return { code: res.status, stderr: res.stderr ?? '' };
}

/** Run `command` in a fresh root of the given shape, then clean up. */
function check(command, shape) {
  const root = makeRoot(shape);
  try {
    return runHook(command, root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const SYMLINKED = { nodeModules: 'symlink', linkedWorktree: true };
const DETACHED = { nodeModules: 'absent', linkedWorktree: true };
const MAIN_REPO = { nodeModules: 'real', linkedWorktree: false };
const MAIN_REPO_BARE = { nodeModules: 'absent', linkedWorktree: false };

// --- The hazard: a live symlink into the shared slot -------------------------

test(
  'blocks pnpm add through a live worktree symlink',
  { skip: !SYMLINK_OK },
  () => {
    const { code, stderr } = check('pnpm add -w some-package', SYMLINKED);
    assert.equal(code, 2, 'expected a block');
    assert.match(stderr, /pnpm-install-symlink/);
  },
);

test(
  'blocks pnpm install through a live worktree symlink',
  { skip: !SYMLINK_OK },
  () => {
    assert.equal(check('pnpm install', SYMLINKED).code, 2);
  },
);

test(
  'blocks pnpm install --lockfile-only through a live symlink',
  { skip: !SYMLINK_OK },
  () => {
    // The modules-pool RFC claimed the guards exempt this flag unconditionally.
    // They do not: while the symlink is live the rule matches on the subcommand
    // and the gate never inspects flags. Detaching first is what makes it pass.
    assert.equal(check('pnpm install --lockfile-only', SYMLINKED).code, 2);
  },
);

// --- The detached state: install-packages.md step 1 has already run ----------

test('allows pnpm add in a detached worktree (documented step 2)', () => {
  const { code, stderr } = check('pnpm add -w some-package', DETACHED);
  assert.equal(code, 0, `expected no block, got stderr: ${stderr}`);
});

test('allows pnpm remove and pnpm update in a detached worktree', () => {
  assert.equal(check('pnpm remove -w some-package', DETACHED).code, 0);
  assert.equal(check('pnpm update some-package', DETACHED).code, 0);
});

test('allows pnpm install --lockfile-only in a detached worktree', () => {
  // Writes only the lockfile, never a tree — the .pnpmfile.cjs checksum refresh
  // the modules-pool RFC prescribes.
  const { code, stderr } = check('pnpm install --lockfile-only', DETACHED);
  assert.equal(code, 0, `expected no block, got stderr: ${stderr}`);
});

test('allows pnpm add when chained after another command', () => {
  // The rule scans the whole command, so the gate must too.
  assert.equal(
    check('echo detaching && pnpm add -w some-package', DETACHED).code,
    0,
  );
});

test('still blocks bare pnpm install in a detached worktree', () => {
  // Nothing about the dependency set is changing, so a slot already exists for
  // this lockfile and link.mjs should be used instead of a private reinstall.
  const { code, stderr } = check('pnpm install', DETACHED);
  assert.equal(code, 2, 'expected a block');
  assert.match(stderr, /modules-pool\/link\.mjs/);
  assert.match(stderr, /pnpm add -w/, 'block should point at the allowed path');
});

test('does not treat a package name starting with "add" as pnpm add', () => {
  assert.equal(
    check('pnpm addendum', DETACHED).code,
    0,
    'not a pnpm write verb',
  );
});

// --- Isolated-tmpdir installs (LS-9837) --------------------------------------
//
// `make lockfile`'s verified procedure `cd`s into a scratch copy of just the
// manifest files (no node_modules of its own) before running
// `pnpm install --lockfile-only` there. The gate must judge that install
// against the tmpdir it actually runs in, not the worktree root two
// directories up — otherwise the sanctioned regeneration path is blocked by
// the very rule it was designed to route around.

test(
  'allows pnpm install --lockfile-only cd-ed into an isolated tmpdir, even from a live symlinked worktree root',
  { skip: !SYMLINK_OK },
  () => {
    const root = makeRoot(SYMLINKED);
    const tmp = mkdtempSync(join(tmpdir(), 'grt-lockfile-stage-'));
    try {
      const { code, stderr } = runHook(
        `cd ${tmp} && pnpm install --lockfile-only --ignore-scripts`,
        root,
      );
      assert.equal(code, 0, `expected no block, got stderr: ${stderr}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(tmp, { recursive: true, force: true });
    }
  },
);

test(
  'still blocks pnpm install --lockfile-only when the cd target itself has a live symlink',
  { skip: !SYMLINK_OK },
  () => {
    const root = mkdtempSync(join(tmpdir(), 'grt-root-'));
    const target = join(root, 'wt1');
    mkdirSync(target);
    const slot = join(root, 'slot');
    mkdirSync(slot);
    makeDirSymlink(join(target, 'node_modules'), slot);
    writeFileSync(
      join(target, '.git'),
      'gitdir: /somewhere/.git/worktrees/wt1\n',
    );
    try {
      const { code, stderr } = runHook(
        `cd ${target} && pnpm install --lockfile-only`,
        root,
      );
      assert.equal(code, 2, 'expected a block');
      assert.match(stderr, /pnpm-install-symlink/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

// --- Main repo / direct-branch checkouts (LS-8731) ---------------------------

test('allows pnpm install where node_modules is a real directory', () => {
  assert.equal(check('pnpm install', MAIN_REPO).code, 0);
});

test('allows pnpm install in a main-repo checkout with no node_modules', () => {
  assert.equal(check('pnpm install', MAIN_REPO_BARE).code, 0);
});

// --- The escape hatch --------------------------------------------------------

test(
  '# risk-ok bypasses the block through a live symlink',
  { skip: !SYMLINK_OK },
  () => {
    const { code } = check(
      'pnpm add -w some-package # risk-ok: detached manually',
      SYMLINKED,
    );
    assert.equal(code, 0, 'GUARDED rules are bypassable');
  },
);

test('# risk-ok does not bypass a CATASTROPHIC rule', () => {
  // Pinned here because the bypass is now documented in the hook truth table:
  // readers must not generalise it to the no-bypass tier.
  const { code } = check(
    'git push origin main # risk-ok: I am sure',
    MAIN_REPO,
  );
  assert.equal(code, 2, 'push-to-main has no bypass');
});

// --- worktree-remove gate (LS-9606) ------------------------------------------
//
// The rule guards against destroying a node_modules pool symlink — a hazard
// that only exists when the worktree being removed actually has one. Cloud/CCR
// sessions never have twig or the pool at all, so a scratch worktree there
// (e.g. `/tmp/main-check`, LS-9606's own example) has nothing to protect and
// the `twig worktree clean` fix in the block message is unusable anyway.

test(
  'blocks git worktree remove when the target has a live pool symlink',
  { skip: !SYMLINK_OK },
  () => {
    const root = mkdtempSync(join(tmpdir(), 'grt-root-'));
    const target = join(root, 'wt1');
    mkdirSync(target);
    const slot = join(root, 'slot');
    mkdirSync(slot);
    makeDirSymlink(join(target, 'node_modules'), slot);
    try {
      const { code, stderr } = runHook(`git worktree remove ${target}`, root);
      assert.equal(code, 2, 'expected a block');
      assert.match(stderr, /worktree-remove/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test('allows git worktree remove on a scratch worktree with no node_modules', () => {
  const root = mkdtempSync(join(tmpdir(), 'grt-root-'));
  const target = join(root, 'main-check');
  mkdirSync(target);
  try {
    const { code, stderr } = runHook(`git worktree remove ${target}`, root);
    assert.equal(code, 0, `expected no block, got stderr: ${stderr}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('allows git worktree remove --force on a scratch worktree with no node_modules', () => {
  // LS-9606's own trigger case: `git worktree remove /tmp/main-check --force`.
  const root = mkdtempSync(join(tmpdir(), 'grt-root-'));
  const target = join(root, 'main-check');
  mkdirSync(target);
  try {
    const { code } = runHook(`git worktree remove ${target} --force`, root);
    assert.equal(code, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('allows git worktree remove when the target node_modules is a real directory', () => {
  const root = mkdtempSync(join(tmpdir(), 'grt-root-'));
  const target = join(root, 'wt1');
  mkdirSync(target);
  mkdirSync(join(target, 'node_modules'));
  try {
    const { code } = runHook(`git worktree remove ${target}`, root);
    assert.equal(code, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test(
  '# risk-ok still bypasses git worktree remove through a live pool symlink',
  { skip: !SYMLINK_OK },
  () => {
    const root = mkdtempSync(join(tmpdir(), 'grt-root-'));
    const target = join(root, 'wt1');
    mkdirSync(target);
    const slot = join(root, 'slot');
    mkdirSync(slot);
    makeDirSymlink(join(target, 'node_modules'), slot);
    try {
      const { code } = runHook(
        `git worktree remove ${target} # risk-ok: pool already migrated`,
        root,
      );
      assert.equal(code, 0, 'GUARDED rules are bypassable');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

// --- git checkout/restore whole-tree overwrite (LS-9275) --------------------
//
// `git checkout <ref> -- .` and `git restore --source=<ref> .` silently
// overwrite the ENTIRE working tree with another ref's contents — exactly as
// destructive as `git reset --hard`, but until now had no guard at all. This
// wasn't hypothetical: LS-9106 (PR #6898) ran `git checkout origin/main -- .`
// mid-drive and silently discarded uncommitted work with zero warning. Scoped
// single-file checkouts/restores are common and safe, so they must stay
// unrestricted (negative control below).

test('blocks git checkout <ref> -- . (whole-tree overwrite)', () => {
  const { code, stderr } = check('git checkout origin/main -- .', MAIN_REPO);
  assert.equal(code, 2, 'expected a block');
  assert.match(stderr, /git-checkout-whole-tree/);
});

test('blocks git checkout -- . (no ref, still whole-tree)', () => {
  assert.equal(check('git checkout -- .', MAIN_REPO).code, 2);
});

test('allows scoped, single-file git checkout', () => {
  const { code, stderr } = check(
    'git checkout main -- path/to/one-file.ts',
    MAIN_REPO,
  );
  assert.equal(code, 0, `expected no block, got stderr: ${stderr}`);
});

test('blocks git restore --source=<ref> . (whole-tree overwrite)', () => {
  const { code, stderr } = check(
    'git restore --source=origin/main .',
    MAIN_REPO,
  );
  assert.equal(code, 2, 'expected a block');
  assert.match(stderr, /git-restore-whole-tree/);
});

test('blocks git restore . (no source, still whole-tree)', () => {
  assert.equal(check('git restore .', MAIN_REPO).code, 2);
});

test('allows scoped, single-file git restore', () => {
  const { code, stderr } = check(
    'git restore --source=origin/main path/to/one-file.ts',
    MAIN_REPO,
  );
  assert.equal(code, 0, `expected no block, got stderr: ${stderr}`);
});

test('# risk-ok bypasses git checkout <ref> -- .', () => {
  assert.equal(
    check('git checkout origin/main -- . # risk-ok: intentional', MAIN_REPO)
      .code,
    0,
  );
});

test('# risk-ok bypasses git restore --source=<ref> .', () => {
  assert.equal(
    check(
      'git restore --source=origin/main . # risk-ok: intentional',
      MAIN_REPO,
    ).code,
    0,
  );
});
