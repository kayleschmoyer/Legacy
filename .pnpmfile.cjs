// .pnpmfile.cjs — pnpm hooks for the Legacy Sports monorepo.
//
// afterAllResolved fires AFTER dependency resolution but BEFORE pnpm writes
// anything to node_modules. Throwing here aborts the install with zero
// filesystem side-effects — no temp dirs, no partial links, nothing.
//
// This gives us a true pre-link guard that complements preinstall-guard.js
// (which fires too late: pnpm runs lifecycle scripts after linking, so the
// preinstall hook cannot prevent node_modules from being modified).
//
// Guards implemented here mirror those in scripts/preinstall-guard.js so
// that direct `pnpm install` calls are protected the same way `make install`
// (which routes through the content-addressable node_modules pool,
// scripts/modules-pool/link.mjs) already is.

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const forceInstall = process.env.FORCE_INSTALL === '1';

/** Returns the junction/symlink target, or null if nmPath is a real dir. */
function symlinkTarget(nmPath) {
  try {
    return fs.readlinkSync(nmPath);
  } catch {
    return null; // EINVAL / ENOENT = real directory
  }
}

/**
 * True when a node_modules symlink points into the shared modules pool
 * (<main-repo>/.modules-pool/<hash>/node_modules). Pool slots are IMMUTABLE
 * and shared by every consumer on the machine, so installs through such a
 * link are never allowed — not even with FORCE_INSTALL=1 (LS-8548).
 */
function isPoolTarget(nmPath, target) {
  const resolved = path.resolve(path.dirname(nmPath), target);
  const needle = `${path.sep}.modules-pool${path.sep}`;
  return process.platform === 'win32'
    ? resolved.toLowerCase().includes(needle.toLowerCase())
    : resolved.includes(needle);
}

/** True if any staged/unstaged changes exist to lockfile or package.json. */
function isLockfileDirty(cwd) {
  try {
    const out = execSync(
      'git status --porcelain -- pnpm-lock.yaml **/pnpm-lock.yaml package.json **/package.json',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], cwd },
    );
    return out.trim().length > 0;
  } catch {
    return true; // git unavailable — assume dirty to be safe
  }
}

module.exports = {
  hooks: {
    /**
     * afterAllResolved — runs after resolution, before any node_modules write.
     * Throwing aborts the install cleanly; pnpm prints the error and exits 1.
     */
    afterAllResolved(lockfile, context) {
      const cwd = process.cwd();
      const nmPath = path.join(cwd, 'node_modules');
      const target = symlinkTarget(nmPath);

      // Guard A0: block if node_modules symlinks into the shared modules pool.
      // A pool slot is an IMMUTABLE snapshot shared by the main repo and every
      // worktree on the same lockfile — an install writing through the link
      // corrupts them all at once (LS-8546/LS-8548). There is no legitimate
      // reason to install through a pool link, so FORCE_INSTALL=1 does NOT
      // bypass this guard.
      //
      // Exception: `--lockfile-only` resolves and rewrites pnpm-lock.yaml
      // without touching node_modules, so it cannot mutate the slot. It is
      // also the sanctioned way to refresh the lockfile's pnpmfileChecksum
      // after this file changes — blocking it would leave pool-linked
      // checkouts (i.e. every local checkout) unable to regenerate it. The
      // hook runs inside the pnpm process, so the CLI flag is visible on
      // process.argv.
      const lockfileOnly = process.argv.includes('--lockfile-only');
      if (target !== null && !lockfileOnly && isPoolTarget(nmPath, target)) {
        throw new Error(
          [
            '',
            '='.repeat(70),
            ' BLOCKED (pre-link): node_modules is a symlink into the shared',
            ' modules pool (.modules-pool) — install aborted',
            '='.repeat(70),
            '',
            ' Target: ' + target,
            '',
            ' Pool slots are IMMUTABLE snapshots shared by the main repo and',
            ' every worktree on the same lockfile. Installing here would write',
            ' through the symlink and corrupt the slot for ALL of them.',
            ' No files were written.',
            '',
            ' Never run an install through a pool symlink. Instead:',
            '   node scripts/modules-pool/link.mjs',
            ' (re-links this checkout to the slot matching its lockfile,',
            '  materialising a fresh slot if needed).',
            '',
            ' FORCE_INSTALL=1 does not bypass this check.',
            '',
            '='.repeat(70),
          ].join('\n'),
        );
      }

      if (forceInstall) return lockfile;

      // Guard A: block if THIS node_modules is a symlink (worktree calling
      // `pnpm install` directly instead of via `make install`). Same
      // `--lockfile-only` exception as Guard A0: no node_modules writes.
      if (target !== null && !lockfileOnly) {
        throw new Error(
          [
            '',
            '='.repeat(70),
            ' BLOCKED (pre-link): node_modules is a symlink — install aborted',
            '='.repeat(70),
            '',
            ' Target: ' + target,
            '',
            ' Running pnpm install here would mutate the shared node_modules',
            ' and break every other symlinked worktree. No files were written.',
            '',
            ' To fix:',
            '   1. Remove the symlink:  cmd /c "rmdir node_modules"',
            '   2. Re-run:               make install',
            '   -- or --',
            '   Bypass (dangerous):  FORCE_INSTALL=1 pnpm install',
            '',
            '='.repeat(70),
          ].join('\n'),
        );
      }

      // Guard B: block if worktrees symlink TO this node_modules AND the
      // lockfile is dirty (install would mutate shared state unexpectedly).
      if (process.platform === 'win32' && fs.existsSync(nmPath)) {
        try {
          const wtOut = execSync('git worktree list --porcelain', {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd,
          });
          const linked = wtOut
            .split('\n')
            .filter((l) => l.startsWith('worktree '))
            .map((l) => l.replace('worktree ', '').trim())
            .filter((wt) => path.resolve(wt) !== path.resolve(cwd))
            .filter((wt) => {
              const t = symlinkTarget(path.join(wt, 'node_modules'));
              if (!t) return false;
              return process.platform === 'win32'
                ? path.resolve(t).toLowerCase() ===
                    path.resolve(nmPath).toLowerCase()
                : path.resolve(t) === path.resolve(nmPath);
            });

          if (linked.length > 0 && isLockfileDirty(cwd)) {
            throw new Error(
              [
                '',
                '='.repeat(70),
                ' BLOCKED (pre-link): worktrees symlink to this node_modules',
                '='.repeat(70),
                '',
                ' Lockfile has uncommitted changes — installing would mutate the',
                ' shared node_modules in a way symlinked worktrees do not expect.',
                '',
                ' Symlinked worktrees:',
                ...linked.map((wt) => '   - ' + wt),
                '',
                ' Commit or stash lockfile changes first, or:',
                '   FORCE_INSTALL=1 pnpm install',
                '',
                '='.repeat(70),
              ].join('\n'),
            );
          }

          if (linked.length > 0) {
            context.log(
              ` [pnpmfile] ${linked.length} symlinked worktree(s) detected — lockfile clean, proceeding.`,
            );
          }
        } catch (e) {
          // Re-throw our intentional blocks; swallow git errors silently.
          if (e.message.includes('BLOCKED')) throw e;
        }
      }

      return lockfile;
    },
  },
};
