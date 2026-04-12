#!/usr/bin/env node
/**
 * MCP server bootstrap shim.
 *
 * Ensures node_modules exists as a directory symlink before launching the
 * actual MCP server. Uses only Node.js built-in modules (no node_modules
 * required) so it runs safely even when the symlink is absent.
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

// --- 1. Only act inside *.worktrees/<name> directories ----------------------
if (parentName.endsWith('.worktrees')) {
  const rootDir = path.dirname(parentDir);
  const mainRepoName = parentName.replace(/\.worktrees$/, '');
  const mainNm = path.join(rootDir, mainRepoName, 'node_modules');
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
