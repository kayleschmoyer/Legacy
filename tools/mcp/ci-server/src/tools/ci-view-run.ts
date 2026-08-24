import { viewRun } from './view-run.js';
import { viewRunBatch } from './view-run-batch.js';
import type { ToolResult } from '../types.js';

interface CiViewRunParams {
  runId?: number;
  runIds?: number[];
  attempt?: number;
  includeJobs?: boolean;
  format?: 'markdown' | 'json';
}

function paramError(text: string): ToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

/**
 * Consolidated entry point absorbing ci_view_run_batch (runIds) — LS-9714.
 * attempt is meaningless across heterogeneous runs (per the former
 * ci_view_run_batch's own doc comment) so it is rejected in batch mode rather
 * than silently ignored.
 */
export async function ciViewRun(params: CiViewRunParams): Promise<ToolResult> {
  const { runId, runIds, attempt, includeJobs, format } = params;

  if ((runId === undefined) === (runIds === undefined)) {
    return paramError('Exactly one of runId or runIds is required.');
  }

  if (runIds !== undefined) {
    if (attempt !== undefined) {
      return paramError(
        'attempt is meaningless across heterogeneous runs; not supported with runIds.',
      );
    }
    return viewRunBatch({ runIds, includeJobs });
  }

  return viewRun({ runId: runId as number, attempt, includeJobs, format });
}
