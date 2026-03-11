import { resolve } from 'node:path';
import { getRepoRoot, runPnpm } from '../run-command.js';
import type { ToolResult } from '../types.js';

interface MigrateParams {
  worktreePath?: string;
}

interface MigrateResult {
  applied: number;
  appliedNames: string[];
  success: boolean;
}

/** Parse the output of `pnpm run db:up` into structured data. */
function parseUpOutput(output: string): MigrateResult {
  const appliedNames: string[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // Match lines that reference migration filenames being applied
    const migrationMatch =
      /(?:applying|applied|running)\s+(\d{8}_\d{6}_\S+)/i.exec(trimmed);
    if (migrationMatch) {
      appliedNames.push(migrationMatch[1]);
    }
  }

  // Check for "no new migrations" or "up to date" messages
  const noMigrations =
    /no (?:new )?migrations|up.to.date|nothing to apply/i.test(output);

  return {
    applied: appliedNames.length,
    appliedNames,
    success: true,
  };
}

export async function migrate(params: MigrateParams): Promise<ToolResult> {
  const repoRoot = params.worktreePath || getRepoRoot();
  const dbClientDir = resolve(repoRoot, 'lib', 'db-client');

  // First check if there are pending migrations
  try {
    const statusOutput = await runPnpm(['run', 'db:status'], dbClientDir);
    const noPending = /0\s+pending|no (?:new )?migrations|up.to.date/i.test(
      statusOutput,
    );

    if (noPending) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                applied: 0,
                appliedNames: [],
                success: true,
                message: 'No pending migrations to apply.',
              },
              null,
              2,
            ),
          },
        ],
      };
    }
  } catch {
    // If status check fails, still attempt the migration
  }

  try {
    const output = await runPnpm(['run', 'db:up'], dbClientDir);
    const result = parseUpOutput(output);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to apply migrations: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
