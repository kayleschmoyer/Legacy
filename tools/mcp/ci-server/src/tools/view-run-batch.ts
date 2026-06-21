import { runBatch } from '../batch.js';
import { viewRun } from './view-run.js';
import type { ToolResult } from '../types.js';

interface ViewRunBatchParams {
  runIds: number[];
  includeJobs?: boolean;
}

/**
 * Batch variant of ci_view_run: inspect several runs in one call (e.g. checking
 * the status of CI across multiple PRs before merging). Each run is fetched
 * independently — one run erroring does not fail the whole call. Returns the
 * standard partial-failure shape { success, total, succeeded, failed }.
 *
 * `attempt` is intentionally omitted (it is meaningless across heterogeneous
 * runs); use the single-item ci_view_run when targeting a specific attempt.
 * `format: 'json'` is passed explicitly because the single-item ci_view_run
 * defaults to markdown (LS-8175) — the batch path needs structured per-run
 * payloads so runBatch can map each into the standard succeeded[] shape.
 */
export async function viewRunBatch(
  params: ViewRunBatchParams,
): Promise<ToolResult> {
  return runBatch(params.runIds, (runId) =>
    viewRun({ runId, includeJobs: params.includeJobs, format: 'json' }),
  );
}
