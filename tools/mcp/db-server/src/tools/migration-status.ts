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

/**
 * Parse the output of `pnpm run db:status` into structured data.
 *
 * The rollback-migrations.ts script outputs (via LOGGER with timestamp prefix):
 *   [...] INFO: 📁 Total migrations available: 138
 *   [...] INFO: 📊 Applied migrations: 137
 *   [...] INFO:   ✅ Applied: 20240101_000000_initial.ts
 *   [...] INFO:   ⏸️  Pending: 20260319_120000_add_league_phase.ts
 */
function parseStatusOutput(output: string): MigrationInfo {
  // Match "Applied migrations: N" or "N applied" (fallback for format changes)
  const appliedMatch =
    /applied migrations:\s*(\d+)/i.exec(output) ||
    /(\d+)\s+(?:migrations?\s+)?applied/i.exec(output);
  // Match "Total migrations available: N"
  const totalMatch =
    /total migrations available:\s*(\d+)/i.exec(output) ||
    /(\d+)\s+migration files/i.exec(output);

  const applied = appliedMatch ? parseInt(appliedMatch[1], 10) : 0;
  const total = totalMatch ? parseInt(totalMatch[1], 10) : 0;

  // Extract pending migration names from lines with "Pending:" prefix
  const pendingNames: string[] = [];
  const lines = output.split('\n');
  for (const line of lines) {
    const pendingFileMatch = /Pending:\s*(\d{8}_\d{6}_\S+)/i.exec(line);
    if (pendingFileMatch) {
      pendingNames.push(pendingFileMatch[1]);
    }
  }

  // Pending count: use extracted names count, or fall back to total - applied
  const pending =
    pendingNames.length > 0
      ? pendingNames.length
      : Math.max(0, total - applied);

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
          text: JSON.stringify(
            { available: true, reason: null, ...info },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);

    // Classify DB connection failures and return structured "unavailable" responses
    // so agents can distinguish "DB unreachable — skip/warn" from "migration failed — block".
    const isSslError =
      /ssl|certificate|cert_path|self.signed|unable to verify/i.test(msg);
    const isConnectError =
      /econnrefused|enotfound|etimedout|timeout|connection.*refused|connect.*failed/i.test(
        msg,
      );

    if (isSslError || isConnectError) {
      const reason = isSslError
        ? 'SSL certificate error — DB_CERT_PATH may be missing or invalid in this worktree. Run make wt-setup to junction certs/ from the main repo.'
        : 'DB connection unavailable — the database is unreachable (timeout or ECONNREFUSED). Check network connectivity and DB_HOST in .env.';

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                available: false,
                reason,
                applied: null,
                pending: null,
                needsMigration: null,
              },
              null,
              2,
            ),
          },
        ],
        isError: false,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `Failed to check migration status: ${msg}`,
        },
      ],
      isError: true,
    };
  }
}
