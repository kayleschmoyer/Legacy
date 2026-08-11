import type postgres from 'postgres';
import { LOGGER } from '@legacy-sports/logging';
import { randomUUID } from 'node:crypto';

/**
 * Job-row persistence for the async `db_migrate` worker (LS-8563).
 *
 * `db_migrate` cannot apply migrations synchronously — the hosted Lambda sits
 * behind the HTTP API Gateway (~29s ceiling) while heavy DDL can run for
 * minutes — so the submit path persists the full validated payload to a job row
 * and fires an async self-invoke carrying only `{ dbMigrateJobId }` (the 2MB
 * payload cap exceeds Lambda's 256KB async-invoke cap, so the payload rides in
 * the row). The worker loads the row, applies the batch, and writes the
 * terminal result back; `db_migration_status` polls the row over the read-only
 * connection.
 *
 * The table is created on demand via `CREATE TABLE IF NOT EXISTS`, mirroring
 * `getAppliedHashes` in `tools/migrate.ts` — this avoids a migration
 * chicken-and-egg (the job table must exist before any migration can run
 * through it). A partial unique index allows at most ONE `running` row, which
 * is what makes "a second db_migrate call joins the running job" (AC4)
 * race-safe: concurrent inserts conflict and the loser joins the winner.
 */

/** Persisted job states. `orphaned` is derived at read time, never stored. */
export type DbMigrateJobStatus = 'running' | 'done' | 'failed';

/** Job status as reported to pollers — adds the derived `orphaned` state. */
export type DbMigrateJobReportedStatus = DbMigrateJobStatus | 'orphaned';

export interface DbMigrateJobRow {
  id: string;
  principal: string;
  /** JSON array of submitted migration filenames, in apply order. */
  migration_names: string;
  /** JSON `{ migrations: MigrationPayloadItem[] }` — the full validated payload. */
  payload: string;
  status: DbMigrateJobStatus;
  /** JSON `MigrateResult` — written once, on the terminal transition. */
  result: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * A `running` row whose `updated_at` heartbeat is older than this is treated
 * as dead (worker crashed / timed out without a terminal write). The worker
 * heartbeats between migrations, and a single statement is bounded by the
 * migration connection's `statement_timeout` (just below the worker Lambda
 * timeout), so any legitimate heartbeat gap is under the Lambda timeout —
 * default: 900s worker ceiling + 60s buffer.
 */
export function jobStaleMs(): number {
  const parsed = parseInt(process.env['DB_MIGRATE_JOB_STALE_MS'] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 960_000;
}

/** True when a `running` row's heartbeat is older than the stale cutoff. */
export function isJobStale(
  row: Pick<DbMigrateJobRow, 'status' | 'updated_at'>,
): boolean {
  return (
    row.status === 'running' &&
    Date.now() - new Date(row.updated_at).getTime() > jobStaleMs()
  );
}

/**
 * Ensure the job table (and its single-running-job guard) exists, and grant
 * `mcp_readonly` SELECT so `db_migration_status` can poll over the read-only
 * connection. The grant is guarded on role existence so environments without
 * the role (e.g. a fresh local Postgres) still work.
 */
export async function ensureJobsTable(sql: postgres.Sql): Promise<void> {
  await sql.unsafe('CREATE SCHEMA IF NOT EXISTS drizzle;');
  await sql.unsafe(
    `CREATE TABLE IF NOT EXISTS drizzle.__db_migrate_jobs (
       id TEXT PRIMARY KEY,
       principal TEXT NOT NULL,
       migration_names TEXT NOT NULL,
       payload TEXT NOT NULL,
       status TEXT NOT NULL DEFAULT 'running',
       result TEXT,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
     );`,
  );
  // At most one running job — concurrent submits conflict here and join.
  await sql.unsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS __db_migrate_jobs_single_running
       ON drizzle.__db_migrate_jobs ((true)) WHERE status = 'running';`,
  );
  await sql.unsafe(
    `DO $$
     BEGIN
       IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'mcp_readonly') THEN
         GRANT USAGE ON SCHEMA drizzle TO mcp_readonly;
         GRANT SELECT ON drizzle.__db_migrate_jobs TO mcp_readonly;
       END IF;
     END
     $$;`,
  );
}

/**
 * Fail any `running` row whose heartbeat is past the stale cutoff, so a dead
 * worker can never block new submissions forever (AC2). Returns the ids that
 * were reaped (normally zero or one, given the single-running guard).
 */
export async function reapStaleJobs(sql: postgres.Sql): Promise<string[]> {
  const staleResult = JSON.stringify({
    applied: 0,
    appliedNames: [],
    skipped: [],
    success: false,
    error:
      'Worker died without writing a terminal result (heartbeat exceeded the stale cutoff). ' +
      'Already-applied migrations were recorded on success and will be skipped on re-submit.',
  });
  const rows = await sql<{ id: string }[]>`
    UPDATE drizzle.__db_migrate_jobs
       SET status = 'failed',
           result = ${staleResult},
           updated_at = now()
     WHERE status = 'running'
       AND updated_at < now() - (${jobStaleMs()} * interval '1 millisecond')
     RETURNING id
  `;
  const ids = rows.map((r) => r.id);
  for (const id of ids) {
    LOGGER.warn(`[db_migrate] reaped stale job=${id} (no heartbeat)`);
  }
  return ids;
}

/** The currently-running job's id, or null when none is running. */
export async function findRunningJob(
  sql: postgres.Sql,
): Promise<string | null> {
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM drizzle.__db_migrate_jobs WHERE status = 'running' LIMIT 1
  `;
  return rows[0]?.id ?? null;
}

/**
 * Insert a new `running` job row. Returns the new job id, or null when a
 * concurrent submit won the single-running-index race (caller should join the
 * existing job via `findRunningJob`).
 */
export async function insertJob(
  sql: postgres.Sql,
  job: { principal: string; migrationNames: string[]; payload: string },
): Promise<string | null> {
  const id = randomUUID();
  const rows = await sql<{ id: string }[]>`
    INSERT INTO drizzle.__db_migrate_jobs (id, principal, migration_names, payload, status)
    VALUES (${id}, ${job.principal}, ${JSON.stringify(job.migrationNames)}, ${job.payload}, 'running')
    ON CONFLICT DO NOTHING
    RETURNING id
  `;
  return rows[0]?.id ?? null;
}

/** Load a job row by id (any status), or null when it does not exist. */
export async function loadJob(
  sql: postgres.Sql,
  jobId: string,
): Promise<DbMigrateJobRow | null> {
  const rows = await sql<DbMigrateJobRow[]>`
    SELECT id, principal, migration_names, payload, status, result, created_at, updated_at
      FROM drizzle.__db_migrate_jobs
     WHERE id = ${jobId}
  `;
  return rows[0] ?? null;
}

/** Bump the heartbeat so pollers can tell the worker is still alive (AC2). */
export async function heartbeatJob(
  sql: postgres.Sql,
  jobId: string,
): Promise<void> {
  await sql`
    UPDATE drizzle.__db_migrate_jobs SET updated_at = now() WHERE id = ${jobId}
  `;
}

/** Write the terminal state + result. Guarded to only transition `running` rows. */
export async function finishJob(
  sql: postgres.Sql,
  jobId: string,
  status: Exclude<DbMigrateJobStatus, 'running'>,
  result: string,
): Promise<void> {
  await sql`
    UPDATE drizzle.__db_migrate_jobs
       SET status = ${status}, result = ${result}, updated_at = now()
     WHERE id = ${jobId} AND status = 'running'
  `;
}
