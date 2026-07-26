import { githubGet, githubPost } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface CancelRunParams {
  runId: number;
}

interface GitHubWorkflowRun {
  id: number;
  status: string;
  conclusion: string | null;
}

/**
 * Cancel a single in-flight GitHub Actions run. Mirrors workflowSetState's
 * act-then-reGET pattern: the cancel endpoint returns 202 Accepted with an
 * effectively empty body and the run does not transition to `cancelled`
 * synchronously (it passes through `cancel_in_progress` first), so the actual
 * resulting status is only knowable via a follow-up GET.
 */
export async function cancelRun(params: CancelRunParams): Promise<ToolResult> {
  if (
    !Number.isFinite(params.runId) ||
    !Number.isInteger(params.runId) ||
    params.runId <= 0
  ) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text:
            `runId must be a positive integer; received ${params.runId}. ` +
            `Use the "id" field from ci_list_runs output ("databaseId" is an alias for the same value).`,
        },
      ],
    };
  }

  try {
    await githubPost(`/actions/runs/${params.runId}/cancel`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const is409 = msg.includes('GitHub API 409');
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: is409
            ? `Cannot cancel run ${params.runId}: it has already completed (HTTP 409 from GitHub).`
            : `Failed to cancel workflow run ${params.runId}: ${msg}`,
        },
      ],
    };
  }

  try {
    const after = await githubGet<GitHubWorkflowRun>(
      `/actions/runs/${params.runId}`,
    );
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              runId: params.runId,
              status: after.status,
              conclusion: after.conclusion,
              message: 'Cancellation requested.',
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text:
            `Cancellation was requested for run ${params.runId}, but re-fetching its status failed: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
