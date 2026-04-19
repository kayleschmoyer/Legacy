#!/usr/bin/env node
/**
 * MCP server bootstrap shim.
 *
 * Ensures node_modules is present before launching the actual MCP server.
 * Uses only Node.js built-in modules so it runs safely even when
 * node_modules is absent.
 *
 * Two environments are handled:
 *
 *   Cloud agents (Copilot Coding Agent, Claude Code on the web):
 *     CWD is the repo root (parentName does NOT end with ".worktrees").
 *     copilot-setup-steps.yml normally installs deps first, but if that step
 *     failed or was skipped, node_modules may be absent.  The shim detects
 *     this and runs `corepack pnpm install --frozen-lockfile` so MCP servers do not
 *     fail silently with a missing-module error.
 *
 *   Local worktrees (Windows/macOS/Linux developer machines):
 *     CWD is inside either a *.worktrees/<name>/ directory (sibling worktrees)
 *     or a .claude/worktrees/<name>/ directory (native ephemeral worktrees).
 *     node_modules is a symlink to the main repo's node_modules.  The shim
 *     creates or repairs that symlink before starting the server.
 *
 * Usage (via mcp.json):
 *   "command": "node",
 *   "args": [".github/copilot/hooks/mcp-bootstrap.mjs", "node", "--import", "tsx", "tools/mcp/..."]
 *
 * Platform: Windows (mklink /D or fs.symlinkSync) and Linux/macOS (ln -s).
 */

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const parentDir = path.dirname(cwd);
const parentName = path.basename(parentDir);

/**
 * Returns true if node_modules exists and resolves to a directory.
 * Uses lstatSync so broken symlinks are detected (statSync would throw).
 */
function isNodeModulesHealthy(nmPath) {
  try {
    fs.lstatSync(nmPath); // throws if absent
    return fs.statSync(nmPath).isDirectory(); // follows symlinks
  } catch {
    return false;
  }
}

// Detect both worktree patterns before branching:
//   Pattern A (native ephemeral): <repo>/.claude/worktrees/<name>
//   Pattern B (sibling):          <root>/<repo>.worktrees/<name>
// Pattern A was previously undetected — parentName would be 'worktrees', not
// ending with '.worktrees', so native worktrees fell into the cloud branch and
// incorrectly triggered `corepack pnpm install` when node_modules was absent
// instead of creating the symlink to the main repo's node_modules (LS-3716).
const cwdNormalized = cwd.replace(/\\/g, '/');
const nativeWorktreeMatch = cwdNormalized.match(
  /^(.*)\/.claude\/worktrees\/[^/]+$/,
);
const isSiblingWorktree = parentName.endsWith('.worktrees');
const isLocalWorktree = nativeWorktreeMatch !== null || isSiblingWorktree;

// Pre-compute mainNm for whichever worktree pattern matched
let localWorktreeMainNm = null;
if (nativeWorktreeMatch) {
  // Strip the /.claude/worktrees/<name> suffix to get the main repo root
  const mainRepoPath = nativeWorktreeMatch[1].replace(/\//g, path.sep);
  localWorktreeMainNm = path.join(mainRepoPath, 'node_modules');
} else if (isSiblingWorktree) {
  const rootDir = path.dirname(parentDir);
  const mainRepoName = parentName.replace(/\.worktrees$/, '');
  localWorktreeMainNm = path.join(rootDir, mainRepoName, 'node_modules');
}

// --- 1a. Cloud / non-worktree environment: ensure node_modules is present ---
// In cloud agents (Copilot Coding Agent, Claude Code on the web) the CWD is
// the repo root — isLocalWorktree will be false.  The
// copilot-setup-steps.yml installs deps before the agent starts, but if that
// step failed or was skipped (e.g. a restarted session) node_modules may be
// absent.  Detect and recover so MCP servers do not fail silently.
// Uses `corepack pnpm` rather than bare `pnpm` so the install works even
// when Corepack wasn't activated by copilot-setup-steps.yml.
if (!isLocalWorktree) {
  const nmPath = path.join(cwd, 'node_modules');
  if (!isNodeModulesHealthy(nmPath)) {
    process.stderr.write(
      `[mcp-bootstrap] node_modules not found at ${nmPath} — running corepack pnpm install --frozen-lockfile\n`,
    );
    try {
      execFileSync('corepack', ['pnpm', 'install', '--frozen-lockfile'], {
        stdio: 'inherit',
        cwd,
      });
    } catch (e) {
      process.stderr.write(
        `[mcp-bootstrap] ERROR: corepack pnpm install failed: ${e.message}\n` +
          `  MCP servers require node_modules to be present.\n` +
          `  Ensure Corepack is available and copilot-setup-steps.yml ran successfully before starting the agent.\n`,
      );
      // Do not exit — the MCP server launch below will fail with a clearer error
      // about the missing module (tsx) rather than a generic bootstrap failure.
    }
  }
}

// --- 1b. Worktree environment: ensure node_modules symlink points to main repo
if (isLocalWorktree && localWorktreeMainNm !== null) {
  const mainNm = localWorktreeMainNm;
  const worktreeNm = path.join(cwd, 'node_modules');

  // Use lstatSync to detect broken symlinks (statSync follows links and throws).
  const nmStat = (() => {
    try {
      return fs.lstatSync(worktreeNm);
    } catch {
      return null;
    }
  })();

  const nmHealthy =
    nmStat !== null &&
    (() => {
      try {
        // Follow the link to verify the target exists and is a directory
        return fs.statSync(worktreeNm).isDirectory();
      } catch {
        return false;
      }
    })();

  if (!nmHealthy && fs.existsSync(mainNm)) {
    // Remove stale/broken symlink before creating a new one
    if (nmStat !== null) {
      try {
        if (process.platform === 'win32') {
          execFileSync('cmd', ['/c', `rmdir "${worktreeNm}"`], {
            stdio: 'ignore',
          });
        } else {
          fs.rmSync(worktreeNm, { force: true, recursive: false });
        }
      } catch {
        // Best-effort removal
      }
    }
    const isWindows = process.platform === 'win32';

    if (isWindows) {
      // Prefer cmd mklink /D (directory symlink, not junction — safe under recursive delete)
      try {
        execFileSync('cmd', ['/c', `mklink /D "${worktreeNm}" "${mainNm}"`], {
          stdio: 'ignore',
        });
      } catch {
        // Fall back to PowerShell New-Item (also creates a SymbolicLink, not junction).
        // Try pwsh (PS 7+) first, then fall back to powershell.exe (PS 5.1).
        const psArgs = [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `New-Item -ItemType SymbolicLink -Path '${worktreeNm}' -Target '${mainNm}'`,
        ];
        let psFallbackOk = false;
        for (const psExe of ['pwsh', 'powershell']) {
          try {
            execFileSync(psExe, psArgs, { stdio: 'ignore' });
            psFallbackOk = true;
            break;
          } catch {
            // Try next
          }
        }
        if (!psFallbackOk) {
          process.stderr.write(
            `[mcp-bootstrap] WARNING: Could not create node_modules symlink.\n` +
              `  Source: ${worktreeNm}\n` +
              `  Target: ${mainNm}\n` +
              `  Directory symlinks require Windows Developer Mode.\n`,
          );
        }
      }
    } else {
      // Linux / macOS
      try {
        fs.symlinkSync(mainNm, worktreeNm, 'dir');
      } catch (e) {
        process.stderr.write(
          `[mcp-bootstrap] WARNING: Could not create node_modules symlink: ${e.message}\n`,
        );
      }
    }
  }
}

// --- 2. Exec the real MCP server command ------------------------------------
const [cmd, ...cmdArgs] = process.argv.slice(2);

if (!cmd) {
  process.stderr.write(
    '[mcp-bootstrap] ERROR: No command specified. Usage: mcp-bootstrap.mjs <cmd> [...args]\n',
  );
  process.exit(1);
}

const child = spawn(cmd, cmdArgs, { stdio: 'inherit' });
child.on('exit', (code, signal) => {
  // If killed by signal (code === null), exit non-zero to surface the failure
  if (code !== null) {
    process.exit(code);
  } else {
    process.stderr.write(
      `[mcp-bootstrap] MCP server terminated by signal ${signal}\n`,
    );
    process.exit(1);
  }
});
child.on('error', (err) => {
  process.stderr.write(
    `[mcp-bootstrap] Failed to start ${cmd}: ${err.message}\n`,
  );
  process.exit(1);
});
