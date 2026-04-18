import { resolve } from 'node:path';
import { getRepoRoot, runTsx } from '../run-command.js';
import type { ToolResult } from '../types.js';

interface MigrateParams {
  worktreePath?: string;
}

interface MigrateResult {
  applied: number;
  appliedNames: string[];
  success: boolean;
}

/**
 * Parse the output of `pnpm run db:up` into structured data.
 *
 * The rollback-migrations.ts script outputs (via LOGGER with timestamp prefix):
 *   [...] INFO: ⬆️ Applying migration: 20260319_120000_add_league_phase.ts
 *   [...] INFO: ✅ Applied: 20260319_120000_add_league_phase.ts
 *   [...] INFO: 📋 No new migrations to apply
 *   [...] INFO: ✅ Applied N new migrations
 */
export function parseUpOutput(output: string): MigrateResult {
  const appliedNames: string[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    // Match "Applied: <migration>" or "Applying migration: <migration>"
    // Also keep legacy format "applied/applying <migration>" as fallback
    const migrationMatch =
      /(?:Applied|Applying migration):\s*(\d{8}_\d{6}_\S+)/i.exec(line) ||
      /(?:applying|applied|running)\s+(\d{8}_\d{6}_\S+)/i.exec(line);
    if (migrationMatch) {
      const name = migrationMatch[1];
      // Deduplicate: "Applying migration:" and "Applied:" fire for the same file
      if (!appliedNames.includes(name)) {
        appliedNames.push(name);
      }
    }
  }

  return {
    applied: appliedNames.length,
    appliedNames,
    success: true,
  };
}

export async function migrate(params: MigrateParams): Promise<ToolResult> {
  const repoRoot = params.worktreePath || getRepoRoot();
  const dbClientDir = resolve(repoRoot, 'lib', 'db-client');
  const rollbackScript = resolve(
    dbClientDir,
    'src',
    'scripts',
    'rollback-migrations.ts',
  );

  // First check if there are pending migrations
  try {
    const statusOutput = await runTsx(rollbackScript, ['status'], dbClientDir);
    // Check if there are no pending migrations:
    // - No "Pending:" lines with migration filenames
    // - Or explicit "No new migrations" / "up to date" messages
    const hasPendingFiles = /Pending:\s*\d{8}_\d{6}_/i.test(statusOutput);
    // Use a single broad regex instead of re-implementing count parsing
    // from migration-status.ts (which is the canonical parser).
    const noPending =
      !hasPendingFiles &&
      /no (?:new )?migrations|up.to.date|nothing to apply/i.test(statusOutput);

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
    const output = await runTsx(rollbackScript, ['up'], dbClientDir);
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
