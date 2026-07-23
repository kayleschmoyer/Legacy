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
  chmodSync,
  copyFileSync,
  symlinkSync,
  openSync,
  closeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, delimiter } from 'node:path';
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

/**
 * A fake but "healthy" node_modules: has nx/ (with a package.json — the deep
 * health check treats a package dir without one as corruption) and a
 * populated .bin/.
 */
function makeHealthyNodeModules(nmPath) {
  mkdirSync(join(nmPath, 'nx'), { recursive: true });
  writeFileSync(join(nmPath, 'nx', 'package.json'), '{"name":"nx"}');
  mkdirSync(join(nmPath, '.bin'), { recursive: true });
  writeFileSync(join(nmPath, '.bin', 'placeholder'), '');
  writeFileSync(join(nmPath, '.bin', 'nx'), '');
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
      ].join('\r\n') + '\r\n',
    );
  } else {
    const p = join(binDir, 'pnpm');
    writeFileSync(
      p,
      '#!/bin/sh\nmkdir -p node_modules/nx node_modules/.bin\n' +
        'echo \'{"name":"nx"}\' > node_modules/nx/package.json\n' +
        'echo x > node_modules/.bin/placeholder\n' +
        'echo x > node_modules/.bin/nx\n',
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

test('--check exits 0 on a healthy slot', () => {
  // --check never links, so this needs no symlink capability.
  const root = freshMainRepo();
  try {
    const wt = makeWorktree(root, 'wt1');
    prebuildSlot(root, wt);
    const out = runLink([`--worktree=${wt}`, `--main-repo=${root}`, '--check']);
    assert.match(out, /slot is healthy/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

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
