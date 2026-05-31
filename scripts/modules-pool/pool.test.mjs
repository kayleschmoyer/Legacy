/**
 * Tests for the modules-pool scripts. Dependency-free: run with plain node, no
 * tsx / nx / jest required (mirrors the bootstrap constraint the scripts honour):
 *
 *   node --test scripts/modules-pool/pool.test.mjs
 *
 * The scripts are exercised as subprocesses (the way make targets invoke them),
 * which also proves AC #1: they run under a bare node with no node_modules.
 * Tests that need a directory symlink are skipped automatically when the host
 * cannot create one (Windows without Developer Mode) — the same capability the
 * feature itself requires.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  lstatSync,
  realpathSync,
  utimesSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const LINK = join(here, 'link.mjs');
const GC = join(here, 'gc.mjs');

const LOCK_A = 'lockfileVersion: 9\nimporters:\n  .: {}\n';
const LOCK_B =
  'lockfileVersion: 9\nimporters:\n  .:\n    dependencies:\n      left-pad: 1.0.0\n';
const PKG = JSON.stringify({ name: 'fixture', packageManager: 'pnpm@9.12.1' });

function freshMainRepo() {
  const root = mkdtempSync(join(tmpdir(), 'mp-test-'));
  mkdirSync(join(root, '.git')); // marks it as a main repo for auto-detect
  return root;
}

/** A fake but "healthy" node_modules: has nx/ and a populated .bin/. */
function makeHealthyNodeModules(nmPath) {
  mkdirSync(join(nmPath, 'nx'), { recursive: true });
  mkdirSync(join(nmPath, '.bin'), { recursive: true });
  writeFileSync(join(nmPath, '.bin', 'placeholder'), '');
}

function makeWorktree(root, name, lock = LOCK_A) {
  const wt = join(root, '.claude', 'worktrees', name);
  mkdirSync(wt, { recursive: true });
  writeFileSync(join(wt, 'pnpm-lock.yaml'), lock);
  writeFileSync(join(wt, 'package.json'), PKG);
  return wt;
}

function runLink(args, env) {
  return execFileSync('node', [LINK, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });
}
function runGc(args, env) {
  return execFileSync('node', [GC, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });
}

/** Can this host create a directory symlink the way link.mjs does? */
function canSymlink() {
  const dir = mkdtempSync(join(tmpdir(), 'mp-cap-'));
  const target = join(dir, 'target');
  const link = join(dir, 'link');
  mkdirSync(target);
  try {
    if (process.platform === 'win32') {
      execFileSync('cmd', ['/c', 'mklink', '/D', link, target], {
        encoding: 'utf-8',
      });
    } else {
      execFileSync('node', [
        '-e',
        `require('fs').symlinkSync(${JSON.stringify(target)}, ${JSON.stringify(link)})`,
      ]);
    }
    return existsSync(link);
  } catch {
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const SYMLINK_OK = canSymlink();

test('hash is deterministic for the same lockfile', () => {
  const root = freshMainRepo();
  try {
    const wt = makeWorktree(root, 'wt1');
    const h1 = runLink([
      `--worktree=${wt}`,
      `--main-repo=${root}`,
      '--print-hash',
    ]).trim();
    const h2 = runLink([
      `--worktree=${wt}`,
      `--main-repo=${root}`,
      '--print-hash',
    ]).trim();
    assert.equal(h1, h2);
    assert.match(h1, /^[0-9a-f]{16}$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('hash differs when the lockfile differs', () => {
  const root = freshMainRepo();
  try {
    const a = makeWorktree(root, 'a', LOCK_A);
    const b = makeWorktree(root, 'b', LOCK_B);
    const ha = runLink([
      `--worktree=${a}`,
      `--main-repo=${root}`,
      '--print-hash',
    ]).trim();
    const hb = runLink([
      `--worktree=${b}`,
      `--main-repo=${root}`,
      '--print-hash',
    ]).trim();
    assert.notEqual(ha, hb);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('--no-salt changes the hash when packageManager is present', () => {
  const root = freshMainRepo();
  try {
    const wt = makeWorktree(root, 'wt1');
    const salted = runLink([
      `--worktree=${wt}`,
      `--main-repo=${root}`,
      '--print-hash',
    ]).trim();
    const unsalted = runLink([
      `--worktree=${wt}`,
      `--main-repo=${root}`,
      '--no-salt',
      '--print-hash',
    ]).trim();
    assert.notEqual(salted, unsalted);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test(
  'pool hit links worktree → slot and is idempotent',
  { skip: SYMLINK_OK ? false : 'no symlink capability' },
  () => {
    const root = freshMainRepo();
    try {
      const wt = makeWorktree(root, 'wt1');
      const hash = runLink([
        `--worktree=${wt}`,
        `--main-repo=${root}`,
        '--print-hash',
      ]).trim();
      const slotNm = join(root, '.modules-pool', hash, 'node_modules');
      makeHealthyNodeModules(slotNm);

      runLink([`--worktree=${wt}`, `--main-repo=${root}`]);
      const nm = join(wt, 'node_modules');
      assert.ok(
        lstatSync(nm).isSymbolicLink(),
        'node_modules should be a symlink',
      );
      assert.equal(
        realpathSync(nm),
        realpathSync(slotNm),
        'symlink should target the slot',
      );

      // Idempotent: a second run keeps the same link, no throw.
      runLink([`--worktree=${wt}`, `--main-repo=${root}`]);
      assert.equal(realpathSync(nm), realpathSync(slotNm));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

// --- .env / .env.local symlinking (linkSecretEnvFiles / linkEnvFile) ---------
// link.mjs symlinks the main repo's gitignored secret env files into the
// worktree after linking node_modules. These run on the pool-hit path, so they
// need a pre-built healthy slot (same setup as the 'pool hit' test) and a
// symlink-capable host.

/** Build a healthy slot for the worktree's lockfile so link.mjs is a cache hit. */
function prebuildSlot(root, wt) {
  const hash = runLink([
    `--worktree=${wt}`,
    `--main-repo=${root}`,
    '--print-hash',
  ]).trim();
  makeHealthyNodeModules(join(root, '.modules-pool', hash, 'node_modules'));
  return hash;
}

test(
  'links .env and .env.local from main into the worktree',
  { skip: SYMLINK_OK ? false : 'no symlink capability' },
  () => {
    const root = freshMainRepo();
    try {
      writeFileSync(join(root, '.env'), 'MAIN_ENV=1\n');
      writeFileSync(join(root, '.env.local'), 'MCP_AUTH_TOKEN=abc\n');
      const wt = makeWorktree(root, 'env-wt');
      prebuildSlot(root, wt);

      runLink([`--worktree=${wt}`, `--main-repo=${root}`]);

      for (const name of ['.env', '.env.local']) {
        const linkPath = join(wt, name);
        assert.ok(
          lstatSync(linkPath).isSymbolicLink(),
          `${name} should be a symlink`,
        );
        assert.equal(
          realpathSync(linkPath),
          realpathSync(join(root, name)),
          `${name} should target the main repo copy`,
        );
      }

      // Idempotent: a second run keeps the links and does not throw.
      runLink([`--worktree=${wt}`, `--main-repo=${root}`]);
      assert.ok(lstatSync(join(wt, '.env')).isSymbolicLink());
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  'does not overwrite a real (non-symlink) .env already in the worktree',
  { skip: SYMLINK_OK ? false : 'no symlink capability' },
  () => {
    const root = freshMainRepo();
    try {
      writeFileSync(join(root, '.env'), 'MAIN_ENV=1\n');
      const wt = makeWorktree(root, 'realenv-wt');
      writeFileSync(join(wt, '.env'), 'WORKTREE_LOCAL=keepme\n'); // a real file
      prebuildSlot(root, wt);

      runLink([`--worktree=${wt}`, `--main-repo=${root}`]);

      const wtEnv = join(wt, '.env');
      assert.ok(
        !lstatSync(wtEnv).isSymbolicLink(),
        'a real .env must be left as a real file',
      );
      assert.equal(
        readFileSync(wtEnv, 'utf-8'),
        'WORKTREE_LOCAL=keepme\n',
        'a real .env must not be overwritten',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  'env linking is a no-op (no error) when the main repo has no .env',
  { skip: SYMLINK_OK ? false : 'no symlink capability' },
  () => {
    const root = freshMainRepo();
    try {
      const wt = makeWorktree(root, 'noenv-wt');
      prebuildSlot(root, wt);

      const out = runLink([`--worktree=${wt}`, `--main-repo=${root}`]);
      assert.match(out, /\.env: not present in main repo/);
      assert.ok(!existsSync(join(wt, '.env')), 'no .env should be created');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  'gc prunes old orphans, keeps live + young slots, reclaims tmp',
  { skip: SYMLINK_OK ? false : 'no symlink capability' },
  () => {
    const root = freshMainRepo();
    try {
      const pool = join(root, '.modules-pool');

      // Live slot: built and linked from a worktree.
      const wt = makeWorktree(root, 'live');
      const liveHash = runLink([
        `--worktree=${wt}`,
        `--main-repo=${root}`,
        '--print-hash',
      ]).trim();
      makeHealthyNodeModules(join(pool, liveHash, 'node_modules'));
      runLink([`--worktree=${wt}`, `--main-repo=${root}`]);

      // Orphan slots (no worktree points at them).
      const oldOrphan = join(pool, 'aaaaaaaaaaaaaaaa');
      const youngOrphan = join(pool, 'bbbbbbbbbbbbbbbb');
      makeHealthyNodeModules(join(oldOrphan, 'node_modules'));
      makeHealthyNodeModules(join(youngOrphan, 'node_modules'));
      // Age the old orphan 30 days into the past.
      const old = Date.now() / 1000 - 30 * 86400;
      utimesSync(oldOrphan, old, old);

      // Crashed-materialise temp dir.
      const tmp = join(pool, '.tmp-9999-deadbeef');
      makeHealthyNodeModules(join(tmp, 'node_modules'));

      runGc([`--main-repo=${root}`, '--max-age-days=14']);

      const remaining = readdirSync(pool).sort();
      assert.ok(remaining.includes(liveHash), 'live slot must survive');
      assert.ok(
        remaining.includes('bbbbbbbbbbbbbbbb'),
        'young orphan must survive',
      );
      assert.ok(
        !remaining.includes('aaaaaaaaaaaaaaaa'),
        'old orphan must be pruned',
      );
      assert.ok(
        !remaining.includes('.tmp-9999-deadbeef'),
        'tmp dir must be reclaimed',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test('link reads worktree from MODULES_POOL_WT env (make-exported path)', () => {
  const root = freshMainRepo();
  try {
    const wt = makeWorktree(root, 'wt1');
    // No --worktree flag; worktree comes from the env var make would export.
    const viaEnv = runLink([`--main-repo=${root}`, '--print-hash'], {
      MODULES_POOL_WT: wt,
    }).trim();
    const viaFlag = runLink([
      `--worktree=${wt}`,
      `--main-repo=${root}`,
      '--print-hash',
    ]).trim();
    assert.equal(viaEnv, viaFlag);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test(
  'gc reads DRY from env (make-exported path)',
  { skip: SYMLINK_OK ? false : 'no symlink capability' },
  () => {
    const root = freshMainRepo();
    try {
      const pool = join(root, '.modules-pool');
      const oldOrphan = join(pool, 'dddddddddddddddd');
      makeHealthyNodeModules(join(oldOrphan, 'node_modules'));
      const old = Date.now() / 1000 - 30 * 86400;
      utimesSync(oldOrphan, old, old);

      // MODULES_POOL_DRY truthy must behave like --dry-run (delete nothing).
      const out = runGc([`--main-repo=${root}`], {
        MODULES_POOL_DRY: '1',
        MODULES_POOL_DAYS: '14',
      });
      assert.match(out, /mode\s*:\s*dry-run/);
      assert.ok(existsSync(oldOrphan), 'env dry-run must not delete');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  'gc --dry-run removes nothing',
  { skip: SYMLINK_OK ? false : 'no symlink capability' },
  () => {
    const root = freshMainRepo();
    try {
      const pool = join(root, '.modules-pool');
      const oldOrphan = join(pool, 'cccccccccccccccc');
      makeHealthyNodeModules(join(oldOrphan, 'node_modules'));
      const old = Date.now() / 1000 - 30 * 86400;
      utimesSync(oldOrphan, old, old);

      runGc([`--main-repo=${root}`, '--max-age-days=14', '--dry-run']);
      assert.ok(existsSync(oldOrphan), 'dry-run must not delete');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
