import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { getRepoRoot, runCommand } from '../run-command.js';
import type { ToolResult } from '../types.js';

interface RestoreDevSeedParams {
  worktreePath?: string;
  confirmDestructive: boolean;
  runMigrationsAfter?: boolean;
}

interface RestoreDevSeedResult {
  success: boolean;
  migrationsRun: boolean;
  output: string;
}

const RESTORE_TIMEOUT_MS = 20 * 60_000;
const MIGRATE_TIMEOUT_MS = 10 * 60_000;

export async function restoreDevSeed(
  params: RestoreDevSeedParams,
): Promise<ToolResult> {
  if (!params.confirmDestructive) {
    return {
      content: [
        {
          type: 'text',
          text: 'Refusing to restore dev seed. This operation drops and recreates the local database. Re-run with confirmDestructive=true to proceed.',
        },
      ],
      isError: true,
    };
  }

  const repoRoot = params.worktreePath || getRepoRoot();
  const scriptPath = resolve(repoRoot, 'scripts', 'db-restore-dev.ps1');

  try {
    // Detect available PowerShell executable (pwsh preferred, powershell fallback)
    let psExe = 'pwsh';
    try {
      execFileSync('pwsh', ['-Version'], {
        timeout: 5_000,
        stdio: 'ignore',
        windowsHide: true,
      });
    } catch {
      psExe = 'powershell';
    }

    const restoreOutput = await runCommand(
      psExe,
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      repoRoot,
      RESTORE_TIMEOUT_MS,
    );

    let migrationsOutput = '';
    const runMigrationsAfter = params.runMigrationsAfter ?? true;
    if (runMigrationsAfter) {
      migrationsOutput = await runCommand(
        'make',
        ['db-migrate'],
        repoRoot,
        MIGRATE_TIMEOUT_MS,
      );
    }

    const result: RestoreDevSeedResult = {
      success: true,
      migrationsRun: runMigrationsAfter,
      output: migrationsOutput
        ? `${restoreOutput}\n\n=== make db-migrate ===\n${migrationsOutput}`
        : restoreOutput,
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to restore dev seed: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
