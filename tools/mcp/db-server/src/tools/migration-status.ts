import { resolve } from 'node:path';
import { getRepoRoot, runPnpm } from '../run-command.js';
import type { ToolResult } from '../types.js';

interface MigrationStatusParams {
  worktreePath?: string;
}

interface MigrationInfo {
  applied: number;
  pending: number;
  pendingNames: string[];
  needsMigration: boolean;
}

/** Parse the output of `pnpm run db:status` into structured data. */
function parseStatusOutput(output: string): MigrationInfo {
  const appliedMatch = /(\d+)\s+applied/i.exec(output);
  const pendingMatch = /(\d+)\s+pending/i.exec(output);

  const applied = appliedMatch ? parseInt(appliedMatch[1], 10) : 0;
  const pending = pendingMatch ? parseInt(pendingMatch[1], 10) : 0;

  // Extract pending migration names (lines that look like migration filenames)
  const pendingNames: string[] = [];
  const lines = output.split('\n');
  let inPending = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/pending/i.test(trimmed)) {
      inPending = true;
      continue;
    }
    if (inPending && /^\d{8}_\d{6}_/.test(trimmed)) {
      pendingNames.push(trimmed);
    }
  }

  return {
    applied,
    pending,
    pendingNames,
    needsMigration: pending > 0,
  };
}

export async function migrationStatus(
  params: MigrationStatusParams,
): Promise<ToolResult> {
  const repoRoot = params.worktreePath || getRepoRoot();
  const dbClientDir = resolve(repoRoot, 'lib', 'db-client');

  try {
    const output = await runPnpm(['run', 'db:status'], dbClientDir);
    const info = parseStatusOutput(output);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(info, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to check migration status: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
