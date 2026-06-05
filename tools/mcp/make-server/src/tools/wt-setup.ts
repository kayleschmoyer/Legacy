import { existsSync, lstatSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runCommand, runMake, getRepoRoot } from '../run-command.js';
import type { ToolResult } from '../types.js';

function isSymlink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

interface WtSetupParams {
  worktreePath: string;
  removeSymlink?: boolean;
  noFrozenLockfile?: boolean;
}

/**
 * Set up a worktree for development. This runs `make wt-setup WT=<path>` which:
 *   1. Creates a node_modules symlink to the main repo (if not already present)
 *   2. Copies .env from the main repo
 *   3. Creates .twig config
 *   4. Installs git hooks
 *
 * If removeSymlink is true, it will:
 *   1. Remove the node_modules symlink
 *   2. Run `make install` to create independent node_modules
 *
 * This is needed when the worktree requires different dependencies (e.g.,
 * after adding/removing packages on the branch).
 *
 * NOTE: `make wt-setup` is Windows-only. On other platforms this tool returns an error.
 */
export async function wtSetup(params: WtSetupParams): Promise<ToolResult> {
  const {
    worktreePath,
    removeSymlink = false,
    noFrozenLockfile = false,
  } = params;

  if (process.platform !== 'win32') {
    return {
      content: [
        {
          type: 'text',
          text: 'make_wt_setup is Windows-only. On Linux/macOS, run: make install && cp .env from main repo.',
        },
      ],
      isError: true,
    };
  }

  if (!existsSync(worktreePath)) {
    return {
      content: [
        {
          type: 'text',
          text: `Worktree path does not exist: ${worktreePath}`,
        },
      ],
      isError: true,
    };
  }

  const repoRoot = getRepoRoot();
  const log: string[] = [`[worktree: ${worktreePath}]`];
  let symlinkActuallyRemoved = false;

  try {
    // Step 1: Run make wt-setup from the main repo
    const wtSetupArgs = ['wt-setup', `WT=${worktreePath}`];
    if (noFrozenLockfile) wtSetupArgs.push('NOFROZEN=1');
    log.push(
      '',
      `$ make wt-setup WT=...${noFrozenLockfile ? ' NOFROZEN=1' : ''}`,
    );
    const setupOutput = await runMake(wtSetupArgs, repoRoot, 300_000);
    log.push(setupOutput);
    log.push('Worktree setup complete.');

    // Step 2: Optionally remove symlink and install independent deps
    if (removeSymlink) {
      const nmPath = join(worktreePath, 'node_modules');

      if (isSymlink(nmPath)) {
        log.push('', 'Removing node_modules symlink...');

        // rmSync with recursive: false removes the symlink itself
        // without following it or deleting the target directory contents.
        rmSync(nmPath, { recursive: false });
        symlinkActuallyRemoved = true;
        log.push('Symlink removed.');

        if (noFrozenLockfile) {
          log.push(
            '',
            '$ pnpm install --no-frozen-lockfile (no frozen lockfile requested)',
          );
          const installOut = await runCommand(
            'pnpm',
            ['install', '--no-frozen-lockfile'],
            worktreePath,
            300_000,
          );
          log.push(installOut);
          log.push('', '$ make install (Poetry sync + hooks)');
          const makeInstallOut = await runMake(
            ['install'],
            worktreePath,
            300_000,
          );
          log.push(makeInstallOut);
        } else {
          log.push('', '$ make install (independent node_modules)');
          const installOutput = await runMake(
            ['install'],
            worktreePath,
            300_000,
          );
          log.push(installOutput);
        }
        log.push('Independent node_modules installed.');
      } else if (existsSync(nmPath)) {
        log.push(
          '',
          'node_modules exists but is not a symlink — skipping symlink removal.',
        );
      } else {
        log.push('', 'No node_modules found — running install...');
        if (noFrozenLockfile) {
          log.push(
            '',
            '$ pnpm install --no-frozen-lockfile (no frozen lockfile requested)',
          );
          const installOut = await runCommand(
            'pnpm',
            ['install', '--no-frozen-lockfile'],
            worktreePath,
            300_000,
          );
          log.push(installOut);
          log.push('', '$ make install (Poetry sync + hooks)');
          const makeInstallOut = await runMake(
            ['install'],
            worktreePath,
            300_000,
          );
          log.push(makeInstallOut);
        } else {
          const installOutput = await runMake(
            ['install'],
            worktreePath,
            300_000,
          );
          log.push(installOutput);
        }
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              worktreePath,
              symlinkRemoved: symlinkActuallyRemoved,
              log: log.join('\n'),
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    log.push(
      '',
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: false,
              worktreePath,
              log: log.join('\n'),
            },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }
}
