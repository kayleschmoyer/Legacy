import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getRepoRoot, runTsx } from '../run-command.js';
import type { ToolResult } from '../types.js';

interface MigrationStatusParams {
  worktreePath?: string;
  worktreePaths?: string[];
}

interface MigrationInfo {
  applied: number;
  pending: number;
  pendingNames: string[];
  needsMigration: boolean;
}

interface StatusEntry {
  available: boolean;
  reason: string | null;
  applied: number | null;
  pending: number | null;
  pendingNames: string[] | null;
  needsMigration: boolean | null;
}

interface MissingEntry {
  worktreePath: string;
  reason: string;
}

const BATCH_MIN = 1;
const BATCH_MAX = 25;
const BATCH_CONCURRENCY = 5;

/**
 * Parse the output of `pnpm run db:status` into structured data.
 *
 * The rollback-migrations.ts script outputs (via LOGGER with timestamp prefix):
 *   [...] INFO: 📁 Total migrations available: 138
 *   [...] INFO: 📊 Applied migrations: 137
 *   [...] INFO:   ✅ Applied: 20240101_000000_initial.ts
 *   [...] INFO:   ⏸️  Pending: 20260319_120000_add_league_phase.ts
 */
export function parseStatusOutput(output: string): MigrationInfo {
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

function classifyDbError(msg: string): string | null {
  const isSslError =
    /ssl|certificate|cert_path|self.signed|unable to verify/i.test(msg);
  const isConnectError =
    /econnrefused|enotfound|etimedout|timeout|connection.*refused|connect.*failed/i.test(
      msg,
    );
  if (isSslError) {
    return 'SSL certificate error — DB_CERT_PATH may be missing or invalid in this worktree. Run make wt-setup to symlink certs/ from the main repo.';
  }
  if (isConnectError) {
    return 'DB connection unavailable — the database is unreachable (timeout or ECONNREFUSED). Check network connectivity and DB_HOST in .env.';
  }
  return null;
}

/** Run the status script in one worktree and return a normalized entry. Throws only for unclassified fatal errors. */
async function getStatusForPath(worktreePath: string): Promise<StatusEntry> {
  const dbClientDir = resolve(worktreePath, 'lib', 'db-client');
  const rollbackScript = resolve(
    dbClientDir,
    'src',
    'scripts',
    'rollback-migrations.ts',
  );

  try {
    const output = await runTsx(rollbackScript, ['status'], dbClientDir);
    const info = parseStatusOutput(output);
    return { available: true, reason: null, ...info };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const reason = classifyDbError(msg);
    if (reason !== null) {
      return {
        available: false,
        reason,
        applied: null,
        pending: null,
        pendingNames: null,
        needsMigration: null,
      };
    }
    throw error instanceof Error ? error : new Error(msg);
  }
}

/** Run `worker` across `items` with a concurrency cap. Preserves input order in results. */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners: Array<Promise<void>> = [];
  const slots = Math.min(limit, items.length);
  for (let i = 0; i < slots; i++) {
    runners.push(
      (async () => {
        while (true) {
          const idx = cursor++;
          if (idx >= items.length) return;
          results[idx] = await worker(items[idx], idx);
        }
      })(),
    );
  }
  await Promise.all(runners);
  return results;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function runBatch(worktreePaths: string[]): Promise<ToolResult> {
  if (worktreePaths.length < BATCH_MIN || worktreePaths.length > BATCH_MAX) {
    return {
      content: [
        {
          type: 'text',
          text: `worktreePaths must contain between ${BATCH_MIN} and ${BATCH_MAX} entries (received ${worktreePaths.length})`,
        },
      ],
      isError: true,
    };
  }

  const status: Record<string, StatusEntry> = {};
  const missing: MissingEntry[] = [];

  await runWithConcurrency(worktreePaths, BATCH_CONCURRENCY, async (path) => {
    if (!(await pathExists(path))) {
      missing.push({ worktreePath: path, reason: 'Path does not exist' });
      return;
    }
    try {
      status[path] = await getStatusForPath(path);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      missing.push({ worktreePath: path, reason: msg });
    }
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ status, missing }, null, 2),
      },
    ],
  };
}

export async function migrationStatus(
  params: MigrationStatusParams,
): Promise<ToolResult> {
  if (params.worktreePaths !== undefined) {
    return runBatch(params.worktreePaths);
  }

  const repoRoot = params.worktreePath || getRepoRoot();
  try {
    const entry = await getStatusForPath(repoRoot);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(entry, null, 2),
        },
      ],
      isError: entry.available ? undefined : false,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
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
