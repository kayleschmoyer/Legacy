import { getReadonlySql } from '../db.js';
import { errorMessage, jsonResult, type ToolResult } from '../types.js';
import {
  type DbMigrateJobReportedStatus,
  type DbMigrateJobRow,
  isJobStale,
} from '../jobs.js';

interface MigrationStatusParams {
  localMigrationNames?: string[];
  jobId?: string;
}

/**
 * Report applied vs pending migrations on the dev database — or, when `jobId`
 * is passed, the state of an async `db_migrate` job (LS-8563).
 *
 * Applied migrations are keyed by filename in `drizzle.__drizzle_migrations`
 * (see `lib/db-client/src/scripts/rollback-migrations.ts`). A hosted Lambda
 * has no view of the local migrations directory, so the client passes the
 * local migration filenames and the server computes the pending diff.
 *
 * Job polling runs over the same read-only `mcp_readonly` connection — the
 * submit path grants it SELECT on `drizzle.__db_migrate_jobs` when it creates
 * the table. On a finished job the response carries the exact result shape
 * `db_migrate` returned in its synchronous era (`applied`, `appliedNames`,
 * `skipped`, `success`, `failed?`, `error?`), plus job metadata. A `running`
 * job whose heartbeat exceeded the stale cutoff is reported as `orphaned` so
 * pollers can detect a dead worker.
 */
export async function migrationStatus(
  params: MigrationStatusParams,
): Promise<ToolResult> {
  const localNames = params.localMigrationNames ?? [];

  let sql;
  try {
    sql = await getReadonlySql();
  } catch (error) {
    return jsonResult({
      available: false,
      reason: `Database unavailable: ${errorMessage(error)}`,
      applied: null,
      pending: null,
      pendingNames: [],
      needsMigration: null,
    });
  }

  if (params.jobId) {
    return jobStatus(sql, params.jobId);
  }

  try {
    const rows = await sql<{ hash: string }[]>`
      SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at ASC
    `;
    const appliedNames = rows.map((r) => r.hash);
    const appliedSet = new Set(appliedNames);
    const pendingNames = localNames.filter((name) => !appliedSet.has(name));

    return jsonResult({
      available: true,
      reason: null,
      applied: appliedNames.length,
      pending: pendingNames.length,
      pendingNames,
      needsMigration: pendingNames.length > 0,
    });
  } catch (error) {
    return jsonResult({
      available: false,
      reason: `Failed to read migration status: ${errorMessage(error)}`,
      applied: null,
      pending: null,
      pendingNames: [],
      needsMigration: null,
    });
  }
}

async function jobStatus(
  sql: Awaited<ReturnType<typeof getReadonlySql>>,
  jobId: string,
): Promise<ToolResult> {
  try {
    const rows = await sql<DbMigrateJobRow[]>`
      SELECT id, principal, migration_names, payload, status, result, created_at, updated_at
        FROM drizzle.__db_migrate_jobs
       WHERE id = ${jobId}
    `;
    const row = rows[0];
    if (!row) {
      return jsonResult(
        { jobId, found: false, error: `No db_migrate job '${jobId}'.` },
        true,
      );
    }

    // A running row whose heartbeat exceeded the stale cutoff means the worker
    // died without a terminal write — report it as orphaned (the next
    // db_migrate submit reaps it to failed).
    const status: DbMigrateJobReportedStatus = isJobStale(row)
      ? 'orphaned'
      : row.status;
    const terminal = status !== 'running';

    const result =
      terminal && row.result
        ? (JSON.parse(row.result) as Record<string, unknown>)
        : null;

    return jsonResult({
      jobId,
      found: true,
      status,
      terminal,
      migrationNames: JSON.parse(row.migration_names) as string[],
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      // On a finished job, spread the exact shape db_migrate used to return
      // synchronously: applied, appliedNames, skipped, success, failed?, error?.
      ...(result ?? {}),
      ...(status === 'orphaned' && !result
        ? {
            success: false,
            error:
              'Worker heartbeat exceeded the stale cutoff — the worker died ' +
              'without writing a terminal result. Re-submit db_migrate: ' +
              'already-applied migrations are skipped.',
          }
        : {}),
    });
  } catch (error) {
    return jsonResult(
      {
        jobId,
        found: false,
        error: `Failed to read job status: ${errorMessage(error)}`,
      },
      true,
    );
  }
}
