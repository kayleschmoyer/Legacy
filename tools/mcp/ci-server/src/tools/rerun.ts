import { githubPost } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface RerunParams {
  runId: number;
  failedOnly?: boolean;
  jobId?: number;
  debug?: boolean;
}

export async function rerun(params: RerunParams): Promise<ToolResult> {
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
    if (params.jobId) {
      // Rerun a specific job
      await githubPost(`/actions/jobs/${params.jobId}/rerun`);
    } else if (params.failedOnly !== false) {
      // Rerun only failed jobs
      await githubPost(
        `/actions/runs/${params.runId}/rerun-failed-jobs`,
        params.debug ? { enable_debug_logging: true } : undefined,
      );
    } else {
      // Rerun entire run
      await githubPost(
        `/actions/runs/${params.runId}/rerun`,
        params.debug ? { enable_debug_logging: true } : undefined,
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              runId: params.runId,
              jobId: params.jobId ?? null,
              scope: params.jobId
                ? 'job'
                : params.failedOnly === false
                  ? 'run'
                  : 'failed-jobs',
              debug: params.debug ?? false,
              message: 'Rerun requested successfully.',
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
          text: `Failed to rerun workflow run ${params.runId}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
