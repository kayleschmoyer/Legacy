#!/usr/bin/env node
/**
 * Bootstrap script: symlink <worktree>/node_modules → <main-repo>/node_modules.
 *
 * Run with plain `node` — no tsx, no pnpm, no MCP required. This is intentionally
 * dependency-free so it works when node_modules is absent and MCP servers have not
 * yet connected (the bootstrap race condition: MCP servers need tsx to start, tsx
 * lives in node_modules).
 *
 * Usage:
 *   node scripts/setup-worktree-node-modules.mjs [--worktree=<path>] [--main-repo=<path>]
 *
 * --worktree    Absolute path to the worktree. Defaults to cwd.
 * --main-repo   Absolute path to the main repo root (parent of node_modules).
 *               Auto-detected when omitted: strips /.claude/worktrees/<name> from
 *               the worktree path.
 */

import {
  existsSync,
  lstatSync,
  readdirSync,
  realpathSync,
  readFileSync,
  rmSync,
  symlinkSync,
  readlinkSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((arg) => {
    const m = arg.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [[m[1], m[2] ?? true]] : [];
  }),
);

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

const cwd = process.cwd();

const worktree = args.worktree ? resolve(String(args.worktree)) : cwd;

let mainRepo;
if (args['main-repo']) {
  mainRepo = resolve(String(args['main-repo']));
} else {
  // Auto-detect: native worktrees live at <main>/.claude/worktrees/<name>
  const nativeMatch = worktree.match(
    /^(.+)[/\\]\.claude[/\\]worktrees[/\\][^/\\]+$/,
  );
  if (nativeMatch) {
    mainRepo = nativeMatch[1];
  } else {
    // Sibling worktrees live at <parent>/<main>.worktrees/<ticket>; main is at <parent>/<main>
    const siblingMatch = worktree.match(
      /^(.+)[/\\]([^/\\]+)\.worktrees[/\\][^/\\]+$/,
    );
    if (siblingMatch) {
      mainRepo = join(siblingMatch[1], siblingMatch[2]);
    } else {
      console.error(
        `[setup-worktree-node-modules] Cannot auto-detect main repo from worktree path:\n  ${worktree}\n` +
          'Pass --main-repo=<path> explicitly.',
      );
      process.exit(1);
    }
  }
}

const nmPath = join(worktree, 'node_modules');
const mainNmPath = join(mainRepo, 'node_modules');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a path for comparison. On Windows, realpathSync may return
 * paths with different casing or a \\?\ prefix.
 */
function normalizePath(p) {
  let normalized = p;
  try {
    normalized = realpathSync(normalized);
  } catch {
    normalized = resolve(normalized);
  }
  if (process.platform === 'win32') {
    if (normalized.startsWith('\\\\?\\')) normalized = normalized.slice(4);
    normalized = normalized.toLowerCase();
  }
  return normalized;
}

/**
 * On Windows, lstatSync().isSymbolicLink() returns true for both directory
 * symlinks and NTFS junctions. Junctions are dangerous because recursive-delete
 * tools follow them. Detect the link type via PowerShell.
 */
function getWindowsLinkType(p) {
  if (process.platform !== 'win32') return null;
  try {
    const out = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `(Get-Item -LiteralPath '${p.replace(/'/g, "''")}' -Force).LinkType`,
      ],
      { encoding: 'utf-8', timeout: 10_000 },
    ).trim();
    if (out === 'SymbolicLink' || out === 'Junction') return out;
    return null;
  } catch {
    return null;
  }
}

/** Check whether a symlink target is actually accessible (Windows false-positive guard). */
function isSymlinkAccessibleOnWindows(p) {
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('[setup-worktree-node-modules]');
console.log(`  worktree  : ${worktree}`);
console.log(`  main repo : ${mainRepo}`);
console.log(`  link path : ${nmPath}`);
console.log(`  target    : ${mainNmPath}`);
console.log('');

// 1. Verify main repo node_modules
if (!existsSync(mainNmPath)) {
  console.error(
    `[ERROR] Main repo node_modules not found at:\n  ${mainNmPath}\n` +
      "Run 'make install' in the main repo first.",
  );
  process.exit(1);
}

// 2. Handle existing node_modules
if (existsSync(nmPath) || lstatExistsSync(nmPath)) {
  let stat;
  try {
    stat = lstatSync(nmPath);
  } catch {
    // Dangling symlink — lstatSync succeeds but target is gone; existsSync returns false
    stat = null;
  }

  if (stat && stat.isSymbolicLink()) {
    const linkType = getWindowsLinkType(nmPath);
    const isJunction = linkType === 'Junction';

    // Check if the symlink points to the correct target
    let currentTarget;
    try {
      currentTarget = realpathSync(nmPath);
    } catch {
      try {
        currentTarget = readlinkSync(nmPath);
      } catch {
        currentTarget = null;
      }
    }

    const pointsToMainRepo =
      currentTarget != null &&
      normalizePath(currentTarget) === normalizePath(mainNmPath);

    if (!isJunction && pointsToMainRepo) {
      // Check health
      let binPopulated = false;
      try {
        binPopulated = readdirSync(join(nmPath, '.bin')).length > 0;
      } catch {
        // .bin missing
      }
      const nxExists = existsSync(join(nmPath, 'nx'));
      const healthy =
        nxExists && binPopulated && isSymlinkAccessibleOnWindows(nmPath);

      if (healthy) {
        const vsdCheck = checkVirtualStoreDir(nmPath, mainRepo);
        if (!vsdCheck.ok) {
          const detail =
            vsdCheck.reason === 'points outside main repo node_modules'
              ? 'points to a sibling worktree (pnpm install ran there last, corrupting this repo)'
              : 'path no longer exists on disk';
          console.error(
            '[ERROR] node_modules symlink exists but pnpm exec paths are corrupted.\n' +
              `  .modules.yaml virtualStoreDir = ${vsdCheck.virtualStoreDir}\n` +
              `  Problem: ${detail}.\n` +
              '\n' +
              '  Fix: run "make install" in the main repo to rebuild node_modules:\n' +
              `    cd "${mainRepo}" && make install`,
          );
          process.exit(1);
        }
        console.log(
          '[ok] node_modules symlink already exists and is healthy. Nothing to do.',
        );
        process.exit(0);
      }
      console.log(
        '[info] Symlink exists and points to correct target but is unhealthy ' +
          '(empty .bin or inaccessible). Removing and recreating.',
      );
    } else if (isJunction) {
      console.log(
        '[info] Junction detected — converting to a directory symlink (safe for recursive-delete).',
      );
    } else {
      console.log(
        `[info] Symlink points to wrong target:\n  got:  ${currentTarget}\n  want: ${mainNmPath}\nRemoving.`,
      );
    }

    // Remove existing link / junction
    if (isJunction && process.platform === 'win32') {
      execFileSync('cmd', ['/c', 'rmdir', nmPath], {
        encoding: 'utf-8',
        timeout: 10_000,
      });
    } else {
      rmSync(nmPath, { recursive: false });
    }
  } else if (stat && stat.isDirectory()) {
    console.error(
      '[ERROR] node_modules is a real directory (not a symlink). ' +
        'Delete it manually if you want to replace it with a symlink:\n' +
        `  powershell -NoProfile -Command "Remove-Item -Path '${nmPath}' -Recurse -Force"`,
    );
    process.exit(1);
  } else if (stat) {
    console.error(
      `[ERROR] node_modules exists but is neither a symlink nor a directory (mode: ${stat.mode.toString(8)}). ` +
        'Delete it manually before running this script.',
    );
    process.exit(1);
  } else {
    // Dangling symlink without stat — remove the broken link entry
    try {
      rmSync(nmPath, { recursive: false });
    } catch {
      // Already gone
    }
  }
}

// 3. Create the symlink
console.log('[info] Creating node_modules symlink...');

if (process.platform === 'win32') {
  // mklink /D = directory symlink (NOT a junction — safe for recursive-delete).
  // Requires Windows Developer Mode.
  let mkLinkErr;
  try {
    execFileSync('cmd', ['/c', 'mklink', '/D', nmPath, mainNmPath], {
      encoding: 'utf-8',
      timeout: 15_000,
    });
  } catch (err) {
    mkLinkErr = err;
  }

  if (mkLinkErr || !isSymlinkAccessibleOnWindows(nmPath)) {
    const msg = mkLinkErr
      ? String(mkLinkErr.message ?? mkLinkErr)
      : 'mklink exited 0 but path is not accessible (false-positive)';
    const needsDeveloperMode = /privilege|EPERM|1314/i.test(msg);
    console.error(
      `[ERROR] Failed to create directory symlink: ${msg}` +
        (needsDeveloperMode
          ? '\n\nDirectory symlinks require Windows Developer Mode.\n' +
            'Enable it: Settings > System > For Developers > Developer Mode\n' +
            '\nAlternative — run make install inside the worktree for an independent node_modules:\n' +
            '  make install'
          : '\n\nAlternative — run make install inside the worktree:\n  make install'),
    );
    process.exit(1);
  }
} else {
  symlinkSync(mainNmPath, nmPath);
}

// 4. Validate
let binPopulated = false;
try {
  binPopulated = readdirSync(join(nmPath, '.bin')).length > 0;
} catch {
  // .bin missing
}
const nxExists = existsSync(join(nmPath, 'nx'));
const verified = nxExists && binPopulated;
const linkType = getWindowsLinkType(nmPath) ?? 'symlink';

if (verified) {
  console.log(`[ok] node_modules ${linkType} created and verified.`);
  console.log('     Ready to run pnpm/make commands.');
} else if (!nxExists) {
  console.warn(
    '[warn] Symlink created but nx not found — verify that the main repo node_modules is populated.\n' +
      "       Run 'make install' in the main repo, then re-run this script.",
  );
} else {
  console.warn(
    '[warn] Symlink created but .bin is empty — main repo node_modules may be incomplete.\n' +
      "       Run 'make install' in the main repo, then re-run this script.",
  );
}

// ---------------------------------------------------------------------------
// Utility: lstatSync that returns null instead of throwing for missing entries
// ---------------------------------------------------------------------------
function lstatExistsSync(p) {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Utility: validate virtualStoreDir in node_modules/.modules.yaml
// ---------------------------------------------------------------------------
/**
 * Reads .modules.yaml and validates the declared virtualStoreDir. Returns
 * { ok: true } if the check passes or is skipped (file absent, field absent,
 * or unreadable). Returns { ok: false, virtualStoreDir, reason } when the
 * declared path does not exist on disk or resolves outside the main repo's
 * node_modules (e.g., a stale sibling-worktree reference) — callers must
 * treat this as unhealthy.
 */
function checkVirtualStoreDir(nmPath, mainRepo) {
  const modulesYamlPath = join(nmPath, '.modules.yaml');
  if (!existsSync(modulesYamlPath)) return { ok: true };

  let content;
  try {
    content = readFileSync(modulesYamlPath, 'utf-8');
  } catch {
    return { ok: true };
  }

  // Simple line-based parse — avoids a yaml-parser dependency.
  const match = content.match(/^virtualStoreDir:\s*(.+)$/m);
  if (!match) return { ok: true };

  const rawVsd = match[1].trim().replace(/^['"]|['"]$/g, '');

  // pnpm may write virtualStoreDir as a relative path (relative to node_modules).
  // Resolve against mainNmPath (the real node_modules location), not the worktree
  // symlink path, so relative entries resolve correctly regardless of CWD.
  const mainNmPath = join(mainRepo, 'node_modules');
  const absoluteVsd = resolve(mainNmPath, rawVsd);

  // Check 1: path must exist on disk.
  if (!existsSync(absoluteVsd)) {
    return {
      ok: false,
      virtualStoreDir: rawVsd,
      reason: 'path does not exist',
    };
  }

  // Check 2: must be under main repo node_modules, not a sibling worktree.
  // A stale pointer to a sibling worktree's .pnpm store corrupts pnpm exec even
  // when the sibling still exists on disk (pnpm uses the raw path for resolution,
  // not the resolved real path). Use resolve() — not realpathSync() — to avoid
  // following junctions that mask sibling-worktree references.
  const normalizeRaw = (p) => {
    let n = resolve(p);
    if (process.platform === 'win32') {
      if (n.startsWith('\\\\?\\')) n = n.slice(4);
      n = n.toLowerCase();
    }
    return n;
  };

  const pathSep = process.platform === 'win32' ? '\\' : '/';
  const normalizedVsd = normalizeRaw(absoluteVsd);
  const normalizedMainNm = normalizeRaw(mainNmPath);
  // Use a path-separator boundary to prevent false positives from paths that
  // share a common prefix (e.g. .../node_modules-backup/...).
  const mainNmPrefix = normalizedMainNm.endsWith(pathSep)
    ? normalizedMainNm
    : normalizedMainNm + pathSep;
  if (
    normalizedVsd !== normalizedMainNm &&
    !normalizedVsd.startsWith(mainNmPrefix)
  ) {
    return {
      ok: false,
      virtualStoreDir: rawVsd,
      reason: 'points outside main repo node_modules',
    };
  }

  return { ok: true, virtualStoreDir: rawVsd };
}
