import { runGh } from '../gh.js';
import type { ToolResult } from '../types.js';

interface RerunParams {
  runId: number;
  failedOnly?: boolean;
  jobId?: number;
  debug?: boolean;
}

export async function rerun(params: RerunParams): Promise<ToolResult> {
  const args = ['run', 'rerun', String(params.runId)];

  if (params.jobId) {
    args.push('--job', String(params.jobId));
  } else if (params.failedOnly !== false) {
    args.push('--failed');
  }

  if (params.debug) {
    args.push('--debug');
  }

  try {
    const output = await runGh(args);
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
              message: output || 'Rerun requested successfully.',
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
