import { LOGGER } from '@legacy-sports/logging';
import { getMigrationSql } from './db.js';
import { errorMessage } from './types.js';
import { finishJob, heartbeatJob, loadJob } from './jobs.js';
import {
  applyMigrationBatch,
  type MigrationPayloadItem,
} from './tools/migrate.js';

/**
 * Async `db_migrate` worker (LS-8563). Runs in the SAME Lambda as the MCP
 * server — `lambda.ts` routes async self-invokes (`{ dbMigrateJobId }`) here
 * instead of the API Gateway path — but with the function's full ~900s timeout
 * available, since no HTTP gateway sits in front of an async invoke.
 *
 * The payload was validated at submit time, so the worker's job is only:
 * load the row → apply the batch through `applyMigrationBatch` (the exact
 * LS-8118/LS-8254 code path) → write the terminal result. Every code path
 * writes a terminal state; if the process dies anyway (OOM, hard timeout),
 * the submit path's stale reaper converts the row to `failed` once the
 * heartbeat exceeds the stale cutoff, so a job can never stay `running`
 * forever (AC2).
 */
export async function runDbMigrateWorker(jobId: string): Promise<void> {
  let sql;
  try {
    sql = await getMigrationSql();
  } catch (error) {
    // Nothing to write the failure to — the stale reaper will fail the row.
    LOGGER.error(
      `[db_migrate:worker] job=${jobId}: database unavailable: ${errorMessage(error)}`,
    );
    return;
  }

  const job = await loadJob(sql, jobId);
  if (!job) {
    LOGGER.error(`[db_migrate:worker] job=${jobId}: no such job row`);
    return;
  }
  if (job.status !== 'running') {
    // Duplicate delivery (async invokes are at-least-once) — the terminal
    // result is already written; never re-apply. A retry after a hard worker
    // timeout, by contrast, still finds the row `running` and re-runs the
    // batch — that is the intended resume: hash-recorded-on-success skip logic
    // (LS-8254) makes re-application a no-op for completed migrations.
    LOGGER.info(
      `[db_migrate:worker] job=${jobId}: already ${job.status}, skipping`,
    );
    return;
  }

  try {
    const payload = JSON.parse(job.payload) as {
      migrations: MigrationPayloadItem[];
    };
    const result = await applyMigrationBatch(
      sql,
      payload.migrations,
      job.principal,
      () => heartbeatJob(sql, jobId),
    );
    await finishJob(
      sql,
      jobId,
      result.success ? 'done' : 'failed',
      JSON.stringify(result),
    );
    LOGGER.info(
      `[db_migrate:worker] job=${jobId} (${job.principal}): terminal status=${result.success ? 'done' : 'failed'}`,
    );
  } catch (error) {
    // Unexpected infrastructure error (payload parse, connection drop, ...).
    // Per-migration failures are handled inside applyMigrationBatch; anything
    // reaching here did not partially report, so record the raw error.
    const message = errorMessage(error);
    LOGGER.error(
      `[db_migrate:worker] job=${jobId} (${job.principal}): ${message}`,
    );
    await finishJob(
      sql,
      jobId,
      'failed',
      JSON.stringify({
        applied: 0,
        appliedNames: [],
        skipped: [],
        success: false,
        error: message,
      }),
    );
  }
}
