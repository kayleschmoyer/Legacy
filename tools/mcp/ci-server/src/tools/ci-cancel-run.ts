import { cancelRun } from './cancel-run.js';
import { cancelRuns } from './cancel-runs.js';
import type { ToolResult } from '../types.js';

interface CiCancelRunParams {
  runId?: number;
  workflow?: string;
  branch?: string;
}

function paramError(text: string): ToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

/**
 * Consolidated entry point absorbing ci_cancel_runs — LS-9714. Not a
 * scalar/array widening of the same selector: single-run mode takes runId,
 * bulk mode takes a workflow+branch selector (GitHub has no bulk-cancel-by-id
 * endpoint, so ci_cancel_runs always resolved a selector to run IDs
 * internally). Dispatches to the unchanged single-purpose implementations.
 */
export async function ciCancelRun(
  params: CiCancelRunParams,
): Promise<ToolResult> {
  const { runId, workflow, branch } = params;
  const hasRunId = runId !== undefined;
  const hasSelector = workflow !== undefined || branch !== undefined;

  if (hasRunId && hasSelector) {
    return paramError('Pass either runId, or workflow+branch — not both.');
  }
  if (!hasRunId && !hasSelector) {
    return paramError(
      'Pass runId (single run), or workflow+branch (bulk cancel).',
    );
  }
  if (hasSelector && (workflow === undefined || branch === undefined)) {
    return paramError('Bulk cancel requires both workflow and branch.');
  }

  if (hasRunId) return cancelRun({ runId });
  return cancelRuns({
    workflow: workflow as string,
    branch: branch as string,
  });
}
