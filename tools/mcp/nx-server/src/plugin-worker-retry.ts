import type { JobSnapshot, StartJobOptions } from './jobs.js';
import { runJobWithBudget } from './jobs.js';
import { isPluginWorkerTimeoutFailure } from './plugin-worker-failure.js';

export interface PluginWorkerRetryResult {
  snapshot: JobSnapshot;
  /** True once a retry with NX_ISOLATE_PLUGINS=false was attempted, pass or fail. */
  pluginWorkerRetried: boolean;
}

/**
 * Runs a job via `runJobWithBudget`; if it fails with the isolated
 * Nx-plugin-worker IPC handshake timeout signature (LS-9282), retries once
 * with `NX_ISOLATE_PLUGINS=false` merged into the child env before giving up.
 * Only a genuinely terminal `failed` snapshot matching the signature triggers
 * a retry — a `running`/`orphaned` snapshot (still in flight, or outlived by
 * a dead server process) is returned as-is, since there is nothing terminal
 * yet to retry.
 */
export async function runJobWithPluginWorkerRetry(
  opts: StartJobOptions,
  syncBudgetMs: number,
): Promise<PluginWorkerRetryResult> {
  const snapshot = await runJobWithBudget(opts, syncBudgetMs);
  if (
    snapshot.status !== 'failed' ||
    !isPluginWorkerTimeoutFailure(snapshot.log ?? '')
  ) {
    return { snapshot, pluginWorkerRetried: false };
  }

  const retrySnapshot = await runJobWithBudget(
    {
      ...opts,
      idempotencyKey: opts.idempotencyKey
        ? `${opts.idempotencyKey}:isolate-retry`
        : undefined,
      env: { ...opts.env, NX_ISOLATE_PLUGINS: 'false' },
    },
    syncBudgetMs,
  );
  return { snapshot: retrySnapshot, pluginWorkerRetried: true };
}
