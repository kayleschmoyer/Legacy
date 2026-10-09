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
 * A slot also captures the NESTED per-package node_modules dirs that pnpm's
 * workspace protocol creates under hoisted linking (e.g.
 * apps/app/node_modules/@legacy-sports/shared-components -> a symlink into the
 * sibling lib/ package). The root-only symlink is enough for tsconfig-paths
 * resolvers (Vite/Nx/tsc), but Metro (React Native, apps/app) has no
 * tsconfig-paths equivalent and resolves @legacy-sports/* imports via those
 * nested symlinks (see apps/app/metro.config.js's nodeModulesPaths) — without
 * them a native `expo export`/`expo run:android` fails with "Unable to resolve
 * module @legacy-sports/X" (LS-9421 follow-up). Nested dirs are discovered from
 * pnpm-lock.yaml's `importers:` list (the authoritative set of workspace
 * package paths pnpm actually installed), moved into `<slot>/nested/<path>/
 * node_modules` alongside the root snapshot on materialise, and symlinked back
 * into the worktree on every link (hit or miss). Slots built before this
 * feature simply have no `nested/` dir — nested linking silently no-ops for
 * them until the slot is rebuilt (`--rebuild`).
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
 *   node scripts/modules-pool/link.mjs --assess-path=<dir>
 *   node scripts/modules-pool/link.mjs --heal-path=<dir>
 *
 * --worktree    Absolute path to the worktree. Defaults to cwd.
 * --main-repo   Absolute path to the main repo root (holds .modules-pool). Auto-
 *               detected when omitted (native `.claude/worktrees/<name>` and
 *               sibling `<repo>.worktrees/<name>` layouts, or the main repo itself).
 * --no-salt     Hash the lockfile only (omit the pnpm version salt).
 * --print-hash  Print the resolved hash and exit (no filesystem changes).
 * --check       Doctor mode: run the deep health check on this lockfile's slot
 *               AND verify the worktree's node_modules is a symlink resolving to
 *               that slot, print every finding, and exit 0 (both healthy) / 1
 *               (slot unhealthy or missing, or the worktree link missing/broken/
 *               pointing elsewhere — LS-10941). No filesystem changes.
 * --rebuild     Quarantine this lockfile's slot (rename to <hash>.corrupt-<ts>)
 *               even if it passes the health check, then re-materialise. Use to
 *               force recovery from corruption the health check cannot see.
 * --assess-path=<dir>  Standalone health assessment of an arbitrary node_modules
 *               directory — no pool, lockfile, or worktree/main-repo resolution
 *               involved. Prints findings and exits 0 (healthy) / 1 (unhealthy).
 *               For environments that install straight into a plain node_modules
 *               (e.g. cloud sessions running `pnpm install` directly — see
 *               .claude/cloud-setup.sh, LS-8363).
 * --heal-path=<dir>    Structural-corruption-only pass over an arbitrary
 *               node_modules directory: removes orphan pnpm `*_tmp_*` staging
 *               dirs and package dirs missing package.json (the interrupted-
 *               install signature also checked by --check/--assess-path), then
 *               exits 0. Does not run pnpm install itself and does not check
 *               nx/.bin presence — the caller reinstalls afterward so the
 *               removed entries come back clean instead of pnpm trusting a
 *               stub directory that already "exists".
 *
 * Corruption recovery is otherwise automatic: an unhealthy slot (orphan pnpm
 * `*_tmp_*` dirs, packages missing package.json — the LS-8546/LS-8548 interrupted-
 * install signature) is quarantined and rebuilt on the next plain run.
 *
 * pnpmInstall() also self-heals the case where THIS session's own tsx-based MCP
 * servers (`node --import tsx <server>`, per AGENTS.md) keep a native binary
 * under node_modules (e.g. node_modules/tsx/node_modules/@esbuild/*\/esbuild.exe)
 * mmap'd for the server's lifetime: pnpm's install-time unlink of that file
 * EPERMs even though a rename of the same path succeeds (LS-9442). On an
 * ERR_PNPM_EPERM naming a locked path under node_modules, the top-level package
 * dir is renamed out of node_modules (so it can't pollute the pool slot) and the
 * install is retried once, rather than surfacing a raw failure that requires a
 * session restart to clear.
 *
 * Concurrent invocations against the SAME worktree are serialized with a
 * directory-based lock (LS-9266): deciding hit/miss, quarantining an unhealthy
 * slot, materialising, and (re)symlinking span several non-atomic steps over
 * tens of seconds. Two overlapping `link.mjs` runs on one worktree — e.g. two
 * background `make pc-*`/`nx` invocations that each trigger a re-link — could
 * otherwise unlink/replace node_modules out from under a third process reading
 * through it mid-build, surfacing as "Cannot find module" for a package that
 * genuinely exists, or a build output directory disappearing when the build
 * process itself gets confused reading a moving target. See
 * `acquireWorktreeLock`/`releaseWorktreeLock` below. This does NOT replace the
 * existing cross-worktree slot-materialisation race handling (the
 * atomic-rename "[race]" branches in materialiseSlot) — a lock is scoped to
 * one worktree, and two different worktrees on the same lockfile hash still
 * race at the pool-slot level exactly as before, by atomic rename.
 */

import {
  existsSync,
  lstatSync,
  statSync,
  readdirSync,
  realpathSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  rmSync,
  rmdirSync,
  symlinkSync,
  readlinkSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  normalize as normalizePath,
  resolve,
  sep,
} from 'node:path';
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

// ---------------------------------------------------------------------------
// Standalone assess/heal modes (LS-8363) — no pool, lockfile, or worktree/
// main-repo resolution. Exit before any of that runs so callers with a plain
// node_modules (cloud sessions; no .modules-pool involved) can use the same
// corruption-detection logic the pool path already relies on.
// ---------------------------------------------------------------------------
if (args['assess-path']) {
  const target = resolve(String(args['assess-path']));
  const result = assessSlot(target);
  if (result.healthy) {
    console.log(`[assess] ${target}: healthy`);
    process.exit(0);
  }
  console.log(`[assess] ${target}: UNHEALTHY`);
  for (const f of result.findings) console.log(`  - ${f}`);
  process.exit(1);
}

if (args['heal-path']) {
  const target = resolve(String(args['heal-path']));
  const entries = findCorruptEntries(target);
  if (entries.length === 0) {
    console.log(`[heal] ${target}: no corrupt entries found.`);
    process.exit(0);
  }
  console.log(
    `[heal] ${target}: removing ${entries.length} corrupt entr${entries.length === 1 ? 'y' : 'ies'} so the next install rebuilds them cleanly:`,
  );
  for (const e of entries) {
    console.log(`  - ${e.label}: ${e.reason}`);
    removeDir(e.path);
  }
  process.exit(0);
}

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

// See the "Worktree lock (LS-9266)" section below for what these guard.
const LOCK_TIMEOUT_MS = 35 * 60_000; // a little over pnpmInstall's own 30-minute ceiling
const LOCK_POLL_MS = 500;
const lockPath = join(worktree, '.modules-pool.lock');
let lockHeld = false;

console.log('[modules-pool/link]');
console.log(`  worktree : ${worktree}`);
console.log(`  main repo: ${mainRepo}`);
console.log(`  pool     : ${poolRoot}`);
console.log(`  hash     : ${hash}`);
console.log('');

if (args['check']) {
  // Read-only diagnostic — no mutation, so no lock needed. A concurrent
  // materialise could make this report transiently stale, but --check never
  // acts on what it sees.
  //
  // A healthy slot alone is not enough: if the worktree's node_modules link
  // was never created (e.g. mklink failed for lack of Developer Mode) every
  // downstream nx/make call fails with "'nx' is not recognized" while the
  // slot itself looks fine (LS-10941). Check both.
  const slotState = assessSlot(slotNm);
  const linkFindings = assessWorktreeLink(slotNm);
  if (slotState.healthy) {
    console.log('[check] slot is healthy.');
  } else {
    console.log('[check] slot is UNHEALTHY:');
    for (const f of slotState.findings) console.log(`  - ${f}`);
  }
  if (linkFindings.length === 0) {
    console.log('[check] worktree node_modules link is healthy.');
  } else {
    console.log('[check] worktree node_modules link is UNHEALTHY:');
    for (const f of linkFindings) console.log(`  - ${f}`);
  }
  const danglingNested = findDanglingNestedSymlinks();
  if (danglingNested.length === 0) {
    console.log('[check] no dangling nested node_modules symlinks.');
  } else {
    console.log('[check] dangling nested node_modules symlinks are UNHEALTHY:');
    for (const d of danglingNested) {
      console.log(`  - ${d.path} -> ${safeReadlink(d.path) ?? '?'}`);
    }
  }
  if (
    slotState.healthy &&
    linkFindings.length === 0 &&
    danglingNested.length === 0
  ) {
    process.exit(0);
  }
  console.log('');
  console.log(
    'Re-run without --check to quarantine/rebuild the slot and (re)link node_modules automatically.',
  );
  process.exit(1);
}

// Everything from here on mutates this worktree's node_modules (and possibly
// the pool slot). Serialize against any other link.mjs run targeting the same
// worktree first — see the file-header comment and acquireWorktreeLock below.
acquireWorktreeLock();

const slotState = assessSlot(slotNm);

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

linkNestedWorkspaceModules(slotDir);

// Link the main repo's gitignored secret env files (.env, .env.local) and the
// certs/ directory into the worktree, mirroring the behaviour the SessionStart
// hook relied on before the pool became the default resolver. The .env link is
// what lets agents run integration tests (playwright.integration.config.ts loads
// <repo>/.env) and pick up MCP_* credentials. The certs/ link is required so
// db-client tooling (pnpm --prefix lib/db-client run db:status / db:up) can
// resolve DB_CERT_PATH for SSL connections. Failures here are non-fatal: node_modules —
// the primary mission — is already linked.
linkSecretEnvFiles();

// Final invariant before a success exit: never exit 0 with the worktree's
// node_modules missing or not resolving to the slot (LS-10941) — callers
// treat exit 0 as "nx is resolvable" and otherwise fail much later with
// "'nx' is not recognized".
verifyWorktreeLinkOrFail(slotNm);

releaseWorktreeLock();

// ---------------------------------------------------------------------------
// Materialisation (pool miss)
// ---------------------------------------------------------------------------
function materialiseSlot(noFrozen = false) {
  // pnpm needs to write a real node_modules in the worktree, so clear any
  // existing symlink/dir first.
  removeNodeModulesEntry(nmPath);
  sweepDanglingNestedSymlinks();

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

  // Capture nested per-package node_modules (workspace symlinks pnpm creates
  // under hoisted linking) alongside the root snapshot — see the file-header
  // comment. Best-effort per path: a workspace package pnpm skipped (no deps)
  // simply has no node_modules to capture.
  let nestedCaptured = 0;
  for (const rel of nestedNodeModulesRelPaths(lockfilePath)) {
    const src = join(worktree, rel, 'node_modules');
    if (!lstatExists(src)) continue;
    const dest = join(tmpSlot, 'nested', rel, 'node_modules');
    mkdirSync(dirname(dest), { recursive: true });
    renameSync(src, dest);
    nestedCaptured++;
  }
  if (nestedCaptured > 0) {
    console.log(
      `[install] captured ${nestedCaptured} nested workspace node_modules dir(s) into the slot.`,
    );
  }

  try {
    renameSync(tmpSlot, slotDir);
  } catch (err) {
    // Lost the race at the rename boundary: a sibling published first. Keep theirs.
    if (isHealthy(slotNm)) {
      console.log(
        '[race] slot published by another process — discarding our copy.',
      );
      // Our nested captures live only in the discarded tmpSlot — restore them
      // to the worktree so linkNestedWorkspaceModules() has a fallback source
      // if the winning slot (built by an older link.mjs) has no nested/ dir.
      restoreNestedDirs(tmpSlot);
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
  try {
    ensureDirSymlink(nmPath, target, 'node_modules');
  } catch (err) {
    // Never leave an empty real node_modules dir behind on failure: callers
    // that only test for its existence would treat the worktree as linked and
    // fail much later with e.g. "'nx' is not recognized" (LS-10597).
    removeEmptyDir(nmPath);
    fail(String(err.message ?? err));
  }
  // ensureDirSymlink returning is not proof the link exists and resolves —
  // verify it before reporting success (LS-10941).
  verifyWorktreeLinkOrFail(target);
}

/**
 * Inspect the worktree's node_modules entry against the slot it should link
 * to. Returns a list of findings — empty means it is a symlink that resolves
 * to `target`. Read-only; shared by --check and the post-link verification.
 */
function assessWorktreeLink(target) {
  const st = safeLstat(nmPath);
  if (!st) {
    return [`${nmPath} does not exist (node_modules was never linked)`];
  }
  if (!st.isSymbolicLink()) {
    return [
      `${nmPath} is a real ${st.isDirectory() ? 'directory' : 'file'}, not a symlink into the pool slot`,
    ];
  }
  const resolved = safeRealpath(nmPath);
  if (!resolved) {
    return [
      `${nmPath} is a broken symlink (-> ${safeReadlink(nmPath) ?? '?'})`,
    ];
  }
  if (normalize(resolved) !== normalize(target)) {
    return [`${nmPath} resolves to ${resolved}, expected ${target}`];
  }
  return [];
}

/** fail() unless the worktree's node_modules is a symlink resolving to `target`. */
function verifyWorktreeLinkOrFail(target) {
  const findings = assessWorktreeLink(target);
  if (findings.length === 0) return;
  removeEmptyDir(nmPath);
  fail(
    'node_modules link verification failed:\n  - ' + findings.join('\n  - '),
  );
}

/**
 * Symlink nested per-package node_modules dirs (apps/app/node_modules/
 * @legacy-sports/*, etc.) from the slot's `nested/` capture back into the
 * worktree — see the file-header comment for why Metro needs these. No-ops
 * per path when the slot has nothing captured for it (older slot, or that
 * workspace package genuinely has no deps). Non-fatal: nested linking is only
 * required for native/Metro builds, not the common web/lambda dev path, so a
 * failure here must never abort node_modules linking, which already succeeded.
 *
 * IMPORTANT (LS-9563): the outer per-package `node_modules` dir is never
 * symlinked wholesale to the shared pool slot. A slot is shared by every
 * worktree on the same lockfile hash, but the `@legacy-sports/*`
 * workspace-protocol entries inside a captured nested dir were created by
 * pnpm inside whichever worktree first materialised the slot — on Windows
 * those are absolute symlinks pointing at THAT worktree's own lib/apps
 * source. Sharing the captured dir as-is means every other worktree hitting
 * the slot silently resolves workspace-package imports (and jest.mock()'s
 * "real" module) to a different worktree's source tree, with no error.
 * Instead `dest` is a real, per-worktree directory, and each workspace-
 * package entry inside it is individually (re)linked straight at THIS
 * worktree's own source, using the captured dir only to learn which entries
 * need linking — never as the symlink target.
 */
function linkNestedWorkspaceModules(slot) {
  const nestedRoot = join(slot, 'nested');
  if (!existsSync(nestedRoot)) return;
  const pkgNameToPath = buildWorkspacePackageNameMap();
  let linked = 0;
  for (const rel of nestedNodeModulesRelPaths(lockfilePath)) {
    const src = join(nestedRoot, rel, 'node_modules');
    if (!existsSync(src)) continue;
    const dest = join(worktree, rel, 'node_modules');
    try {
      mkdirSync(dirname(dest), { recursive: true });
      linked += relinkNestedNodeModulesDir(
        dest,
        src,
        pkgNameToPath,
        `${rel}/node_modules`,
      );
    } catch (err) {
      console.warn(
        `[warn] ${rel}/node_modules: failed to link nested workspace module: ${String(err.message ?? err)}`,
      );
    }
  }
  if (linked > 0) {
    console.log(
      `[ok] ${linked} nested workspace node_modules entr(y/ies) linked to this worktree's own source (needed for native/Metro builds).`,
    );
  }
}

/**
 * Map every workspace package's `package.json` `name` (e.g.
 * "@legacy-sports/shared-components") to its ABSOLUTE path in THIS worktree
 * (e.g. "<worktree>/lib/shared-components"). Built from the same importer
 * list `nestedNodeModulesRelPaths` already trusts, so it covers exactly the
 * workspace packages pnpm actually resolved for this lockfile. Best-effort
 * per package: a member missing/unreadable `package.json` is simply absent
 * from the map, and callers fall back to the slot's own (possibly stale)
 * capture for anything not found here.
 */
function buildWorkspacePackageNameMap() {
  const map = new Map();
  for (const rel of nestedNodeModulesRelPaths(lockfilePath)) {
    let name;
    try {
      name = JSON.parse(
        readFileSync(join(worktree, rel, 'package.json'), 'utf-8'),
      ).name;
    } catch {
      continue;
    }
    if (typeof name === 'string' && name.length > 0) {
      map.set(name, resolve(worktree, rel));
    }
  }
  return map;
}

/**
 * Repopulate one per-package `node_modules` dir (`dest`, e.g.
 * "<worktree>/apps/web/node_modules") as a real, worktree-local directory
 * mirroring the entries captured in the pool slot (`src`). Scoped entries
 * (`@legacy-sports/<pkg>`) are linked straight at `pkgNameToPath`'s
 * worktree-local path for that package name when known — never at the
 * slot's own copy of the symlink, which may point at a different worktree
 * entirely (LS-9563). Any other captured entry (unexpected in practice — see
 * the file-header comment — but handled for forward-compatibility) falls
 * back to linking at the slot's copy, matching the previous whole-dir-link
 * behaviour. Returns the number of entries linked.
 */
function relinkNestedNodeModulesDir(dest, src, pkgNameToPath, label) {
  // A prior run of this script (pre-LS-9563) may have left `dest` as a
  // whole-dir symlink straight into the pool slot — drop it so `dest`
  // becomes a real directory we own.
  const destSt = safeLstat(dest);
  if (destSt && destSt.isSymbolicLink()) {
    removeNodeModulesEntry(dest);
  }
  mkdirSync(dest, { recursive: true });

  let linked = 0;
  for (const entry of readdirSync(src)) {
    const entrySrc = join(src, entry);
    if (!entry.startsWith('@')) {
      // Not a scoped workspace-package entry — preserve prior behaviour.
      ensureDirSymlink(join(dest, entry), entrySrc, `${label}/${entry}`);
      linked++;
      continue;
    }
    const scopeDir = join(dest, entry);
    mkdirSync(scopeDir, { recursive: true });
    for (const pkg of safeReaddirNames(entrySrc)) {
      const key = `${entry}/${pkg}`;
      const target = pkgNameToPath.get(key) ?? join(entrySrc, pkg);
      ensureDirSymlink(join(scopeDir, pkg), target, `${label}/${key}`);
      linked++;
    }
  }
  return linked;
}

/**
 * Symlink `linkPath` -> `target` as a directory symlink, replacing whatever
 * is already at `linkPath` (idempotent if already correctly linked). Throws
 * an Error with an actionable message on failure — callers decide whether
 * that's fatal (fail()) or a warning (nested linking).
 */
function ensureDirSymlink(linkPath, target, label) {
  // Already correctly linked?
  if (lstatExists(linkPath)) {
    const st = safeLstat(linkPath);
    if (st && st.isSymbolicLink()) {
      const cur = safeRealpath(linkPath) ?? safeReadlink(linkPath);
      if (cur && normalize(cur) === normalize(target)) return;
    }
    removeNodeModulesEntry(linkPath);
    // removeNodeModulesEntry is best-effort (e.g. a locked file inside a stale
    // real directory can make rmSync throw silently) — verify it actually
    // cleared the path. Otherwise mklink/symlinkSync below fails with a raw
    // "already exists" error that gives no hint the removal itself failed
    // (LS-8649).
    if (lstatExists(linkPath)) {
      throw new Error(
        `${label} already exists and could not be removed automatically:\n  ${linkPath}\n\n` +
          'It may be a stale real directory left over from a prior install, or a ' +
          'file inside it may be locked by a running process (nx daemon, editor, ' +
          'antivirus scan). Close anything that might be holding it open and ' +
          `remove it manually, then re-run this script:\n  rm -rf "${linkPath}"`,
      );
    }
  }

  if (process.platform === 'win32') {
    // mklink /D = directory symlink, preferred. It requires Windows Developer
    // Mode; without it mklink fails with "You do not have sufficient
    // privilege", so fall back to mklink /J — a directory junction needs no
    // privilege and, for a local absolute directory target like a pool slot,
    // behaves the same for every consumer here (lstat reports it as a
    // symlink, realpath resolves it, removeNodeModulesEntry rmdirs it without
    // touching the target) (LS-11021). MODULES_POOL_FORCE_JUNCTION=1 skips
    // straight to the junction (lets tests exercise it on Developer Mode hosts).
    let mkErr =
      process.env.MODULES_POOL_FORCE_JUNCTION === '1'
        ? new Error('MODULES_POOL_FORCE_JUNCTION=1 (simulated privilege error)')
        : winMklink('/D', linkPath, target);
    let kind = 'directory symlink';
    if (mkErr && /privilege|EPERM|1314/i.test(String(mkErr.message ?? mkErr))) {
      const junctionErr = winMklink('/J', linkPath, target);
      if (!junctionErr) {
        console.log(
          `[link] ${label}: directory symlink not permitted (no Developer Mode) — created a junction instead.`,
        );
        kind = 'directory junction';
      }
      mkErr = junctionErr
        ? new Error(
            `${String(mkErr.message ?? mkErr)}\n` +
              `Junction fallback (mklink /J) also failed: ${String(junctionErr.message ?? junctionErr)}`,
          )
        : null;
    }
    if (mkErr || !winPathIsContainer(linkPath)) {
      const msg = mkErr
        ? String(mkErr.message ?? mkErr)
        : `mklink exited 0 but path is not accessible (${kind})`;
      throw new Error(`Failed to create directory symlink: ${msg}`);
    }
  } else {
    symlinkSync(target, linkPath);
  }
}

/** Run `mklink <flag> linkPath target`; returns the error, or null on success. */
function winMklink(flag, linkPath, target) {
  try {
    execFileSync('cmd', ['/c', 'mklink', flag, linkPath, target], {
      encoding: 'utf-8',
      timeout: 15_000,
      windowsHide: true,
    });
    return null;
  } catch (err) {
    return err;
  }
}

// ---------------------------------------------------------------------------
// Worktree lock (LS-9266)
// ---------------------------------------------------------------------------
// `mkdirSync` without `recursive` is atomic on every platform this script
// targets (POSIX mkdir(2), Windows CreateDirectory) — exactly one concurrent
// caller's mkdirSync succeeds, so a lock DIRECTORY (rather than a lock file +
// separate O_EXCL dance) is a simple, dependency-free mutex. Scoped to the
// worktree, not the pool slot: the corruption this guards against is a
// second link.mjs run mutating THIS worktree's node_modules symlink/tree
// concurrently with a build reading through it — a slot shared with another
// worktree is already handled separately (atomic rename in materialiseSlot).
function acquireWorktreeLock() {
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      mkdirSync(lockPath);
      try {
        writeFileSync(join(lockPath, 'pid'), String(process.pid));
      } catch {
        /* best-effort — the lock itself is the mkdir, this is just diagnostics */
      }
      lockHeld = true;
      // Release on any exit path (normal completion, fail()'s process.exit,
      // or an uncaught exception unwinding to the top) — 'exit' fires for
      // all of those since this script is fully synchronous.
      process.on('exit', releaseWorktreeLock);
      return;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
    let ageMs = 0;
    try {
      ageMs = Date.now() - statSync(lockPath).mtimeMs;
    } catch {
      continue; // lock vanished between our failed mkdir and this stat — retry now
    }
    if (ageMs > LOCK_TIMEOUT_MS) {
      console.log(
        `[lock] stale lock at ${lockPath} (older than ${Math.round(LOCK_TIMEOUT_MS / 60_000)}m, ` +
          'outlives even a full pnpm install — its owner must have died without releasing it) — reclaiming.',
      );
      removeDir(lockPath);
      continue;
    }
    if (Date.now() > deadline) {
      fail(
        `Timed out after ${Math.round(LOCK_TIMEOUT_MS / 60_000)}m waiting for another ` +
          `link.mjs run to release the lock on this worktree:\n  ${lockPath}\n` +
          'If no other link.mjs process is actually running, remove it manually and re-run:\n' +
          `  rm -rf "${lockPath}"`,
      );
    }
    sleepSync(LOCK_POLL_MS);
  }
}

function releaseWorktreeLock() {
  if (!lockHeld) return;
  lockHeld = false;
  removeDir(lockPath);
}

// Synchronous sleep — this script is deliberately dependency-free and fully
// synchronous throughout (see file header), so polling for the lock uses the
// same blocking style rather than introducing async control flow just here.
function sleepSync(ms) {
  const sab = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(sab, 0, 0, ms);
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
  // Any other git worktree (e.g. `git worktree add /tmp/foo -b branch
  // origin/main`, LS-8383): derive the main repo from the worktree's own git
  // metadata instead of pattern-matching the path string. `git rev-parse
  // --git-common-dir` resolves the shared .git directory regardless of where
  // the worktree lives on disk — the main repo is that directory's parent.
  const commonDir = gitCommonDir(wt);
  if (commonDir && basename(commonDir) === '.git') return dirname(commonDir);
  fail(
    `Cannot auto-detect main repo from:\n  ${wt}\nPass --main-repo=<path> explicitly.`,
  );
}

function gitCommonDir(wt) {
  try {
    const out = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd: wt,
      encoding: 'utf-8',
      timeout: 10_000,
      windowsHide: true,
    }).trim();
    return out ? resolve(wt, out) : null;
  } catch {
    return null;
  }
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

/**
 * Extract the list of workspace-package relative paths (e.g. "apps/app",
 * "lib/shared-components") from pnpm-lock.yaml's `importers:` map. This is
 * the authoritative set of paths pnpm actually installed nested node_modules
 * for — driving it off pnpm-workspace.yaml's globs would list packages that
 * may not have been resolved. A minimal regex-based parse keeps the script
 * dependency-free (no `yaml` package) rather than a full YAML parser; the
 * lockfile's `importers:` block is machine-generated and simple enough
 * (2-space-indented `<path>:` keys, optionally quoted) for this to be
 * reliable. The root importer (".") is excluded — it's the already-handled
 * root node_modules, not a nested one.
 */
function nestedNodeModulesRelPaths(lockPath) {
  let lines;
  try {
    lines = readFileSync(lockPath, 'utf-8').split(/\r?\n/);
  } catch {
    return [];
  }
  const start = lines.findIndex((l) => /^importers:\s*$/.test(l));
  if (start === -1) return [];
  const paths = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.length === 0) continue;
    if (!/^\s/.test(line)) break; // back to a top-level key — importers block ended
    // Trailing content after the colon varies: a bare `path:` followed by a
    // nested block, or a flow-style `path: {}` when the package has no deps.
    const m = line.match(/^ {2}(?:'([^']+)'|"([^"]+)"|([^\s:][^:]*)):.*$/);
    if (!m) continue;
    const p = m[1] ?? m[2] ?? m[3];
    if (!p || p === '.') continue;
    // Defence in depth: importer paths are pnpm-generated and normally
    // trusted, but these strings flow straight into renameSync/mkdirSync/
    // symlinkSync/rmSync targets under `worktree`/`slot`. Reject anything
    // absolute or that escapes the workspace root via `..` before it ever
    // reaches a filesystem call (LS-9434 review finding).
    const normalized = normalizePath(p);
    if (
      isAbsolute(normalized) ||
      normalized === '..' ||
      normalized.startsWith(`..${sep}`)
    ) {
      console.warn(
        `[warn] ignoring suspicious importer path in pnpm-lock.yaml: ${p}`,
      );
      continue;
    }
    paths.push(p);
  }
  return paths;
}

/**
 * Best-effort restore of a discarded materialise attempt's nested captures
 * (see the [race] branch in materialiseSlot) — moves each
 * `<tmpSlot>/nested/<rel>/node_modules` back to `<worktree>/<rel>/
 * node_modules` before the tmp dir is deleted, so a lost race doesn't strand
 * the worktree without nested dirs it had before this run started.
 */
function restoreNestedDirs(tmpSlot) {
  const nestedRoot = join(tmpSlot, 'nested');
  if (!existsSync(nestedRoot)) return;
  for (const rel of nestedNodeModulesRelPaths(lockfilePath)) {
    const src = join(nestedRoot, rel, 'node_modules');
    if (!existsSync(src)) continue;
    const dest = join(worktree, rel, 'node_modules');
    if (lstatExists(dest)) continue; // don't clobber something already restored/present
    try {
      mkdirSync(dirname(dest), { recursive: true });
      renameSync(src, dest);
    } catch {
      /* best effort — the slot's own nested/ dir remains the primary source */
    }
  }
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
  // pnpm writes .modules.yaml as the last step of a successful install: its
  // absence means node_modules was assembled by something other than a
  // completed `pnpm install` (e.g. copied, or an install that was skipped
  // entirely) even when individual packages/bins look present. nx's own
  // project-graph plugin refuses to run against such a tree ("pnpm lockfile
  // detected, but node_modules/.modules.yaml is missing"), so every
  // nx-based `pc-*` chunk fails even though tsx/nx themselves resolve fine
  // (LS-9210).
  if (!existsSync(join(nm, '.modules.yaml')))
    findings.push('.modules.yaml missing (node_modules not installed by pnpm)');
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
  return findCorruptEntries(nm).map((e) => `${e.label}: ${e.reason}`);
}

/**
 * Structured version of findCorruption — returns `[{ path, label, reason }]`
 * so callers (e.g. --heal-path) can remove the exact corrupt directory rather
 * than just print about it. Same detection, same cost characteristics: pnpm's
 * interrupted-install staging-dir name pattern (`<name>_tmp_<pid>`, anchored
 * to the end so a legitimate package whose name merely contains `_tmp_<digits>`
 * is not flagged) plus package dirs missing package.json, scanned at the
 * top level and one level into @scopes; `.pnpm` children are name-checked only
 * (a single readdir, no per-entry stats).
 */
function findCorruptEntries(nm) {
  const TMP_DIR_RE = /_tmp_\d+$/;
  const entries = [];
  let names;
  try {
    names = readdirSync(nm);
  } catch (err) {
    return [
      {
        path: nm,
        label: 'node_modules',
        reason: `cannot read: ${String(err.message ?? err)}`,
      },
    ];
  }
  for (const name of names) {
    if (name.startsWith('.')) {
      // Dot entries are pnpm-internal (.bin, .pnpm, .modules.yaml, caches).
      // .pnpm can hold thousands of entries — name-scan only, no stats.
      if (name === '.pnpm') {
        for (const sub of safeReaddirNames(join(nm, '.pnpm'))) {
          if (TMP_DIR_RE.test(sub)) {
            entries.push({
              path: join(nm, '.pnpm', sub),
              label: `.pnpm/${sub}`,
              reason: 'orphan _tmp_ dir (interrupted install)',
            });
          }
        }
      }
      continue;
    }
    if (TMP_DIR_RE.test(name)) {
      entries.push({
        path: join(nm, name),
        label: name,
        reason: 'orphan _tmp_ dir (interrupted install)',
      });
      continue;
    }
    if (name.startsWith('@')) {
      for (const sub of safeReaddirNames(join(nm, name))) {
        const subPath = join(nm, name, sub);
        if (TMP_DIR_RE.test(sub)) {
          entries.push({
            path: subPath,
            label: `${name}/${sub}`,
            reason: 'orphan _tmp_ dir (interrupted install)',
          });
          continue;
        }
        const bad = checkPackageDirEntry(subPath, `${name}/${sub}`);
        if (bad) entries.push(bad);
      }
      continue;
    }
    const bad = checkPackageDirEntry(join(nm, name), name);
    if (bad) entries.push(bad);
  }
  return entries;
}

/**
 * A package entry is corrupt when it is a directory (after following symlinks —
 * hoisted top-level packages are links into .pnpm) without a package.json, or a
 * broken symlink. Plain files (stray READMEs etc.) are ignored (returns null).
 */
function checkPackageDirEntry(dir, label) {
  let st;
  try {
    st = statSync(dir);
  } catch {
    return {
      path: dir,
      label,
      reason: 'broken entry (unresolvable symlink or unreadable)',
    };
  }
  if (!st.isDirectory()) return null;
  if (!existsSync(join(dir, 'package.json'))) {
    return { path: dir, label, reason: 'missing package.json' };
  }
  return null;
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

/**
 * The worktree's nested per-package node_modules entries from a PREVIOUS
 * linkNestedWorkspaceModules() run may point (directly, or via an entry inside
 * them) at a pool slot that has since been renamed away or pruned by gc.mjs —
 * leaving them dangling. materialiseSlot() only clears the root node_modules
 * before running `pnpm install`, so a dangling nested link is left in place
 * and pnpm's mkdir through it fails with ENOENT (LS-9745, LS-10367).
 * Read-only: returns every dangling node_modules symlink — the outer
 * per-package dir itself (older whole-dir-symlink layout, pre-LS-9563) or an
 * individual entry inside a real, per-worktree directory (current layout,
 * including `.bin` and one level into @scopes). Shared by --check and the
 * pre-install sweep.
 */
function findDanglingNestedSymlinks() {
  const found = [];
  for (const rel of nestedNodeModulesRelPaths(lockfilePath)) {
    const dest = join(worktree, rel, 'node_modules');
    const st = safeLstat(dest);
    if (!st) continue;
    if (st.isSymbolicLink()) {
      if (!existsSync(dest)) found.push({ path: dest, outer: true });
      continue;
    }
    if (!st.isDirectory()) continue;
    for (const entry of safeReaddirNames(dest)) {
      const entryPath = join(dest, entry);
      const entrySt = safeLstat(entryPath);
      if (!entrySt) continue;
      if (entrySt.isSymbolicLink()) {
        if (!existsSync(entryPath)) found.push({ path: entryPath });
        continue;
      }
      if (entry.startsWith('@') && entrySt.isDirectory()) {
        for (const sub of safeReaddirNames(entryPath)) {
          const subPath = join(entryPath, sub);
          const subSt = safeLstat(subPath);
          if (subSt && subSt.isSymbolicLink() && !existsSync(subPath)) {
            found.push({ path: subPath });
          }
        }
      }
    }
  }
  return found;
}

/**
 * Remove every dangling nested node_modules symlink so `pnpm install`
 * proceeds against a clean tree. Runs on every materialise, not only after a
 * quarantine: a slot pruned by gc.mjs no longer exists, so nothing is
 * quarantined, yet the worktree's nested links into it still dangle
 * (LS-10367). linkNestedWorkspaceModules() rebuilds whatever is removed once
 * materialisation completes.
 */
function sweepDanglingNestedSymlinks() {
  const dangling = findDanglingNestedSymlinks();
  for (const { path, outer } of dangling) {
    if (outer) removeNodeModulesEntry(path);
    else rmSync(path, { force: true });
  }
  if (dangling.length > 0) {
    console.log(
      `[sweep] removed ${dangling.length} dangling nested node_modules symlink(s) left pointing at a quarantined or pruned slot.`,
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

function pnpmInstall(cwdDir, noFrozen = false, retrying = false) {
  const lockfileFlag = noFrozen ? '--no-frozen-lockfile' : '--frozen-lockfile';
  const opts = {
    cwd: cwdDir,
    // Captured (not 'inherit') so a failure's output can be scanned for the
    // EPERM self-heal below. Echoed to our own stdout/stderr either way so
    // nothing is lost versus the previous inherit-based behaviour.
    encoding: 'utf-8',
    timeout: 30 * 60_000,
    windowsHide: true,
    // Skip puppeteer's post-install Chrome download — it fails outright in
    // network-sandboxed cloud/CCR containers, aborting the install before
    // node_modules/.modules.yaml is written and leaving a half-installed
    // tree (LS-9577). Chromium is pre-installed at /opt/pw-browsers there,
    // so the download is pure waste even where network access succeeds.
    env: {
      ...process.env,
      PUPPETEER_SKIP_DOWNLOAD: '1',
      PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: '1',
    },
  };
  try {
    const out =
      process.platform === 'win32'
        ? execFileSync('cmd', ['/c', 'pnpm', 'install', lockfileFlag], opts)
        : execFileSync('pnpm', ['install', lockfileFlag], opts);
    if (out) process.stdout.write(out);
  } catch (err) {
    if (err.stdout) process.stdout.write(err.stdout);
    if (err.stderr) process.stderr.write(err.stderr);
    if (retrying) throw err; // already retried once — surface the failure.

    const lockedPkg = extractEpermLockedTopLevelPackage(
      `${err.stdout ?? ''}\n${err.stderr ?? ''}`,
    );
    const pkgDir = lockedPkg && join(cwdDir, 'node_modules', lockedPkg);
    if (!pkgDir || !lstatExists(pkgDir)) throw err;

    // Rename the locked package dir OUT of node_modules (not merely aside
    // within it) — otherwise it would get swept into the pool slot on the
    // next successful install and fail future health checks as a package
    // dir missing package.json.
    mkdirSync(poolRoot, { recursive: true });
    const staleDir = join(
      poolRoot,
      `.stale-${lockedPkg.replace(/[\\/]/g, '_')}-${process.pid}-${Date.now()}`,
    );
    console.log(
      `[install] ERR_PNPM_EPERM unlinking a file under node_modules/${lockedPkg} — ` +
        "likely held open by this session's own tsx-based MCP servers (LS-9442). " +
        `Renaming it out of node_modules and retrying once: ${pkgDir} -> ${staleDir}`,
    );
    try {
      renameSync(pkgDir, staleDir);
    } catch (renameErr) {
      console.log(
        `[install] could not rename ${pkgDir} aside: ${String(renameErr.message ?? renameErr)}`,
      );
      throw err;
    }
    pnpmInstall(cwdDir, noFrozen, true);
  }
}

/**
 * Parse pnpm's `ERR_PNPM_EPERM ... unlink '<path>'` failure for the top-level
 * (or `@scope/name`) node_modules package that owns the locked path, e.g.
 * `node_modules\tsx\node_modules\@esbuild\win32-x64\esbuild.exe` -> `tsx`.
 * Returns null when the output doesn't match this specific failure shape.
 */
function extractEpermLockedTopLevelPackage(output) {
  const m = output.match(/ERR_PNPM_EPERM[\s\S]*?unlink '([^']+)'/);
  if (!m) return null;
  const raw = m[1].replace(/\\/g, '/');
  const idx = raw.indexOf('node_modules/');
  if (idx === -1) return null;
  const rest = raw.slice(idx + 'node_modules/'.length).split('/');
  if (rest.length === 0 || !rest[0]) return null;
  return rest[0].startsWith('@') && rest.length > 1
    ? `${rest[0]}/${rest[1]}`
    : rest[0];
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

/** Remove `p` only if it is a real (non-symlink) directory with no entries. */
function removeEmptyDir(p) {
  const st = safeLstat(p);
  if (!st || st.isSymbolicLink() || !st.isDirectory()) return;
  try {
    if (readdirSync(p).length === 0) rmdirSync(p);
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
    // Same symlink-then-junction fallback as node_modules (LS-11021).
    ensureDirSymlink(wtPath, mainPath, name);
  } catch (err) {
    console.warn(
      `[warn] ${name}: ${String(err.message ?? err)}\n` +
        `       Copy the main repo's ${name} into this worktree manually instead.`,
    );
    return;
  }
  console.log(`[ok] ${name}: linked → ${mainPath}`);
}

function fail(msg) {
  console.error(`[modules-pool/link][ERROR] ${msg}`);
  process.exit(1);
}
