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
 *   [...] INFO: ⬆️ Applying migration: 20260319_120000_add_league_phase.ts  (NEW)
 *   [...] INFO: ✅ Applied: 20260319_120000_add_league_phase.ts             (NEW)
 *   [...] INFO: ⏭️ Already applied: 20260319_120000_add_league_phase.ts     (SKIPPED)
 *   [...] INFO: 📋 No new migrations to apply
 *   [...] INFO: ✅ Applied N new migrations
 *
 * `applied`/`appliedNames` MUST reflect only migrations newly applied this run.
 * The runner is journal-based and logs `⏭️ Already applied: <file>` for every
 * file it skips; a naive `/applied:\s*<file>/i` matches those skip lines too
 * (the substring "applied: <file>"), inflating the count to the entire journal
 * size. That actively misled an RCA — a no-op run reported `applied: 236`
 * (LS-8008). The negative lookbehind excludes the `Already applied:` skip lines
 * while still matching the `✅ Applied:` / `⬆️ Applying migration:` new ones.
 */
export function parseUpOutput(output: string): MigrateResult {
  const appliedNames: string[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    // Match the newly-applied lines only:
    //   "✅ Applied: <migration>"  /  "⬆️ Applying migration: <migration>"
    // but NOT the skipped line "⏭️ Already applied: <migration>".
    // Legacy whitespace-separated formats kept as a fallback, likewise guarded.
    const migrationMatch =
      /(?:Applying migration|(?<!Already )Applied):\s*(\d{8}_\d{6}_\S+)/i.exec(
        line,
      ) ||
      /(?:applying|(?<!already )applied|running)\s+(\d{8}_\d{6}_\S+)/i.exec(
        line,
      );
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
