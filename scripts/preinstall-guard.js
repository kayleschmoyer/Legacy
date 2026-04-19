// Pre-install guard: enforces pnpm-only and blocks symlink mutations.
//
// 1. Rejects npm / yarn — only pnpm is allowed in this monorepo.
// 2. Aborts if node_modules is a symlink (running in a worktree).
// 3. Aborts if worktrees have symlinks pointing to this node_modules (main repo)
//    AND the lockfile has uncommitted changes (meaning install would mutate deps
//    in a way the worktrees don't expect). If the lockfile is clean, the install
//    is safe — it just materializes what's already committed.
//
// This runs as a "preinstall" lifecycle script before pnpm touches anything.
// It catches `pnpm install`, `npm install`, and `yarn install`.
//
// Bypass: set FORCE_INSTALL=1 to skip symlink guards (Guards 1 & 2).
//   $env:FORCE_INSTALL=1; pnpm install    (PowerShell)
//   FORCE_INSTALL=1 pnpm install          (bash)

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const forceInstall = process.env.FORCE_INSTALL === '1';

if (forceInstall) {
  console.error('');
  console.error('='.repeat(70));
  console.error(' WARNING: FORCE_INSTALL=1 set — symlink safety checks');
  console.error('          (Guards 1 & 2) are DISABLED for this install.');
  console.error('');
  console.error(' This run may mutate shared node_modules without guardrails.');
  console.error(' Only use this if you understand the risks.');
  console.error('='.repeat(70));
  console.error('');
}

// ---------------------------------------------------------------------------
// Guard 0: Block non-pnpm package managers
// ---------------------------------------------------------------------------
// npm and yarn set npm_config_user_agent; pnpm sets it too.
// npm: "npm/10.x.x node/22.x.x ..."
// yarn: "yarn/4.x.x ..."
// pnpm: "pnpm/9.x.x ..."
const userAgent = process.env.npm_config_user_agent || '';
if (userAgent && !userAgent.startsWith('pnpm')) {
  const pm = userAgent.split('/')[0] || 'unknown';
  console.error('');
  console.error('='.repeat(70));
  console.error(` BLOCKED: ${pm} is not allowed — use pnpm`);
  console.error('='.repeat(70));
  console.error('');
  console.error(' This monorepo uses pnpm exclusively.');
  console.error(
    ' Running npm or yarn will create an incompatible node_modules',
  );
  console.error(' and corrupt the workspace.');
  console.error('');
  console.error(' To install dependencies:  make install');
  console.error(' To add a package:         pnpm add -w <package>');
  console.error('');
  console.error('='.repeat(70));
  process.exit(1);
}

const nmPath = path.join(__dirname, '..', 'node_modules');

/**
 * Check if lockfiles have uncommitted changes (staged or unstaged).
 * If clean, `pnpm install` is deterministic — it just materializes what's
 * already committed. Safe for symlinked worktrees sharing the same lockfile.
 */
function isLockfileDirty() {
  try {
    const status = execSync(
      'git status --porcelain -- pnpm-lock.yaml **/pnpm-lock.yaml package.json **/package.json',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    return status.trim().length > 0;
  } catch {
    // git not available — assume dirty to be safe
    return true;
  }
}

if (!forceInstall) {
  // Guard 1: Block if this node_modules is a symlink (running in a worktree)
  try {
    // readlinkSync succeeds only for symlinks.
    // For a real directory it throws EINVAL / UNKNOWN.
    const target = fs.readlinkSync(nmPath);
    console.error('');
    console.error('='.repeat(70));
    console.error(
      ' BLOCKED: node_modules is a symlink (shared with main repo)',
    );
    console.error('='.repeat(70));
    console.error('');
    console.error(' Target: ' + target);
    console.error('');
    console.error(' Running pnpm install here would mutate the shared');
    console.error(' node_modules and break every other symlinked worktree.');
    console.error('');
    console.error(' To fix:');
    console.error('   1. Remove the symlink:  rm -rf node_modules');
    console.error('   2. Re-run:               make install');
    console.error('   -- or --');
    console.error(
      '   Re-run worktree setup:   make wt-setup WT=' +
        __dirname.replace(/[\\/]scripts$/, ''),
    );
    console.error('   -- or --');
    console.error('   Bypass:  FORCE_INSTALL=1 pnpm install');
    console.error('');
    console.error('='.repeat(70));
    process.exit(1);
  } catch {
    // EINVAL / ENOENT / UNKNOWN = not a symlink. Continue to Guard 2.
  }
}

// Guard 2: Block if worktrees have symlinks pointing TO this node_modules.
// This catches the case where an agent runs `pnpm install` (or `make install`)
// in the main repo while worktrees share this node_modules via symlinks.
if (!forceInstall && process.platform === 'win32' && fs.existsSync(nmPath)) {
  try {
    const wtOutput = execSync('git worktree list --porcelain', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const cwd = process.cwd();
    const worktrees = wtOutput
      .split('\n')
      .filter((line) => line.startsWith('worktree '))
      .map((line) => line.replace('worktree ', '').trim())
      .filter((wt) => path.resolve(wt) !== path.resolve(cwd));

    const linked = [];
    for (const wt of worktrees) {
      const wtNm = path.join(wt, 'node_modules');
      try {
        const target = fs.readlinkSync(wtNm);
        // Check if the symlink points to this repo's node_modules
        // Use case-insensitive comparison on Windows (drive letters / path normalization)
        const resolvedTarget = path.resolve(target);
        const resolvedNm = path.resolve(nmPath);
        const match =
          process.platform === 'win32'
            ? resolvedTarget.toLowerCase() === resolvedNm.toLowerCase()
            : resolvedTarget === resolvedNm;
        if (match) {
          linked.push(wt);
        }
      } catch {
        // Not a symlink or doesn't exist — safe
      }
    }

    if (linked.length > 0) {
      // If lockfiles are clean, the install is deterministic — it just
      // materializes packages that are already committed. This is safe
      // for symlinked worktrees since they share the same lockfile.
      if (!isLockfileDirty()) {
        console.error('');
        console.error(
          ` [preinstall-guard] ${linked.length} symlinked worktree(s) detected.`,
        );
        console.error(
          ' Lockfile is clean — install is safe (catching up node_modules).',
        );
        console.error('');
        // Allow the install to proceed
      } else {
        console.error('');
        console.error('='.repeat(70));
        console.error(' BLOCKED: worktrees have symlinks to this node_modules');
        console.error('='.repeat(70));
        console.error('');
        console.error(
          ' Lockfile has uncommitted changes — installing would mutate the',
        );
        console.error(
          ' shared node_modules in a way symlinked worktrees do not expect.',
        );
        console.error('');
        console.error(' Symlinked worktrees:');
        for (const wt of linked) {
          console.error('   - ' + wt);
        }
        console.error('');
        console.error(' What to do instead:');
        console.error('   - Commit or stash lockfile changes first');
        console.error('   - Clean up idle worktrees:  twig worktree clean');
        console.error('   - Or remove their symlinks:');
        console.error('     cd <worktree> && rm -rf node_modules');
        console.error('   - Or force install:');
        console.error('     $env:FORCE_INSTALL=1; pnpm install');
        console.error('');
        console.error('='.repeat(70));
        process.exit(1);
      }
    }
  } catch {
    // git not available or worktree list failed — skip guard
  }
}
