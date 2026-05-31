#!/usr/bin/env node
/**
 * modules-pool: link a worktree's node_modules to a content-addressable snapshot.
 *
 * Phase 0 (opt-in) of docs/rfcs/modules-pool/README.md. Replaces the single
 * mutable shared node_modules + symlink with a pool of IMMUTABLE snapshots keyed
 * by a hash of the worktree's pnpm-lock.yaml:
 *
 *   <main-repo>/.modules-pool/<hash>/node_modules     (git-ignored, written once)
 *
 * Each worktree's node_modules becomes a directory symlink into the slot that
 * matches ITS OWN lockfile. Because a slot is never mutated after it is built,
 * installing/updating packages in one worktree can never:
 *   - trigger EPERM by unlinking a native binary another worktree holds open, or
 *   - change the packages a different worktree is running.
 *
 * Algorithm (see RFC §4.1):
 *   1. hash = sha256(pnpm-lock.yaml [+ packageManager])
 *   2. pool hit  -> repoint the worktree's node_modules symlink at the slot.
 *   3. pool miss -> `pnpm install --frozen-lockfile` in the worktree, move the
 *      result into <pool>/.tmp-<pid>, atomic-rename to <pool>/<hash>, then symlink.
 *
 * After linking node_modules it also symlinks the main repo's gitignored secret
 * env files (.env, .env.local) into the worktree — what lets agents run
 * integration tests and pick up MCP_* credentials. This mirrors the behaviour of
 * the SessionStart hook before the pool became the default resolver.
 *
 * Run with plain `node` — no tsx, no pnpm-for-resolution, no MCP required. This is
 * intentionally dependency-free so it works when node_modules is absent and runs
 * before tsx/MCP exist (it is the SessionStart hook's node_modules resolver).
 *
 * Usage:
 *   node scripts/modules-pool/link.mjs [--worktree=<path>] [--main-repo=<path>]
 *                                      [--no-salt] [--print-hash]
 *
 * --worktree    Absolute path to the worktree. Defaults to cwd.
 * --main-repo   Absolute path to the main repo root (holds .modules-pool). Auto-
 *               detected when omitted (native `.claude/worktrees/<name>` and
 *               sibling `<repo>.worktrees/<name>` layouts, or the main repo itself).
 * --no-salt     Hash the lockfile only (omit the pnpm version salt).
 * --print-hash  Print the resolved hash and exit (no filesystem changes).
 */

import {
  existsSync,
  lstatSync,
  readdirSync,
  realpathSync,
  readFileSync,
  mkdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  readlinkSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const POOL_DIRNAME = '.modules-pool';
const HASH_LEN = 16; // 16 hex chars of sha256 — ample collision resistance for a per-repo pool

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
const args = Object.fromEntries(
  process.argv.slice(2).flatMap((arg) => {
    const m = arg.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [[m[1], m[2] ?? true]] : [];
  }),
);

const cwd = process.cwd();
// --worktree, or (when invoked via `make modules-link WT=…`) the make-exported
// MODULES_POOL_WT env var. Routing WT through the environment rather than
// interpolating it into the shell command line avoids argument injection.
const wtArg = args.worktree ?? nonEmpty(process.env.MODULES_POOL_WT);
const worktree = wtArg ? resolve(String(wtArg)) : cwd;
const mainRepo = resolveMainRepo(worktree, args['main-repo']);

const poolRoot = join(mainRepo, POOL_DIRNAME);
const lockfilePath = join(worktree, 'pnpm-lock.yaml');
const nmPath = join(worktree, 'node_modules');

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
if (!existsSync(lockfilePath)) {
  fail(`No pnpm-lock.yaml found at:\n  ${lockfilePath}`);
}

const hash = computeHash(lockfilePath, !args['no-salt'] ? worktree : null);

if (args['print-hash']) {
  process.stdout.write(hash + '\n');
  process.exit(0);
}

const slotDir = join(poolRoot, hash);
const slotNm = join(slotDir, 'node_modules');

console.log('[modules-pool/link]');
console.log(`  worktree : ${worktree}`);
console.log(`  main repo: ${mainRepo}`);
console.log(`  pool     : ${poolRoot}`);
console.log(`  hash     : ${hash}`);
console.log('');

if (isHealthy(slotNm)) {
  console.log('[hit] pool slot already built — linking.');
  linkWorktreeToSlot(slotNm);
  console.log('[ok] node_modules → pool slot (cache hit).');
} else {
  console.log('[miss] no healthy slot for this lockfile — materialising.');
  materialiseSlot();
  linkWorktreeToSlot(slotNm);
  console.log('[ok] slot materialised and linked.');
}

// Link the main repo's gitignored secret env files (.env, .env.local) into the
// worktree, mirroring the behaviour the SessionStart hook relied on before the
// pool became the default resolver. The .env link is what lets agents run
// integration tests (playwright.integration.config.ts loads <repo>/.env) and
// pick up MCP_* credentials. Failures here are non-fatal: node_modules — the
// primary mission — is already linked.
linkSecretEnvFiles();

// ---------------------------------------------------------------------------
// Materialisation (pool miss)
// ---------------------------------------------------------------------------
function materialiseSlot() {
  // pnpm needs to write a real node_modules in the worktree, so clear any
  // existing symlink/dir first.
  removeNodeModulesEntry(nmPath);

  console.log('[install] pnpm install --frozen-lockfile (in worktree)…');
  pnpmInstall(worktree);

  if (!isHealthy(nmPath)) {
    fail(
      'pnpm install completed but worktree node_modules is not healthy ' +
        '(missing nx or empty .bin). Aborting before publish.',
    );
  }

  mkdirSync(poolRoot, { recursive: true });

  // Another worktree may have materialised the same hash while we installed.
  if (isHealthy(slotNm)) {
    console.log('[race] slot appeared during install — discarding our copy.');
    removeNodeModulesEntry(nmPath);
    return;
  }

  // Build the slot in a temp dir on the same volume, then atomic-rename. The
  // rename is the commit point; a concurrent loser just discards its tmp dir.
  const tmpSlot = join(poolRoot, `.tmp-${process.pid}-${hash}`);
  removeDir(tmpSlot);
  mkdirSync(tmpSlot, { recursive: true });
  renameSync(nmPath, join(tmpSlot, 'node_modules'));

  try {
    renameSync(tmpSlot, slotDir);
  } catch (err) {
    // Lost the race at the rename boundary: a sibling published first. Keep theirs.
    if (isHealthy(slotNm)) {
      console.log(
        '[race] slot published by another process — discarding our copy.',
      );
      removeDir(tmpSlot);
    } else {
      removeDir(tmpSlot);
      fail(`Failed to publish slot: ${String(err.message ?? err)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Symlinking
// ---------------------------------------------------------------------------
function linkWorktreeToSlot(target) {
  // Already correctly linked?
  if (lstatExists(nmPath)) {
    const st = safeLstat(nmPath);
    if (st && st.isSymbolicLink()) {
      const cur = safeRealpath(nmPath) ?? safeReadlink(nmPath);
      if (cur && normalize(cur) === normalize(target)) return;
    }
    removeNodeModulesEntry(nmPath);
  }

  if (process.platform === 'win32') {
    // mklink /D = directory symlink (NOT a junction — safe for recursive-delete).
    // Requires Windows Developer Mode.
    let mkErr;
    try {
      execFileSync('cmd', ['/c', 'mklink', '/D', nmPath, target], {
        encoding: 'utf-8',
        timeout: 15_000,
      });
    } catch (err) {
      mkErr = err;
    }
    if (mkErr || !winPathIsContainer(nmPath)) {
      const msg = mkErr
        ? String(mkErr.message ?? mkErr)
        : 'mklink exited 0 but path is not accessible';
      const devMode = /privilege|EPERM|1314/i.test(msg);
      fail(
        `Failed to create directory symlink: ${msg}` +
          (devMode
            ? '\n\nDirectory symlinks require Windows Developer Mode.\n' +
              'Enable it: Settings > System > For Developers > Developer Mode'
            : ''),
      );
    }
  } else {
    symlinkSync(target, nmPath);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function resolveMainRepo(wt, explicit) {
  if (explicit) return resolve(String(explicit));
  // Native worktrees: <main>/.claude/worktrees/<name>
  const native = wt.match(/^(.+)[/\\]\.claude[/\\]worktrees[/\\][^/\\]+$/);
  if (native) return native[1];
  // Sibling worktrees: <parent>/<main>.worktrees/<ticket>
  const sibling = wt.match(/^(.+)[/\\]([^/\\]+)\.worktrees[/\\][^/\\]+$/);
  if (sibling) return join(sibling[1], sibling[2]);
  // Main repo itself (.git is a real directory in the primary worktree).
  try {
    if (lstatSync(join(wt, '.git')).isDirectory()) return wt;
  } catch {
    /* fall through */
  }
  fail(
    `Cannot auto-detect main repo from:\n  ${wt}\nPass --main-repo=<path> explicitly.`,
  );
}

function computeHash(lockPath, saltWorktree) {
  const h = createHash('sha256');
  h.update(readFileSync(lockPath));
  if (saltWorktree) {
    // Salt with the pinned pnpm version so a pnpm upgrade forces a fresh slot.
    const pm = readPackageManager(saltWorktree);
    if (pm) h.update('\0' + pm);
  }
  return h.digest('hex').slice(0, HASH_LEN);
}

function readPackageManager(wt) {
  try {
    const pkg = JSON.parse(readFileSync(join(wt, 'package.json'), 'utf-8'));
    return typeof pkg.packageManager === 'string' ? pkg.packageManager : null;
  } catch {
    return null;
  }
}

/** A node_modules tree is healthy if nx is present and .bin is populated. */
function isHealthy(nm) {
  try {
    if (!existsSync(join(nm, 'nx'))) return false;
    if (readdirSync(join(nm, '.bin')).length === 0) return false;
    return process.platform === 'win32' ? winPathIsContainer(nm) : true;
  } catch {
    return false;
  }
}

function pnpmInstall(cwdDir) {
  const opts = { cwd: cwdDir, stdio: 'inherit', timeout: 30 * 60_000 };
  if (process.platform === 'win32') {
    execFileSync('cmd', ['/c', 'pnpm', 'install', '--frozen-lockfile'], opts);
  } else {
    execFileSync('pnpm', ['install', '--frozen-lockfile'], opts);
  }
}

function removeNodeModulesEntry(p) {
  if (!lstatExists(p)) return;
  const st = safeLstat(p);
  // A junction reports as a symlink to lstat; rmdir via cmd is safest on Windows.
  if (st && st.isSymbolicLink()) {
    if (process.platform === 'win32') {
      try {
        execFileSync('cmd', ['/c', 'rmdir', p], {
          encoding: 'utf-8',
          timeout: 10_000,
        });
        return;
      } catch {
        /* fall through to rmSync */
      }
    }
    rmSync(p, { recursive: false, force: true });
    return;
  }
  removeDir(p);
}

function removeDir(p) {
  try {
    rmSync(p, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}

function winPathIsContainer(p) {
  if (process.platform !== 'win32') return true;
  try {
    const out = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Test-Path -LiteralPath '${p.replace(/'/g, "''")}' -PathType Container`,
      ],
      { encoding: 'utf-8', timeout: 10_000 },
    ).trim();
    return out === 'True';
  } catch {
    return false;
  }
}

function normalize(p) {
  let n = p;
  try {
    n = realpathSync(n);
  } catch {
    n = resolve(n);
  }
  if (process.platform === 'win32') {
    if (n.startsWith('\\\\?\\')) n = n.slice(4);
    n = n.toLowerCase();
  }
  return n;
}

function lstatExists(p) {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}
function safeLstat(p) {
  try {
    return lstatSync(p);
  } catch {
    return null;
  }
}
function safeRealpath(p) {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
}
function safeReadlink(p) {
  try {
    return readlinkSync(p);
  } catch {
    return null;
  }
}

function nonEmpty(v) {
  return v != null && v !== '' ? v : null;
}

// ---------------------------------------------------------------------------
// Secret env-file linking (.env, .env.local)
// ---------------------------------------------------------------------------
// These files live only in the main repo (gitignored, contain local creds).
// Symlinking — rather than copying — means rotations in main propagate to all
// worktrees automatically. All failures are non-fatal.
function linkSecretEnvFiles() {
  console.log('');
  for (const name of ['.env', '.env.local']) {
    linkEnvFile(name);
  }
}

function linkEnvFile(name) {
  const mainPath = join(mainRepo, name);
  const wtPath = join(worktree, name);

  if (!existsSync(mainPath)) {
    console.log(`[skip] ${name}: not present in main repo, nothing to link.`);
    return;
  }

  if (lstatExists(wtPath)) {
    const st = safeLstat(wtPath);
    if (st && st.isSymbolicLink()) {
      const target = safeRealpath(wtPath);
      if (target && normalize(target) === normalize(mainPath)) {
        console.log(`[ok] ${name}: symlink already points to main repo.`);
        return;
      }
      console.log(`[info] ${name}: symlink points elsewhere — replacing.`);
      try {
        rmSync(wtPath, { force: true });
      } catch (err) {
        // Could not drop the wrong-target link (e.g. a file lock). Bail without
        // creating a second link, but make it loud: the worktree is still
        // pointing at the WRONG file, so integration tests / MCP auth may read
        // stale values until it is fixed by hand.
        console.warn(
          `[warn] ${name}: could not remove the existing wrong-target symlink: ${String(err.message ?? err)}\n` +
            `       The worktree is still linked to an INCORRECT ${name}. Remove it manually ` +
            `(rm -f "${wtPath}") and re-run this resolver before relying on integration tests or MCP auth.`,
        );
        return;
      }
    } else {
      console.log(
        `[skip] ${name}: real file present in worktree (not a symlink). ` +
          'Delete it manually to switch to the linked copy.',
      );
      return;
    }
  }

  try {
    if (process.platform === 'win32') {
      // mklink without /D = file symlink. Requires Windows Developer Mode.
      execFileSync('cmd', ['/c', 'mklink', wtPath, mainPath], {
        encoding: 'utf-8',
        timeout: 10_000,
      });
    } else {
      symlinkSync(mainPath, wtPath, 'file');
    }
  } catch (err) {
    const msg = String(err.message ?? err);
    const devMode = /privilege|EPERM|1314/i.test(msg);
    console.warn(
      `[warn] ${name}: failed to create symlink: ${msg}` +
        (devMode
          ? '\n       File symlinks require Windows Developer Mode; ' +
            `copy the main repo's ${name} into this worktree manually instead.`
          : ''),
    );
    return;
  }
  console.log(`[ok] ${name}: linked → ${mainPath}`);
}

function fail(msg) {
  console.error(`[modules-pool/link][ERROR] ${msg}`);
  process.exit(1);
}
