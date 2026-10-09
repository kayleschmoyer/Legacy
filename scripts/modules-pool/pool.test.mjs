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
  statSync,
  realpathSync,
  utimesSync,
  readdirSync,
  chmodSync,
  copyFileSync,
  symlinkSync,
  openSync,
  closeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

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

/**
 * A fake but "healthy" node_modules: has nx/ (with a package.json — the deep
 * health check treats a package dir without one as corruption), a populated
 * .bin/, and .modules.yaml (pnpm's own install-completion marker — its
 * absence is the LS-9210 corruption signature).
 */
function makeHealthyNodeModules(nmPath) {
  mkdirSync(join(nmPath, 'nx'), { recursive: true });
  writeFileSync(join(nmPath, 'nx', 'package.json'), '{"name":"nx"}');
  mkdirSync(join(nmPath, '.bin'), { recursive: true });
  writeFileSync(join(nmPath, '.bin', 'placeholder'), '');
  writeFileSync(join(nmPath, '.bin', 'nx'), '');
  writeFileSync(join(nmPath, '.modules.yaml'), 'hoistedDependencies: {}\n');
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

// --- main-repo auto-detection (LS-8383) --------------------------------------
// resolveMainRepo() has three convention-based checks (native, sibling, main
// repo itself) plus a fallback for any other git worktree, which must derive
// the main repo from the worktree's own git metadata rather than requiring
// --main-repo. These tests exercise real `git worktree add` checkouts so the
// `git rev-parse --git-common-dir` fallback is proven end to end.

test('auto-detects main repo from an ad-hoc git worktree outside any convention', () => {
  const root = mkdtempSync(join(tmpdir(), 'mp-git-main-'));
  const wtParent = mkdtempSync(join(tmpdir(), 'mp-git-wt-'));
  const wt = join(wtParent, 'ad-hoc-worktree');
  try {
    execFileSync('git', ['init', '-q', '-b', 'main', root]);
    execFileSync('git', [
      '-C',
      root,
      'config',
      'user.email',
      'test@example.com',
    ]);
    execFileSync('git', ['-C', root, 'config', 'user.name', 'Test']);
    writeFileSync(join(root, 'README.md'), 'x');
    execFileSync('git', ['-C', root, 'add', '.']);
    execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'init']);
    execFileSync('git', [
      '-C',
      root,
      'worktree',
      'add',
      '-q',
      wt,
      '-b',
      'ad-hoc-branch',
    ]);
    writeFileSync(join(wt, 'pnpm-lock.yaml'), LOCK_A);
    writeFileSync(join(wt, 'package.json'), PKG);

    // No --main-repo passed — this is the exact LS-8383 repro shape (a
    // worktree created outside .claude/worktrees/ and outside the sibling
    // <repo>.worktrees/ convention). --check performs no filesystem writes so
    // it exits 1 for "slot not built" rather than attempting a pnpm install,
    // but it still logs the resolved main-repo path before that check runs.
    const { status, output } = runLinkExpectFail([
      `--worktree=${wt}`,
      '--check',
    ]);
    assert.equal(status, 1, '--check exits 1 because no slot is built yet');
    assert.match(
      output,
      new RegExp(
        `main repo: ${realpathSync(root)}`.replace(
          /[.*+?^${}()|[\]\\]/g,
          '\\$&',
        ),
      ),
    );
    assert.match(output, /slot not built/);
  } finally {
    try {
      execFileSync('git', ['-C', root, 'worktree', 'remove', '--force', wt]);
    } catch {
      /* best effort */
    }
    rmSync(wtParent, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
});

test('still fails actionably when main repo cannot be auto-detected at all', () => {
  const root = mkdtempSync(join(tmpdir(), 'mp-notgit-'));
  try {
    writeFileSync(join(root, 'pnpm-lock.yaml'), LOCK_A);
    writeFileSync(join(root, 'package.json'), PKG);

    const { status, output } = runLinkExpectFail([
      `--worktree=${root}`,
      '--print-hash',
    ]);
    assert.equal(status, 1);
    assert.match(output, /Cannot auto-detect main repo from/);
    assert.match(output, /--main-repo=<path>/);
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

// Without Developer Mode `mklink /D` fails with "You do not have sufficient
// privilege"; link.mjs must fall back to a junction (`mklink /J`) rather than
// failing (LS-11021) — previously the run left no node_modules (LS-10597).
// MODULES_POOL_FORCE_JUNCTION=1 simulates that privilege error so the fallback
// is exercised on Developer Mode hosts too.
test(
  'Windows without symlink privilege falls back to a junction and passes --check (LS-11021)',
  {
    skip: process.platform === 'win32' ? false : 'mklink /J is Windows-only',
  },
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
      // A pre-existing empty husk must be replaced, not left behind.
      mkdirSync(join(wt, 'node_modules'));

      const env = { MODULES_POOL_FORCE_JUNCTION: '1' };
      const out = runLink([`--worktree=${wt}`, `--main-repo=${root}`], env);
      assert.match(out, /created a junction instead/);

      const nm = join(wt, 'node_modules');
      assert.ok(lstatSync(nm).isSymbolicLink(), 'junction reads as a link');
      assert.equal(realpathSync(nm), realpathSync(slotNm));

      // --check treats the junction as a healthy link.
      runLink([`--worktree=${wt}`, `--main-repo=${root}`, '--check'], env);

      // Idempotent re-run.
      runLink([`--worktree=${wt}`, `--main-repo=${root}`], env);
      assert.equal(realpathSync(nm), realpathSync(slotNm));

      // A recursive delete of the junction must not reach into the shared slot.
      rmSync(nm, { recursive: true, force: true });
      assert.ok(!existsSync(nm));
      assert.ok(existsSync(join(slotNm, 'nx', 'package.json')));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  'pool hit self-heals a stale real (non-symlink) node_modules directory (LS-8649)',
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

      // Simulate the LS-8649 repro: node_modules already exists in the
      // worktree as a real directory with real package contents, not a
      // symlink — mklink /D refuses to overwrite this on Windows.
      const nm = join(wt, 'node_modules');
      mkdirSync(join(nm, '@ardatan'), { recursive: true });
      writeFileSync(join(nm, '@ardatan', 'pkg.json'), '{}');

      runLink([`--worktree=${wt}`, `--main-repo=${root}`]);

      assert.ok(
        lstatSync(nm).isSymbolicLink(),
        'stale real node_modules must be replaced by a symlink',
      );
      assert.equal(
        realpathSync(nm),
        realpathSync(slotNm),
        'symlink should target the slot',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  'pool hit fails actionably (not a raw mklink error) when a stale node_modules cannot be removed',
  {
    skip:
      process.platform === 'win32'
        ? false
        : 'requires Windows file-lock semantics to force a removal failure',
  },
  () => {
    const root = freshMainRepo();
    let fd;
    try {
      const wt = makeWorktree(root, 'wt1');
      const hash = runLink([
        `--worktree=${wt}`,
        `--main-repo=${root}`,
        '--print-hash',
      ]).trim();
      const slotNm = join(root, '.modules-pool', hash, 'node_modules');
      makeHealthyNodeModules(slotNm);

      // A file held open without FILE_SHARE_DELETE blocks Windows from deleting
      // it (and its parent dir), reproducing the LS-8649 repro: rmSync throws,
      // removeNodeModulesEntry swallows it silently, and mklink then fails with
      // a raw "already exists" error unless the caller re-checks removal.
      const nm = join(wt, 'node_modules');
      mkdirSync(nm, { recursive: true });
      const lockedFile = join(nm, 'locked.txt');
      writeFileSync(lockedFile, 'x');
      fd = openSync(lockedFile, 'r+');

      const { status, output } = runLinkExpectFail([
        `--worktree=${wt}`,
        `--main-repo=${root}`,
      ]);
      assert.equal(status, 1, 'link.mjs must exit non-zero');
      assert.match(
        output,
        /could not be removed automatically/,
        'must surface an actionable message instead of the raw mklink error',
      );
      assert.match(output, /rm -rf/);
    } finally {
      if (fd !== undefined) closeSync(fd);
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

// --- certs/ directory symlinking (linkDir) -----------------------------------
// link.mjs symlinks the main repo's certs/ directory into the worktree after
// linking node_modules. This is needed so DB_CERT_PATH resolves correctly for
// db-client SSL connections (pnpm --prefix lib/db-client run db:status / db:up).

test(
  'links certs/ directory from main into the worktree',
  { skip: SYMLINK_OK ? false : 'no symlink capability' },
  () => {
    const root = freshMainRepo();
    try {
      mkdirSync(join(root, 'certs'));
      writeFileSync(join(root, 'certs', 'us-east-1-bundle.pem'), 'CERT\n');
      const wt = makeWorktree(root, 'certs-wt');
      prebuildSlot(root, wt);

      runLink([`--worktree=${wt}`, `--main-repo=${root}`]);

      const linkPath = join(wt, 'certs');
      assert.ok(
        lstatSync(linkPath).isSymbolicLink(),
        'certs should be a symlink',
      );
      assert.equal(
        realpathSync(linkPath),
        realpathSync(join(root, 'certs')),
        'certs should target the main repo copy',
      );

      // Idempotent: a second run keeps the link and does not throw.
      runLink([`--worktree=${wt}`, `--main-repo=${root}`]);
      assert.ok(lstatSync(join(wt, 'certs')).isSymbolicLink());
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  'does not overwrite a real (non-symlink) certs/ directory already in the worktree',
  { skip: SYMLINK_OK ? false : 'no symlink capability' },
  () => {
    const root = freshMainRepo();
    try {
      mkdirSync(join(root, 'certs'));
      const wt = makeWorktree(root, 'realcerts-wt');
      mkdirSync(join(wt, 'certs')); // real directory, not a symlink
      writeFileSync(join(wt, 'certs', 'local.pem'), 'LOCAL\n');
      prebuildSlot(root, wt);

      runLink([`--worktree=${wt}`, `--main-repo=${root}`]);

      const wtCerts = join(wt, 'certs');
      assert.ok(
        !lstatSync(wtCerts).isSymbolicLink(),
        'a real certs/ must be left as a real directory',
      );
      assert.ok(
        existsSync(join(wtCerts, 'local.pem')),
        'existing cert file must not be removed',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  'certs linking is a no-op (no error) when the main repo has no certs/',
  { skip: SYMLINK_OK ? false : 'no symlink capability' },
  () => {
    const root = freshMainRepo();
    try {
      const wt = makeWorktree(root, 'nocerts-wt');
      prebuildSlot(root, wt);

      const out = runLink([`--worktree=${wt}`, `--main-repo=${root}`]);
      assert.match(out, /certs: not present in main repo/);
      assert.ok(!existsSync(join(wt, 'certs')), 'no certs/ should be created');
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

test('--no-frozen-lockfile is accepted and does not affect hash computation', () => {
  const root = freshMainRepo();
  try {
    const wt = makeWorktree(root, 'wt1');
    const hashNormal = runLink([
      `--worktree=${wt}`,
      `--main-repo=${root}`,
      '--print-hash',
    ]).trim();
    const hashNoFrozen = runLink([
      `--worktree=${wt}`,
      `--main-repo=${root}`,
      '--no-frozen-lockfile',
      '--print-hash',
    ]).trim();
    assert.equal(
      hashNormal,
      hashNoFrozen,
      '--no-frozen-lockfile must not change the hash',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

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

// --- deep health check, quarantine & rebuild (LS-8548) -----------------------
// The LS-8546 incident: an interrupted `pnpm install` writing through a
// consumer symlink left `@nx/devkit` as a partial dir without package.json and
// a complete `@nx/devkit_tmp_38916` beside it — and the shallow isHealthy()
// still linked the slot as a cache hit. These tests pin the deep check, the
// quarantine-and-rebuild flow, and the install guards.

/** Plant the LS-8546 corruption signature into a healthy slot. */
function corruptSlot(slotNm) {
  mkdirSync(join(slotNm, '@nx', 'devkit'), { recursive: true }); // no package.json
  mkdirSync(join(slotNm, '@nx', 'devkit_tmp_38916'), { recursive: true });
  writeFileSync(join(slotNm, '@nx', 'devkit_tmp_38916', 'package.json'), '{}');
}

/** Run link.mjs expecting a non-zero exit; returns { status, output }. */
function runLinkExpectFail(args, env) {
  try {
    const out = runLink(args, env);
    return { status: 0, output: out };
  } catch (err) {
    return {
      status: err.status,
      output: `${err.stdout ?? ''}\n${err.stderr ?? ''}`,
    };
  }
}

/**
 * A fake `pnpm` on PATH that "installs" by creating a minimal healthy
 * node_modules in cwd — lets tests exercise the materialise path without a
 * real pnpm install.
 */
function makeFakePnpm(binDir) {
  mkdirSync(binDir, { recursive: true });
  if (process.platform === 'win32') {
    writeFileSync(
      join(binDir, 'pnpm.cmd'),
      [
        '@echo off',
        'mkdir node_modules\\nx',
        'echo {"name":"nx"} > node_modules\\nx\\package.json',
        'mkdir node_modules\\.bin',
        'echo x > node_modules\\.bin\\placeholder',
        'echo x > node_modules\\.bin\\nx',
        'echo hoistedDependencies: {} > node_modules\\.modules.yaml',
      ].join('\r\n') + '\r\n',
    );
  } else {
    const p = join(binDir, 'pnpm');
    writeFileSync(
      p,
      '#!/bin/sh\nmkdir -p node_modules/nx node_modules/.bin\n' +
        'echo \'{"name":"nx"}\' > node_modules/nx/package.json\n' +
        'echo x > node_modules/.bin/placeholder\n' +
        'echo x > node_modules/.bin/nx\n' +
        'echo "hoistedDependencies: {}" > node_modules/.modules.yaml\n',
    );
    chmodSync(p, 0o755);
  }
}

/** Env overriding PATH so the fake pnpm wins the lookup. */
function fakePnpmEnv(binDir) {
  const env = { ...process.env };
  const current = env.PATH ?? env.Path ?? '';
  delete env.Path;
  env.PATH = binDir + delimiter + current;
  return env;
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

test(
  '--check exits 0 on a healthy, linked slot',
  // --check also verifies the worktree's node_modules link (LS-10941), so the
  // worktree must be linked first — which needs symlink capability.
  { skip: SYMLINK_OK ? false : 'no symlink capability' },
  () => {
    const root = freshMainRepo();
    try {
      const wt = makeWorktree(root, 'wt1');
      prebuildSlot(root, wt);
      runLink([`--worktree=${wt}`, `--main-repo=${root}`]);
      const out = runLink([
        `--worktree=${wt}`,
        `--main-repo=${root}`,
        '--check',
      ]);
      assert.match(out, /slot is healthy/);
      assert.match(out, /worktree node_modules link is healthy/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test('--check exits 1 and names each finding on a corrupt slot', () => {
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
    corruptSlot(slotNm);
    // Extra signatures: a top-level orphan tmp dir and a .pnpm orphan tmp dir.
    mkdirSync(join(slotNm, 'left-pad_tmp_123'));
    mkdirSync(join(slotNm, '.pnpm', 'foo@1.0.0_tmp_99'), { recursive: true });

    const { status, output } = runLinkExpectFail([
      `--worktree=${wt}`,
      `--main-repo=${root}`,
      '--check',
    ]);
    assert.equal(status, 1, '--check must exit 1 on a corrupt slot');
    assert.match(output, /@nx\/devkit: missing package\.json/);
    assert.match(output, /@nx\/devkit_tmp_38916: orphan _tmp_ dir/);
    assert.match(output, /left-pad_tmp_123: orphan _tmp_ dir/);
    assert.match(output, /\.pnpm\/foo@1\.0\.0_tmp_99: orphan _tmp_ dir/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('--check exits 1 when nx package exists and .bin is non-empty but .bin/nx itself is missing (PR #6130 incident)', () => {
  // Reproduces the corruption seen recovering PR #6130: a partial install left
  // node_modules/nx/ present and node_modules/.bin/ non-empty (other shims
  // installed), but node_modules/.bin/nx absent — the old shallow check
  // (nx dir exists + .bin non-empty) reported this slot as healthy.
  const root = freshMainRepo();
  try {
    const wt = makeWorktree(root, 'wt1');
    const hash = runLink([
      `--worktree=${wt}`,
      `--main-repo=${root}`,
      '--print-hash',
    ]).trim();
    const slotNm = join(root, '.modules-pool', hash, 'node_modules');
    mkdirSync(join(slotNm, 'nx'), { recursive: true });
    writeFileSync(join(slotNm, 'nx', 'package.json'), '{"name":"nx"}');
    mkdirSync(join(slotNm, '.bin'), { recursive: true });
    writeFileSync(join(slotNm, '.bin', 'placeholder'), ''); // some other bin, not nx

    const { status, output } = runLinkExpectFail([
      `--worktree=${wt}`,
      `--main-repo=${root}`,
      '--check',
    ]);
    assert.equal(status, 1, '--check must exit 1 when .bin/nx is missing');
    assert.match(output, /\.bin\/nx missing/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('--check exits 1 when .modules.yaml is missing (LS-9210)', () => {
  // Reproduces the LS-9210 gap: a node_modules with tsx/nx present and .bin
  // populated (the old checks all pass) but assembled by something other
  // than a completed `pnpm install` — pnpm's own install-completion marker,
  // .modules.yaml, was never written. nx's project-graph plugin refuses to
  // run against such a tree even though every individual package resolves.
  const root = freshMainRepo();
  try {
    const wt = makeWorktree(root, 'wt1');
    const hash = runLink([
      `--worktree=${wt}`,
      `--main-repo=${root}`,
      '--print-hash',
    ]).trim();
    const slotNm = join(root, '.modules-pool', hash, 'node_modules');
    mkdirSync(join(slotNm, 'nx'), { recursive: true });
    writeFileSync(join(slotNm, 'nx', 'package.json'), '{"name":"nx"}');
    mkdirSync(join(slotNm, '.bin'), { recursive: true });
    writeFileSync(join(slotNm, '.bin', 'placeholder'), '');
    writeFileSync(join(slotNm, '.bin', 'nx'), '');
    // Deliberately no .modules.yaml written.

    const { status, output } = runLinkExpectFail([
      `--worktree=${wt}`,
      `--main-repo=${root}`,
      '--check',
    ]);
    assert.equal(
      status,
      1,
      '--check must exit 1 when .modules.yaml is missing',
    );
    assert.match(output, /\.modules\.yaml missing/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('--assess-path exits 1 and names .modules.yaml missing on a plain (non-pool) node_modules', () => {
  // This is the exact entry point cloud-setup.sh's node_modules_healthy()
  // uses for cloud sessions, which have a plain node_modules with no
  // .modules-pool involved.
  const nmPath = mkdtempSync(join(tmpdir(), 'mp-assess-'));
  try {
    mkdirSync(join(nmPath, 'nx'), { recursive: true });
    writeFileSync(join(nmPath, 'nx', 'package.json'), '{"name":"nx"}');
    mkdirSync(join(nmPath, '.bin'), { recursive: true });
    writeFileSync(join(nmPath, '.bin', 'nx'), '');

    const { status, output } = runLinkExpectFail([`--assess-path=${nmPath}`]);
    assert.equal(status, 1);
    assert.match(output, /\.modules\.yaml missing/);
  } finally {
    rmSync(nmPath, { recursive: true, force: true });
  }
});

test('--assess-path exits 0 on a healthy plain node_modules', () => {
  const nmPath = mkdtempSync(join(tmpdir(), 'mp-assess-'));
  try {
    makeHealthyNodeModules(nmPath);
    const out = runLink([`--assess-path=${nmPath}`]);
    assert.match(out, /healthy/);
  } finally {
    rmSync(nmPath, { recursive: true, force: true });
  }
});

test('--check exits 1 when the slot is not built', () => {
  const root = freshMainRepo();
  try {
    const wt = makeWorktree(root, 'wt1');
    const { status, output } = runLinkExpectFail([
      `--worktree=${wt}`,
      `--main-repo=${root}`,
      '--check',
    ]);
    assert.equal(status, 1);
    assert.match(output, /slot not built/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test(
  'a corrupt slot is quarantined and rebuilt instead of linked',
  { skip: SYMLINK_OK ? false : 'no symlink capability' },
  () => {
    const root = freshMainRepo();
    try {
      const wt = makeWorktree(root, 'wt1');
      const hash = prebuildSlot(root, wt);
      const pool = join(root, '.modules-pool');
      const slotNm = join(pool, hash, 'node_modules');
      corruptSlot(slotNm);

      const shim = join(root, 'fake-bin');
      makeFakePnpm(shim);
      const out = runLink(
        [`--worktree=${wt}`, `--main-repo=${root}`],
        fakePnpmEnv(shim),
      );

      assert.match(out, /\[quarantine\]/, 'must announce the quarantine');
      assert.match(out, /slot materialised and linked/);
      const quarantined = readdirSync(pool).filter((n) =>
        n.startsWith(`${hash}.corrupt-`),
      );
      assert.equal(quarantined.length, 1, 'corrupt slot must be renamed aside');
      assert.ok(
        existsSync(join(pool, quarantined[0], 'node_modules', '@nx', 'devkit')),
        'quarantined copy must retain the corrupt content',
      );
      assert.ok(
        existsSync(join(slotNm, 'nx', 'package.json')),
        'a fresh healthy slot must be published under the same hash',
      );
      assert.ok(
        !existsSync(join(slotNm, '@nx', 'devkit_tmp_38916')),
        'the fresh slot must not contain the corruption',
      );
      assert.equal(
        realpathSync(join(wt, 'node_modules')),
        realpathSync(slotNm),
        'worktree must link to the rebuilt slot',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  'quarantine sweeps a dangling nested node_modules symlink left pointing at the renamed-away slot (LS-9745)',
  { skip: SYMLINK_OK ? false : 'no symlink capability' },
  () => {
    const root = freshMainRepo();
    try {
      const wt = makeWorktree(root, 'dangling-nested-wt', LOCK_WORKSPACE);
      const hash = runLink([
        `--worktree=${wt}`,
        `--main-repo=${root}`,
        '--print-hash',
      ]).trim();
      const pool = join(root, '.modules-pool');
      const slotNm = join(pool, hash, 'node_modules');
      makeHealthyNodeModules(slotNm);
      // A non-scoped nested capture — relinkNestedNodeModulesDir falls back to
      // linking straight at the slot's own copy for these (only @legacy-sports
      // scoped entries resolve to the worktree's own source per LS-9563), so
      // this entry is exactly the kind that goes dangling when the slot is
      // quarantined out from under it.
      const slotNested = join(
        pool,
        hash,
        'nested',
        'apps',
        'app',
        'node_modules',
      );
      mkdirSync(slotNested, { recursive: true });
      writeFileSync(join(slotNested, 'marker.txt'), 'x');

      // Pool hit: links the nested entry back into the worktree as a real,
      // per-worktree directory containing a symlink to the slot's capture.
      runLink([`--worktree=${wt}`, `--main-repo=${root}`]);
      const appNm = join(wt, 'apps', 'app', 'node_modules');
      const markerLink = join(appNm, 'marker.txt');
      assert.ok(
        lstatSync(markerLink).isSymbolicLink(),
        'precondition: marker.txt must be linked into the worktree',
      );

      // Corrupt the slot so the next run quarantines (renames aside) the
      // ENTIRE slot dir — node_modules AND its nested/ capture — leaving
      // markerLink dangling.
      corruptSlot(slotNm);
      const shim = join(root, 'fake-bin');
      makeFakePnpm(shim); // plain fake install — no nested output, isolates the sweep
      const out = runLink(
        [`--worktree=${wt}`, `--main-repo=${root}`],
        fakePnpmEnv(shim),
      );

      assert.match(out, /\[quarantine\]/);
      assert.match(
        out,
        /removed \d+ dangling nested node_modules symlink/,
        'quarantine must report sweeping the dangling nested symlink',
      );
      assert.match(out, /slot materialised and linked/);
      assert.ok(
        !lstatExistsHelper(markerLink),
        'the dangling nested symlink must be swept, not left pointing at nothing',
      );

      // The quarantined copy must still hold the original nested capture —
      // sweeping the worktree's dangling link must not touch the quarantined
      // content itself.
      const quarantined = readdirSync(pool).filter((n) =>
        n.startsWith(`${hash}.corrupt-`),
      );
      assert.equal(quarantined.length, 1);
      assert.ok(
        existsSync(
          join(
            pool,
            quarantined[0],
            'nested',
            'apps',
            'app',
            'node_modules',
            'marker.txt',
          ),
        ),
        'quarantined slot must retain its original nested capture',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  'a pruned slot leaves dangling nested symlinks: --check reports them and the install sweeps them (LS-10367)',
  { skip: SYMLINK_OK ? false : 'no symlink capability' },
  () => {
    const root = freshMainRepo();
    try {
      const wt = makeWorktree(root, 'pruned-nested-wt', LOCK_WORKSPACE);
      const hash = runLink([
        `--worktree=${wt}`,
        `--main-repo=${root}`,
        '--print-hash',
      ]).trim();
      const pool = join(root, '.modules-pool');
      const slotDir = join(pool, hash);
      makeHealthyNodeModules(join(slotDir, 'node_modules'));
      const slotBin = join(
        slotDir,
        'nested',
        'apps',
        'app',
        'node_modules',
        '.bin',
      );
      mkdirSync(slotBin, { recursive: true });
      writeFileSync(join(slotBin, 'tool'), 'x');

      runLink([`--worktree=${wt}`, `--main-repo=${root}`]);
      const binLink = join(wt, 'apps', 'app', 'node_modules', '.bin');
      assert.ok(
        lstatSync(binLink).isSymbolicLink(),
        'precondition: .bin must be linked into the worktree',
      );

      // gc.mjs prunes the slot outright — nothing is quarantined, so the
      // quarantine path never runs and .bin is left dangling.
      rmSync(slotDir, { recursive: true, force: true });
      assert.ok(!existsSync(binLink), 'precondition: .bin must now dangle');

      const check = spawnSync(
        'node',
        [LINK, `--worktree=${wt}`, `--main-repo=${root}`, '--check'],
        { encoding: 'utf-8' },
      );
      assert.equal(check.status, 1);
      assert.match(check.stdout, /dangling nested node_modules symlinks/);
      assert.ok(check.stdout.includes(binLink), '--check must name the link');

      const shim = join(root, 'fake-bin');
      makeFakePnpm(shim);
      const out = runLink(
        [`--worktree=${wt}`, `--main-repo=${root}`],
        fakePnpmEnv(shim),
      );
      assert.doesNotMatch(
        out,
        /\[quarantine\]/,
        'no slot existed to quarantine',
      );
      assert.match(out, /\[sweep\] removed 1 dangling nested/);
      assert.match(out, /slot materialised and linked/);
      assert.ok(
        !lstatExistsHelper(binLink),
        'the dangling .bin link must be swept before the install',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

function lstatExistsHelper(p) {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

test(
  '--rebuild quarantines and re-materialises even a healthy slot',
  { skip: SYMLINK_OK ? false : 'no symlink capability' },
  () => {
    const root = freshMainRepo();
    try {
      const wt = makeWorktree(root, 'wt1');
      const hash = prebuildSlot(root, wt);
      const pool = join(root, '.modules-pool');

      const shim = join(root, 'fake-bin');
      makeFakePnpm(shim);
      const out = runLink(
        [`--worktree=${wt}`, `--main-repo=${root}`, '--rebuild'],
        fakePnpmEnv(shim),
      );

      assert.match(out, /--rebuild requested/);
      assert.match(out, /slot materialised and linked/);
      const quarantined = readdirSync(pool).filter((n) =>
        n.startsWith(`${hash}.corrupt-`),
      );
      assert.equal(quarantined.length, 1, 'healthy slot must be renamed aside');
      assert.ok(
        existsSync(join(pool, hash, 'node_modules', 'nx', 'package.json')),
        'a fresh slot must be published under the same hash',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

// --- nested workspace node_modules (LS-9421 follow-up) -----------------------
// The pool historically snapshotted only the root node_modules. Metro (React
// Native, apps/app) resolves @legacy-sports/* imports via the NESTED
// per-package node_modules pnpm creates for workspace deps (no
// tsconfig-paths equivalent), so those must be captured into the slot and
// symlinked back into the worktree too — on both the materialise (miss) and
// link (hit) paths.

const LOCK_WORKSPACE =
  'lockfileVersion: 9\n' +
  'importers:\n' +
  '  .: {}\n' +
  '  apps/app:\n' +
  '    dependencies:\n' +
  "      '@legacy-sports/shared-components': link:../../lib/shared-components\n" +
  '  lib/shared-components: {}\n';

/** Fake pnpm that also creates nested per-package node_modules dirs, mirroring
 * what a real `pnpm install` produces for workspace-protocol deps under
 * hoisted linking. */
function makeFakePnpmWithNested(binDir) {
  mkdirSync(binDir, { recursive: true });
  if (process.platform === 'win32') {
    writeFileSync(
      join(binDir, 'pnpm.cmd'),
      [
        '@echo off',
        'mkdir node_modules\\nx',
        'echo {"name":"nx"} > node_modules\\nx\\package.json',
        'mkdir node_modules\\.bin',
        'echo x > node_modules\\.bin\\placeholder',
        'echo x > node_modules\\.bin\\nx',
        'echo hoistedDependencies: {} > node_modules\\.modules.yaml',
        'mkdir apps\\app\\node_modules\\@legacy-sports\\shared-components',
        'echo {} > apps\\app\\node_modules\\@legacy-sports\\shared-components\\package.json',
        'mkdir lib\\shared-components\\node_modules',
      ].join('\r\n') + '\r\n',
    );
  } else {
    const p = join(binDir, 'pnpm');
    writeFileSync(
      p,
      '#!/bin/sh\nmkdir -p node_modules/nx node_modules/.bin\n' +
        'echo \'{"name":"nx"}\' > node_modules/nx/package.json\n' +
        'echo x > node_modules/.bin/placeholder\n' +
        'echo x > node_modules/.bin/nx\n' +
        'echo "hoistedDependencies: {}" > node_modules/.modules.yaml\n' +
        'mkdir -p apps/app/node_modules/@legacy-sports/shared-components\n' +
        "echo '{}' > apps/app/node_modules/@legacy-sports/shared-components/package.json\n" +
        'mkdir -p lib/shared-components/node_modules\n',
    );
    chmodSync(p, 0o755);
  }
}

test(
  'materialise captures nested workspace node_modules into the slot and links them back',
  { skip: SYMLINK_OK ? false : 'no symlink capability' },
  () => {
    const root = freshMainRepo();
    try {
      const wt = makeWorktree(root, 'nested-wt', LOCK_WORKSPACE);
      // Give the workspace member a real package.json so
      // buildWorkspacePackageNameMap() can resolve
      // "@legacy-sports/shared-components" straight to this worktree's own
      // lib/shared-components — the whole point of LS-9563.
      mkdirSync(join(wt, 'lib', 'shared-components'), { recursive: true });
      writeFileSync(
        join(wt, 'lib', 'shared-components', 'package.json'),
        JSON.stringify({ name: '@legacy-sports/shared-components' }),
      );
      const hash = runLink([
        `--worktree=${wt}`,
        `--main-repo=${root}`,
        '--print-hash',
      ]).trim();

      const shim = join(root, 'fake-bin');
      makeFakePnpmWithNested(shim);
      runLink([`--worktree=${wt}`, `--main-repo=${root}`], fakePnpmEnv(shim));

      const slotNested = join(root, '.modules-pool', hash, 'nested');
      assert.ok(
        existsSync(
          join(
            slotNested,
            'apps',
            'app',
            'node_modules',
            '@legacy-sports',
            'shared-components',
            'package.json',
          ),
        ),
        'nested node_modules must be captured into the slot',
      );

      // The outer per-package node_modules dir must be a REAL, worktree-local
      // directory — never a symlink straight into the shared pool slot
      // (LS-9563: the slot's own nested capture may belong to a different
      // worktree).
      const appNm = join(wt, 'apps', 'app', 'node_modules');
      assert.ok(
        !lstatSync(appNm).isSymbolicLink() && statSync(appNm).isDirectory(),
        'apps/app/node_modules must be a real, worktree-local directory',
      );
      const linkedPkg = join(appNm, '@legacy-sports', 'shared-components');
      assert.ok(
        lstatSync(linkedPkg).isSymbolicLink(),
        'the individual @legacy-sports/shared-components entry must be a symlink',
      );
      assert.equal(
        realpathSync(linkedPkg),
        realpathSync(join(wt, 'lib', 'shared-components')),
        "nested @legacy-sports/shared-components must link straight at THIS worktree's own source, not the pool slot",
      );

      const libNm = join(wt, 'lib', 'shared-components', 'node_modules');
      assert.ok(
        !lstatSync(libNm).isSymbolicLink() && statSync(libNm).isDirectory(),
        'lib/shared-components/node_modules must be a real, worktree-local directory too',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  'nested @legacy-sports symlinks always resolve to the CURRENT worktree, never a sibling worktree sharing the pool slot (LS-9563)',
  { skip: SYMLINK_OK ? false : 'no symlink capability' },
  () => {
    const root = freshMainRepo();
    try {
      const wt1 = makeWorktree(root, 'wt1-nested', LOCK_WORKSPACE);
      const wt2 = makeWorktree(root, 'wt2-nested', LOCK_WORKSPACE);
      for (const wt of [wt1, wt2]) {
        mkdirSync(join(wt, 'lib', 'shared-components'), { recursive: true });
        writeFileSync(
          join(wt, 'lib', 'shared-components', 'package.json'),
          JSON.stringify({ name: '@legacy-sports/shared-components' }),
        );
      }

      const shim = join(root, 'fake-bin');
      makeFakePnpmWithNested(shim);
      // wt1 materialises the shared pool slot (pool miss).
      runLink([`--worktree=${wt1}`, `--main-repo=${root}`], fakePnpmEnv(shim));
      // wt2 shares the same lockfile hash — a pool HIT against the slot wt1
      // just built.
      runLink([`--worktree=${wt2}`, `--main-repo=${root}`]);

      const link1 = join(
        wt1,
        'apps',
        'app',
        'node_modules',
        '@legacy-sports',
        'shared-components',
      );
      const link2 = join(
        wt2,
        'apps',
        'app',
        'node_modules',
        '@legacy-sports',
        'shared-components',
      );
      assert.equal(
        realpathSync(link1),
        realpathSync(join(wt1, 'lib', 'shared-components')),
        "wt1's nested symlink must resolve to wt1's own source",
      );
      assert.equal(
        realpathSync(link2),
        realpathSync(join(wt2, 'lib', 'shared-components')),
        "wt2's nested symlink must resolve to wt2's own source, not wt1's (LS-9563)",
      );
      assert.notEqual(
        realpathSync(link1),
        realpathSync(link2),
        'sibling worktrees sharing a pool slot must never resolve a workspace package to the same source directory',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  'pool hit links nested workspace node_modules from an existing slot capture',
  { skip: SYMLINK_OK ? false : 'no symlink capability' },
  () => {
    const root = freshMainRepo();
    try {
      const wt = makeWorktree(root, 'nested-hit-wt', LOCK_WORKSPACE);
      const hash = runLink([
        `--worktree=${wt}`,
        `--main-repo=${root}`,
        '--print-hash',
      ]).trim();
      const slotNm = join(root, '.modules-pool', hash, 'node_modules');
      makeHealthyNodeModules(slotNm);
      const slotNested = join(
        root,
        '.modules-pool',
        hash,
        'nested',
        'apps',
        'app',
        'node_modules',
      );
      mkdirSync(slotNested, { recursive: true });
      writeFileSync(join(slotNested, 'marker.txt'), 'x');

      runLink([`--worktree=${wt}`, `--main-repo=${root}`]);

      // The outer dir is real and worktree-local (LS-9563); the individual
      // captured entry is what gets linked.
      const appNm = join(wt, 'apps', 'app', 'node_modules');
      assert.ok(
        !lstatSync(appNm).isSymbolicLink() && statSync(appNm).isDirectory(),
        'apps/app/node_modules must be a real, worktree-local directory on a cache hit too',
      );
      const markerLink = join(appNm, 'marker.txt');
      assert.ok(lstatSync(markerLink).isSymbolicLink());
      assert.equal(
        realpathSync(markerLink),
        realpathSync(join(slotNested, 'marker.txt')),
      );

      // Idempotent.
      runLink([`--worktree=${wt}`, `--main-repo=${root}`]);
      assert.equal(
        realpathSync(markerLink),
        realpathSync(join(slotNested, 'marker.txt')),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

const LOCK_EVIL =
  'lockfileVersion: 9\n' +
  'importers:\n' +
  '  .: {}\n' +
  "  '../evil-sibling': {}\n" +
  '  apps/app: {}\n';

test(
  'materialise ignores a path-traversal importer entry instead of moving files outside the worktree (security)',
  { skip: SYMLINK_OK ? false : 'no symlink capability' },
  () => {
    const root = freshMainRepo();
    try {
      const wt = makeWorktree(root, 'evil-wt', LOCK_EVIL);
      // Simulate a directory sitting where the traversal would land — a
      // sibling worktree's node_modules, one level up from this worktree.
      const evilNm = join(
        root,
        '.claude',
        'worktrees',
        'evil-sibling',
        'node_modules',
      );
      mkdirSync(evilNm, { recursive: true });
      writeFileSync(join(evilNm, 'marker.txt'), 'do-not-move-me');

      const shim = join(root, 'fake-bin');
      makeFakePnpm(shim); // root-only fake install — apps/app importer captures nothing, which is fine
      // console.warn (the traversal rejection) goes to stderr, not the
      // stdout runLink() returns — capture both via spawnSync directly.
      const result = spawnSync(
        'node',
        [LINK, `--worktree=${wt}`, `--main-repo=${root}`],
        { encoding: 'utf-8', env: fakePnpmEnv(shim) },
      );
      const out = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;

      assert.match(
        out,
        /ignoring suspicious importer path.*\.\.\/evil-sibling/,
        'the traversal path must be rejected with a warning',
      );
      assert.ok(
        existsSync(join(evilNm, 'marker.txt')),
        'the sibling directory must be untouched — never captured into the pool slot',
      );

      const hash = runLink([
        `--worktree=${wt}`,
        `--main-repo=${root}`,
        '--print-hash',
      ]).trim();
      assert.ok(
        !existsSync(
          join(root, '.modules-pool', hash, 'nested', '..', 'evil-sibling'),
        ),
        'no pool content should reference the traversal path',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  'nested linking is a silent no-op for a slot built before this feature (no nested/ dir)',
  { skip: SYMLINK_OK ? false : 'no symlink capability' },
  () => {
    const root = freshMainRepo();
    try {
      const wt = makeWorktree(root, 'no-nested-wt', LOCK_WORKSPACE);
      prebuildSlot(root, wt);

      const out = runLink([`--worktree=${wt}`, `--main-repo=${root}`]);
      assert.match(out, /node_modules → pool slot \(cache hit\)/);
      assert.ok(
        !existsSync(join(wt, 'apps', 'app', 'node_modules')),
        'no nested link should be created when the slot has no nested/ capture',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

// --- EPERM self-heal on a locked package dir (LS-9442) -----------------------
// pnpm's install-time unlink of a native binary this session's own tsx-based
// MCP servers hold open (e.g. node_modules/tsx/node_modules/@esbuild/*/
// esbuild.exe) EPERMs even though renaming the same path succeeds. pnpmInstall()
// must rename the locked top-level package dir OUT of node_modules and retry
// once instead of surfacing the raw failure.

/**
 * Fake pnpm that fails the first invocation with pnpm's exact ERR_PNPM_EPERM
 * shape after planting the locked file the error names (so the top-level
 * package dir genuinely exists for the self-heal to find), then succeeds on
 * the second invocation. Invocation count is tracked via COUNTER_FILE (env)
 * since each attempt is a fresh process.
 */
function makeFakePnpmEpermThenSucceed(binDir) {
  mkdirSync(binDir, { recursive: true });
  if (process.platform === 'win32') {
    writeFileSync(
      join(binDir, 'pnpm.cmd'),
      [
        '@echo off',
        'set /a c=0',
        'if exist "%COUNTER_FILE%" set /p c=<"%COUNTER_FILE%"',
        'set /a c+=1',
        'echo %c% > "%COUNTER_FILE%"',
        'if %c%==1 (',
        '  mkdir node_modules\\tsx\\node_modules\\@esbuild\\win32-x64',
        '  echo x > node_modules\\tsx\\node_modules\\@esbuild\\win32-x64\\esbuild.exe',
        "  echo ERR_PNPM_EPERM  EPERM: operation not permitted, unlink 'node_modules\\tsx\\node_modules\\@esbuild\\win32-x64\\esbuild.exe' 1>&2",
        '  exit /b 1',
        ') else (',
        '  mkdir node_modules\\nx',
        '  echo {"name":"nx"} > node_modules\\nx\\package.json',
        '  mkdir node_modules\\.bin',
        '  echo x > node_modules\\.bin\\placeholder',
        '  echo x > node_modules\\.bin\\nx',
        '  echo hoistedDependencies: {} > node_modules\\.modules.yaml',
        '  exit /b 0',
        ')',
      ].join('\r\n') + '\r\n',
    );
  } else {
    const p = join(binDir, 'pnpm');
    writeFileSync(
      p,
      [
        '#!/bin/sh',
        'c=0',
        '[ -f "$COUNTER_FILE" ] && c=$(cat "$COUNTER_FILE")',
        'c=$((c + 1))',
        'echo $c > "$COUNTER_FILE"',
        'if [ "$c" = "1" ]; then',
        '  mkdir -p node_modules/tsx/node_modules/@esbuild/linux-x64',
        '  touch node_modules/tsx/node_modules/@esbuild/linux-x64/esbuild',
        '  echo "ERR_PNPM_EPERM  EPERM: operation not permitted, unlink \'node_modules/tsx/node_modules/@esbuild/linux-x64/esbuild\'" 1>&2',
        '  exit 1',
        'else',
        '  mkdir -p node_modules/nx node_modules/.bin',
        '  echo \'{"name":"nx"}\' > node_modules/nx/package.json',
        '  echo x > node_modules/.bin/placeholder',
        '  echo x > node_modules/.bin/nx',
        '  echo "hoistedDependencies: {}" > node_modules/.modules.yaml',
        'fi',
      ].join('\n') + '\n',
    );
    chmodSync(p, 0o755);
  }
}

test(
  'materialise self-heals an ERR_PNPM_EPERM on a locked package dir by renaming it out of node_modules and retrying once (LS-9442)',
  { skip: SYMLINK_OK ? false : 'no symlink capability' },
  () => {
    const root = freshMainRepo();
    try {
      const wt = makeWorktree(root, 'eperm-wt');
      const shim = join(root, 'fake-bin');
      makeFakePnpmEpermThenSucceed(shim);
      const counterFile = join(root, 'attempt-count.txt');

      const out = runLink([`--worktree=${wt}`, `--main-repo=${root}`], {
        ...fakePnpmEnv(shim),
        COUNTER_FILE: counterFile,
      });

      assert.match(
        out,
        /ERR_PNPM_EPERM unlinking a file under node_modules\/tsx/,
      );
      assert.match(out, /Renaming it out of node_modules and retrying once/);
      assert.match(out, /slot materialised and linked/);
      assert.equal(readFileSync(counterFile, 'utf-8').trim(), '2');

      assert.ok(
        lstatSync(join(wt, 'node_modules')).isSymbolicLink(),
        'worktree node_modules must end up linked to the rebuilt slot',
      );

      const hash = runLink([
        `--worktree=${wt}`,
        `--main-repo=${root}`,
        '--print-hash',
      ]).trim();
      const slotNm = join(root, '.modules-pool', hash, 'node_modules');
      assert.ok(
        !existsSync(join(slotNm, 'tsx')),
        'the locked package dir must not be swept into the published slot',
      );
      const staleEntries = readdirSync(join(root, '.modules-pool')).filter(
        (n) => n.startsWith('.stale-'),
      );
      assert.equal(
        staleEntries.length,
        1,
        'the locked package dir must be renamed aside under the pool root, outside node_modules',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

// --- install guards: no writes through a pool symlink (LS-8548) --------------

const PNPMFILE = join(here, '..', '..', '.pnpmfile.cjs');
const PREINSTALL_GUARD = join(here, '..', 'preinstall-guard.js');

/** Fixture: a checkout whose node_modules symlinks into a pool slot. */
function makePoolLinkedCheckout(root) {
  const slotNm = join(
    root,
    '.modules-pool',
    'aaaabbbbccccdddd',
    'node_modules',
  );
  makeHealthyNodeModules(slotNm);
  const checkout = join(root, 'checkout');
  mkdirSync(checkout, { recursive: true });
  makeDirSymlink(join(checkout, 'node_modules'), slotNm);
  return checkout;
}

test(
  'pnpmfile pre-link hook blocks installs through a pool symlink even with FORCE_INSTALL=1',
  { skip: SYMLINK_OK ? false : 'no symlink capability' },
  () => {
    const root = freshMainRepo();
    try {
      const checkout = makePoolLinkedCheckout(root);
      let failed = null;
      try {
        execFileSync(
          'node',
          [
            '-e',
            `require(${JSON.stringify(PNPMFILE)}).hooks.afterAllResolved({}, { log() {} });`,
          ],
          {
            cwd: checkout,
            encoding: 'utf-8',
            env: { ...process.env, FORCE_INSTALL: '1' },
          },
        );
      } catch (err) {
        failed = err;
      }
      assert.ok(failed, 'hook must throw for a pool symlink');
      const output = String(failed.stderr ?? '');
      assert.match(output, /BLOCKED \(pre-link\)/);
      assert.match(output, /modules pool/);
      assert.match(output, /scripts\/modules-pool\/link\.mjs/);
      assert.match(output, /FORCE_INSTALL=1 does not bypass/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  'pnpmfile hook allows --lockfile-only through a pool symlink (no node_modules writes)',
  { skip: SYMLINK_OK ? false : 'no symlink capability' },
  () => {
    const root = freshMainRepo();
    try {
      const checkout = makePoolLinkedCheckout(root);
      // --lockfile-only resolves + rewrites pnpm-lock.yaml only; it is the
      // sanctioned way to refresh pnpmfileChecksum after .pnpmfile.cjs edits.
      const out = execFileSync(
        'node',
        [
          '-e',
          `process.argv.push('--lockfile-only');` +
            `const r = require(${JSON.stringify(PNPMFILE)}).hooks.afterAllResolved({ ok: 1 }, { log() {} });` +
            `process.stdout.write(JSON.stringify(r));`,
        ],
        { cwd: checkout, encoding: 'utf-8' },
      );
      assert.equal(out, '{"ok":1}', 'hook must return the lockfile untouched');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  'preinstall guard blocks installs through a pool symlink even with FORCE_INSTALL=1',
  { skip: SYMLINK_OK ? false : 'no symlink capability' },
  () => {
    const root = freshMainRepo();
    try {
      // The guard resolves node_modules relative to its own __dirname
      // (<root>/scripts/..), so install a copy into the fixture repo.
      mkdirSync(join(root, 'scripts'), { recursive: true });
      copyFileSync(
        PREINSTALL_GUARD,
        join(root, 'scripts', 'preinstall-guard.js'),
      );
      const slotNm = join(
        root,
        '.modules-pool',
        'aaaabbbbccccdddd',
        'node_modules',
      );
      makeHealthyNodeModules(slotNm);
      makeDirSymlink(join(root, 'node_modules'), slotNm);

      const { status, output } = runNodeExpectFail(
        join(root, 'scripts', 'preinstall-guard.js'),
        {
          FORCE_INSTALL: '1',
          npm_config_user_agent: 'pnpm/9.12.1 node/v22.0.0',
        },
      );
      assert.equal(status, 1, 'guard must exit 1 for a pool symlink');
      assert.match(output, /shared modules pool/);
      assert.match(output, /scripts\/modules-pool\/link\.mjs/);
      assert.match(output, /FORCE_INSTALL=1 does not bypass/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  'preinstall guard still honours FORCE_INSTALL=1 for non-pool symlinks',
  { skip: SYMLINK_OK ? false : 'no symlink capability' },
  () => {
    const root = freshMainRepo();
    try {
      mkdirSync(join(root, 'scripts'), { recursive: true });
      copyFileSync(
        PREINSTALL_GUARD,
        join(root, 'scripts', 'preinstall-guard.js'),
      );
      const target = join(root, 'some-shared', 'node_modules');
      makeHealthyNodeModules(target);
      makeDirSymlink(join(root, 'node_modules'), target);

      const { status } = runNodeExpectFail(
        join(root, 'scripts', 'preinstall-guard.js'),
        {
          FORCE_INSTALL: '1',
          npm_config_user_agent: 'pnpm/9.12.1 node/v22.0.0',
        },
      );
      assert.equal(status, 0, 'non-pool symlink must stay bypassable');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  'leaves no lock directory behind after a successful run (LS-9266)',
  { skip: SYMLINK_OK ? false : 'no symlink capability' },
  () => {
    const root = freshMainRepo();
    const binDir = mkdtempSync(join(tmpdir(), 'mp-test-bin-'));
    try {
      const wt = makeWorktree(root, 'lock-cleanup-wt');
      makeFakePnpm(binDir);
      runLink(['--worktree=' + wt, '--main-repo=' + root], fakePnpmEnv(binDir));
      assert.equal(
        existsSync(join(wt, '.modules-pool.lock')),
        false,
        'lock directory must be removed once the run completes',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(binDir, { recursive: true, force: true });
    }
  },
);

test(
  'reclaims a stale worktree lock instead of waiting out the full timeout (LS-9266)',
  { skip: SYMLINK_OK ? false : 'no symlink capability' },
  () => {
    const root = freshMainRepo();
    const binDir = mkdtempSync(join(tmpdir(), 'mp-test-bin-'));
    try {
      const wt = makeWorktree(root, 'stale-lock-wt');
      makeFakePnpm(binDir);
      const lockPath = join(wt, '.modules-pool.lock');
      // Simulate a prior link.mjs process that was killed (e.g. container
      // reaped mid-install) without releasing its lock: a lock dir whose
      // mtime is older than the script's own stale-reclaim threshold.
      mkdirSync(lockPath);
      const staleTime = new Date(Date.now() - 36 * 60_000); // > 35m LOCK_TIMEOUT_MS
      utimesSync(lockPath, staleTime, staleTime);

      const out = runLink(
        ['--worktree=' + wt, '--main-repo=' + root],
        fakePnpmEnv(binDir),
      );
      assert.match(out, /\[lock\] stale lock .* reclaiming/);
      assert.match(out, /\[ok\]/);
      assert.equal(
        existsSync(lockPath),
        false,
        'lock directory must be removed once the run completes',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(binDir, { recursive: true, force: true });
    }
  },
);

test('a live (fresh) lock held by another process makes a concurrent run wait, not corrupt, node_modules (LS-9266)', () => {
  const root = freshMainRepo();
  try {
    const wt = makeWorktree(root, 'held-lock-wt');
    const lockPath = join(wt, '.modules-pool.lock');
    mkdirSync(lockPath); // fresh — must NOT be reclaimed as stale

    // The waiting run must poll rather than fail fast or barrel through.
    const child = spawnSync(
      'node',
      [LINK, '--worktree=' + wt, '--main-repo=' + root],
      { encoding: 'utf-8', timeout: 2000 },
    );
    // `timeout` makes node send SIGTERM once elapsed; a run that respected
    // the lock is still waiting (signal set, no clean exit code yet). A run
    // that ignored the lock would have raced through materialisation and
    // exited 0 well within 2s.
    assert.notEqual(
      child.status,
      0,
      'run must still be waiting on the held lock, not have completed',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/** Run a node script expecting a possible non-zero exit. */
function runNodeExpectFail(scriptPath, env) {
  try {
    const out = execFileSync('node', [scriptPath], {
      encoding: 'utf-8',
      env: { ...process.env, ...env },
    });
    return { status: 0, output: out };
  } catch (err) {
    return {
      status: err.status,
      output: `${err.stdout ?? ''}\n${err.stderr ?? ''}`,
    };
  }
}
