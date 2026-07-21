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
 *                                      [--no-salt] [--print-hash] [--check] [--rebuild]
 *
 * --worktree    Absolute path to the worktree. Defaults to cwd.
 * --main-repo   Absolute path to the main repo root (holds .modules-pool). Auto-
 *               detected when omitted (native `.claude/worktrees/<name>` and
 *               sibling `<repo>.worktrees/<name>` layouts, or the main repo itself).
 * --no-salt     Hash the lockfile only (omit the pnpm version salt).
 * --print-hash  Print the resolved hash and exit (no filesystem changes).
 * --check       Doctor mode: run the deep health check on this lockfile's slot,
 *               print every finding, and exit 0 (healthy) / 1 (unhealthy or
 *               missing). No filesystem changes.
 * --rebuild     Quarantine this lockfile's slot (rename to <hash>.corrupt-<ts>)
 *               even if it passes the health check, then re-materialise. Use to
 *               force recovery from corruption the health check cannot see.
 *
 * Corruption recovery is otherwise automatic: an unhealthy slot (orphan pnpm
 * `*_tmp_*` dirs, packages missing package.json — the LS-8546/LS-8548 interrupted-
 * install signature) is quarantined and rebuilt on the next plain run.
 */

import {
  existsSync,
  lstatSync,
  statSync,
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

const noFrozenLockfile = Boolean(args['no-frozen-lockfile']);

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

const slotState = assessSlot(slotNm);

if (args['check']) {
  if (slotState.healthy) {
    console.log('[check] slot is healthy.');
    process.exit(0);
  }
  console.log('[check] slot is UNHEALTHY:');
  for (const f of slotState.findings) console.log(`  - ${f}`);
  console.log('');
  console.log(
    'Re-run without --check to quarantine and rebuild it automatically.',
  );
  process.exit(1);
}

if (slotState.healthy && !args['rebuild']) {
  console.log('[hit] pool slot already built — linking.');
  linkWorktreeToSlot(slotNm);
  console.log('[ok] node_modules → pool slot (cache hit).');
} else {
  if (existsSync(slotDir)) {
    quarantineSlot(
      args['rebuild'] && slotState.healthy
        ? ['--rebuild requested']
        : slotState.findings,
    );
  }
  console.log('[miss] no healthy slot for this lockfile — materialising.');
  materialiseSlot(noFrozenLockfile);
  linkWorktreeToSlot(slotNm);
  console.log('[ok] slot materialised and linked.');
}

// Link the main repo's gitignored secret env files (.env, .env.local) and the
// certs/ directory into the worktree, mirroring the behaviour the SessionStart
// hook relied on before the pool became the default resolver. The .env link is
// what lets agents run integration tests (playwright.integration.config.ts loads
// <repo>/.env) and pick up MCP_* credentials. The certs/ link is required so
// db-client tooling (pnpm --prefix lib/db-client run db:status / db:up) can
// resolve DB_CERT_PATH for SSL connections. Failures here are non-fatal: node_modules —
// the primary mission — is already linked.
linkSecretEnvFiles();

// ---------------------------------------------------------------------------
// Materialisation (pool miss)
// ---------------------------------------------------------------------------
function materialiseSlot(noFrozen = false) {
  // pnpm needs to write a real node_modules in the worktree, so clear any
  // existing symlink/dir first.
  removeNodeModulesEntry(nmPath);

  const installFlag = noFrozen ? '--no-frozen-lockfile' : '--frozen-lockfile';
  console.log(`[install] pnpm install ${installFlag} (in worktree)…`);
  pnpmInstall(worktree, noFrozen);

  const fresh = assessSlot(nmPath);
  if (!fresh.healthy) {
    fail(
      'pnpm install completed but worktree node_modules is not healthy. ' +
        'Aborting before publish. Findings:\n  - ' +
        fresh.findings.join('\n  - '),
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
        windowsHide: true,
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

/** A node_modules tree is healthy if it passes the deep assessment. */
function isHealthy(nm) {
  return assessSlot(nm).healthy;
}

/**
 * Deep health assessment of a node_modules tree. Returns
 * `{ healthy: boolean, findings: string[] }` — findings name each defect.
 *
 * Beyond the original quick checks (nx present, .bin populated, path
 * traversable), it scans for the corruption signature an interrupted install
 * leaves when it writes through a consumer symlink into a shared slot
 * (LS-8546/LS-8548): orphan `<name>_tmp_<pid>` staging dirs from pnpm's
 * atomic-rename, and package dirs missing package.json. The scan covers
 * top-level packages and one level into @scopes; `.pnpm` children are
 * name-checked only (a single readdir, no per-entry stats) to keep the cost on
 * every session start to one readdir pass + one stat per package (~a few
 * hundred ms worst-case on Windows).
 */
function assessSlot(nm) {
  const findings = [];
  if (!existsSync(nm)) {
    return { healthy: false, findings: ['slot not built'] };
  }
  if (!existsSync(join(nm, 'nx'))) findings.push('nx package missing');
  try {
    if (readdirSync(join(nm, '.bin')).length === 0)
      findings.push('.bin is empty');
  } catch {
    findings.push('.bin missing or unreadable');
  }
  // The nx package dir existing and .bin being non-empty (other bins present)
  // is not proof the nx executable itself was linked — a partial install can
  // leave .bin/nx absent while unrelated shims are still there. Check for it
  // by name (this is what `make`/nx invocations actually resolve via PATH).
  if (!existsSync(join(nm, '.bin', 'nx')))
    findings.push('.bin/nx missing (nx executable not linked)');
  if (process.platform === 'win32' && !winPathIsContainer(nm)) {
    findings.push('path is not a traversable directory');
  }
  findings.push(...findCorruption(nm));
  return { healthy: findings.length === 0, findings };
}

function findCorruption(nm) {
  // pnpm's interrupted-install staging-dir name pattern: `<name>_tmp_<pid>`.
  // Anchored to the end so a legitimate package whose name merely contains
  // `_tmp_<digits>` (e.g. `.pnpm/x_tmp_1@1.0.0`) is not flagged.
  // (A function-local const: the main flow runs before module-level consts
  // this far down would be initialised — only function declarations hoist.)
  const TMP_DIR_RE = /_tmp_\d+$/;
  const findings = [];
  let entries;
  try {
    entries = readdirSync(nm);
  } catch (err) {
    return [`cannot read node_modules: ${String(err.message ?? err)}`];
  }
  for (const name of entries) {
    if (name.startsWith('.')) {
      // Dot entries are pnpm-internal (.bin, .pnpm, .modules.yaml, caches).
      // .pnpm can hold thousands of entries — name-scan only, no stats.
      if (name === '.pnpm') {
        for (const sub of safeReaddirNames(join(nm, '.pnpm'))) {
          if (TMP_DIR_RE.test(sub))
            findings.push(
              `.pnpm/${sub}: orphan _tmp_ dir (interrupted install)`,
            );
        }
      }
      continue;
    }
    if (TMP_DIR_RE.test(name)) {
      findings.push(`${name}: orphan _tmp_ dir (interrupted install)`);
      continue;
    }
    if (name.startsWith('@')) {
      for (const sub of safeReaddirNames(join(nm, name))) {
        if (TMP_DIR_RE.test(sub)) {
          findings.push(
            `${name}/${sub}: orphan _tmp_ dir (interrupted install)`,
          );
          continue;
        }
        checkPackageDir(join(nm, name, sub), `${name}/${sub}`, findings);
      }
      continue;
    }
    checkPackageDir(join(nm, name), name, findings);
  }
  return findings;
}

/**
 * A package entry is corrupt when it is a directory (after following symlinks —
 * hoisted top-level packages are links into .pnpm) without a package.json, or a
 * broken symlink. Plain files (stray READMEs etc.) are ignored.
 */
function checkPackageDir(dir, label, findings) {
  let st;
  try {
    st = statSync(dir);
  } catch {
    findings.push(
      `${label}: broken entry (unresolvable symlink or unreadable)`,
    );
    return;
  }
  if (!st.isDirectory()) return;
  if (!existsSync(join(dir, 'package.json')))
    findings.push(`${label}: missing package.json`);
}

/**
 * Rename an unhealthy slot aside so materialisation publishes into a clean
 * path. The quarantined copy (`<hash>.corrupt-<ts>`) is never in gc's live set,
 * so `modules-pool/gc.mjs` reaps it once it ages out — no manual cleanup needed.
 */
function quarantineSlot(findings) {
  const dest = `${slotDir}.corrupt-${Date.now()}`;
  console.log('[quarantine] slot is unhealthy:');
  for (const f of findings) console.log(`  - ${f}`);
  console.log(`  renaming aside → ${dest}`);
  try {
    renameSync(slotDir, dest);
  } catch (err) {
    fail(
      `Failed to quarantine the corrupt slot: ${String(err.message ?? err)}\n` +
        'A process is likely holding files in it open (nx daemon, node, an editor).\n' +
        'Stop those processes (e.g. `make kill-stale`) and re-run this script.',
    );
  }
}

function safeReaddirNames(p) {
  try {
    return readdirSync(p);
  } catch {
    return [];
  }
}

function pnpmInstall(cwdDir, noFrozen = false) {
  const lockfileFlag = noFrozen ? '--no-frozen-lockfile' : '--frozen-lockfile';
  const opts = {
    cwd: cwdDir,
    stdio: 'inherit',
    timeout: 30 * 60_000,
    windowsHide: true,
  };
  if (process.platform === 'win32') {
    execFileSync('cmd', ['/c', 'pnpm', 'install', lockfileFlag], opts);
  } else {
    execFileSync('pnpm', ['install', lockfileFlag], opts);
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
          windowsHide: true,
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
  // Pure-Node check: statSync follows symlinks, so a healthy directory symlink
  // (node_modules → pool slot) reports isDirectory() === true, while a broken
  // link throws and falls through to false. This intentionally avoids shelling
  // out to powershell — winPathIsContainer runs on EVERY session start via
  // isHealthy(), and a `powershell` (or `cmd`) child spawned from the
  // SessionStart bash hook allocates a visible console window each time, which
  // flashed on screen and stole focus on every session (LS-5068 fixed the same
  // class of flash for the Stop hook).
  try {
    return statSync(p).isDirectory();
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
// Secret env-file / shared-dir linking (.env, .env.local, certs/)
// ---------------------------------------------------------------------------
// These files/dirs live only in the main repo (gitignored). Symlinking —
// rather than copying — means rotations in main propagate to all worktrees
// automatically. All failures are non-fatal.
function linkSecretEnvFiles() {
  console.log('');
  for (const name of ['.env', '.env.local']) {
    linkEnvFile(name);
  }
  linkDir('certs');
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
        windowsHide: true,
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

// Link a directory from the main repo into the worktree (e.g. certs/).
// Parallel to linkEnvFile but handles directory symlinks: mklink /D on Windows,
// plain symlinkSync on POSIX (the type argument is ignored there). Non-fatal.
function linkDir(name) {
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
        console.warn(
          `[warn] ${name}: could not remove the existing wrong-target symlink: ${String(err.message ?? err)}\n` +
            `       The worktree is still linked to an INCORRECT ${name}. Remove it manually ` +
            `(rm -rf "${wtPath}") and re-run this resolver.`,
        );
        return;
      }
    } else {
      console.log(
        `[skip] ${name}: real directory/file present in worktree (not a symlink). ` +
          'Delete it manually to switch to the linked copy.',
      );
      return;
    }
  }

  try {
    if (process.platform === 'win32') {
      execFileSync('cmd', ['/c', 'mklink', '/D', wtPath, mainPath], {
        encoding: 'utf-8',
        timeout: 10_000,
        windowsHide: true,
      });
    } else {
      symlinkSync(mainPath, wtPath);
    }
  } catch (err) {
    const msg = String(err.message ?? err);
    const devMode = /privilege|EPERM|1314/i.test(msg);
    console.warn(
      `[warn] ${name}: failed to create symlink: ${msg}` +
        (devMode
          ? '\n       Directory symlinks require Windows Developer Mode; ' +
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
