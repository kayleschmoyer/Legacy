#!/usr/bin/env node
/**
 * modules-pool: garbage-collect orphan snapshot slots.
 *
 * Phase 0 (opt-in) of docs/rfcs/modules-pool/README.md §4.4. The pool grows by
 * one slot per distinct lockfile; this prunes slots that are:
 *   - NOT referenced by any live node_modules symlink (main repo + every native
 *     worktree under <main>/.claude/worktrees/*), AND
 *   - older than --max-age-days (default 14).
 *
 * Stale `.tmp-*` dirs (left by a crashed materialise) are always removed.
 *
 * Dependency-free — runs with plain `node`.
 *
 * Usage:
 *   node scripts/modules-pool/gc.mjs [--main-repo=<path>] [--max-age-days=N] [--dry-run]
 */

import {
  existsSync,
  lstatSync,
  readdirSync,
  realpathSync,
  readlinkSync,
  statSync,
  rmSync,
} from 'node:fs';
import { join, resolve, basename, dirname } from 'node:path';

const POOL_DIRNAME = '.modules-pool';

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((arg) => {
    const m = arg.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [[m[1], m[2] ?? true]] : [];
  }),
);

// Values may arrive as CLI flags or, when invoked via `make modules-gc`, through
// make-exported environment variables. Routing make's DAYS/DRY through the
// environment (rather than interpolating them into the shell command line)
// avoids any argument/command injection from those make variables.
const dryRun =
  Boolean(args['dry-run']) || isTruthy(process.env.MODULES_POOL_DRY);
const rawMaxAge =
  args['max-age-days'] ?? nonEmpty(process.env.MODULES_POOL_DAYS);
const maxAgeDays = rawMaxAge != null ? Number(rawMaxAge) : 14;
if (!Number.isFinite(maxAgeDays) || maxAgeDays < 0) {
  fail(`--max-age-days must be a non-negative number, got: ${rawMaxAge}`);
}

const mainRepo = resolveMainRepo(args['main-repo']);
const poolRoot = join(mainRepo, POOL_DIRNAME);

console.log('[modules-pool/gc]');
console.log(`  main repo   : ${mainRepo}`);
console.log(`  pool        : ${poolRoot}`);
console.log(`  max age     : ${maxAgeDays} day(s)`);
console.log(`  mode        : ${dryRun ? 'dry-run' : 'delete'}`);
console.log('');

if (!existsSync(poolRoot)) {
  console.log('[ok] pool does not exist — nothing to GC.');
  process.exit(0);
}

// 1. Build the live set: hashes any consumer currently symlinks into.
const live = collectLiveHashes();
console.log(`  live slots  : ${live.size ? [...live].join(', ') : '(none)'}`);
console.log('');

// 2. Walk the pool.
const cutoffMs = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
let removed = 0;
let kept = 0;
let reclaimedTmp = 0;

for (const name of readdirSync(poolRoot)) {
  const slotPath = join(poolRoot, name);

  // Always reclaim stale temp dirs from crashed materialisations.
  if (name.startsWith('.tmp-')) {
    console.log(`  tmp   ${name} → remove (crashed materialise)`);
    remove(slotPath);
    reclaimedTmp++;
    continue;
  }

  if (live.has(name)) {
    kept++;
    continue;
  }

  const mtime = safeMtimeMs(slotPath);
  if (mtime != null && mtime > cutoffMs) {
    console.log(`  keep  ${name} → orphan but younger than ${maxAgeDays}d`);
    kept++;
    continue;
  }

  const ageDays =
    mtime != null ? ((Date.now() - mtime) / 86_400_000).toFixed(1) : '?';
  console.log(`  prune ${name} → orphan, ${ageDays}d old`);
  remove(slotPath);
  removed++;
}

console.log('');
console.log(
  `[ok] ${dryRun ? 'would remove' : 'removed'} ${removed} orphan slot(s), ` +
    `reclaimed ${reclaimedTmp} tmp dir(s), kept ${kept}.`,
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function collectLiveHashes() {
  const consumers = [mainRepo];
  const wtRoot = join(mainRepo, '.claude', 'worktrees');
  if (existsSync(wtRoot)) {
    for (const name of safeReaddir(wtRoot)) {
      consumers.push(join(wtRoot, name));
    }
  }

  const hashes = new Set();
  for (const consumer of consumers) {
    const nm = join(consumer, 'node_modules');
    const st = safeLstat(nm);
    if (!st || !st.isSymbolicLink()) continue; // real dir or absent — not a pool consumer
    const target = safeRealpath(nm) ?? safeReadlink(nm);
    if (!target) continue;
    const h = hashFromTarget(target);
    if (h) hashes.add(h);
  }
  return hashes;
}

/**
 * A pool symlink points at <poolRoot>/<hash>/node_modules. Extract <hash> only
 * when the target actually lives under THIS repo's pool.
 */
function hashFromTarget(target) {
  const resolved = resolve(target);
  const parent = dirname(resolved); // <poolRoot>/<hash>
  if (basename(resolved) !== 'node_modules') return null;
  if (normalize(dirname(parent)) !== normalize(poolRoot)) return null;
  return basename(parent);
}

function resolveMainRepo(explicit) {
  if (explicit) return resolve(String(explicit));
  const cwd = process.cwd();
  const native = cwd.match(/^(.+)[/\\]\.claude[/\\]worktrees[/\\][^/\\]+$/);
  if (native) return native[1];
  const sibling = cwd.match(/^(.+)[/\\]([^/\\]+)\.worktrees[/\\][^/\\]+$/);
  if (sibling) return join(sibling[1], sibling[2]);
  try {
    if (lstatSync(join(cwd, '.git')).isDirectory()) return cwd;
  } catch {
    /* fall through */
  }
  fail(
    `Cannot auto-detect main repo from cwd:\n  ${cwd}\nPass --main-repo=<path>.`,
  );
}

function remove(p) {
  if (dryRun) return;
  try {
    rmSync(p, { recursive: true, force: true });
  } catch (err) {
    console.warn(
      `  [warn] failed to remove ${p}: ${String(err.message ?? err)}`,
    );
  }
}

function normalize(p) {
  let n = resolve(p);
  if (process.platform === 'win32') {
    if (n.startsWith('\\\\?\\')) n = n.slice(4);
    n = n.toLowerCase();
  }
  return n;
}

function safeMtimeMs(p) {
  try {
    return statSync(p).mtimeMs;
  } catch {
    return null;
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
function safeReaddir(p) {
  try {
    return readdirSync(p);
  } catch {
    return [];
  }
}

function isTruthy(v) {
  return (
    v != null && v !== '' && v !== '0' && String(v).toLowerCase() !== 'false'
  );
}
function nonEmpty(v) {
  return v != null && v !== '' ? v : null;
}

function fail(msg) {
  console.error(`[modules-pool/gc][ERROR] ${msg}`);
  process.exit(1);
}
