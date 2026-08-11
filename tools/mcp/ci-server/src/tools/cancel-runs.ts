import { cancelRun } from './cancel-run.js';
import { resolveWorkflowId } from './list-runs.js';
import { assembleBatchResult, runBatch } from '../batch.js';
import { githubGet } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface CancelRunsParams {
  workflow: string;
  branch: string;
}

interface GitHubWorkflowRun {
  id: number;
  status: string;
}

interface GitHubRunsResponse {
  total_count: number;
  workflow_runs: GitHubWorkflowRun[];
}

/**
 * Cancel every in-flight (non-completed) run of a workflow on a branch — e.g.
 * killing a stale-SHA dispatch before starting a fresh one on the same branch
 * (LS-7878). Resolves `workflow` the same way ci_list_runs does, lists runs
 * for that workflow+branch, filters to runs GitHub hasn't finished yet, and
 * cancels each independently via the same logic as ci_cancel_run — one run's
 * cancel failing (e.g. it completed between the list and the cancel call)
 * does not fail the whole call.
 */
export async function cancelRuns(
  params: CancelRunsParams,
): Promise<ToolResult> {
  let workflowId: string;
  try {
    workflowId = await resolveWorkflowId(params.workflow);
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to resolve workflow "${params.workflow}": ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }

  let runIds: number[];
  try {
    const data = await githubGet<GitHubRunsResponse>(
      `/actions/workflows/${encodeURIComponent(workflowId)}/runs`,
      { branch: params.branch, per_page: '100' },
    );
    runIds = data.workflow_runs
      .filter((run) => run.status !== 'completed')
      .map((run) => run.id);
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to list runs for workflow "${params.workflow}" on branch "${params.branch}": ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }

  if (runIds.length === 0) {
    return assembleBatchResult(0, [], [], {
      message: `No in-flight runs found for workflow "${params.workflow}" on branch "${params.branch}".`,
    });
  }

  return runBatch(runIds, (runId) => cancelRun({ runId }));
}
