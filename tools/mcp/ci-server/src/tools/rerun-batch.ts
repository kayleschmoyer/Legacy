import { runBatch } from '../batch.js';
import { rerun } from './rerun.js';
import type { ToolResult } from '../types.js';

interface RerunBatchParams {
  runIds: number[];
  failedOnly?: boolean;
  debug?: boolean;
}

/**
 * Batch variant of ci_rerun: rerun several runs in one call (e.g. re-validating
 * multiple PRs after a shared root-cause fix). Each run is rerun independently —
 * one run erroring does not fail the whole call. Returns the standard
 * partial-failure shape { success, total, succeeded, failed }.
 */
export async function rerunBatch(
  params: RerunBatchParams,
): Promise<ToolResult> {
  return runBatch(params.runIds, (runId) =>
    rerun({ runId, failedOnly: params.failedOnly, debug: params.debug }),
  );
}
