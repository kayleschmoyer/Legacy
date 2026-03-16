import { streamGhLogs } from '../gh.js';
import { buildLogArgs } from '../logs.js';
import type { ToolResult } from '../types.js';

interface GetLogsParams {
  runId: number;
  jobId?: number;
  failedOnly?: boolean;
  attempt?: number;
  maxLines?: number;
}

export async function getLogs(params: GetLogsParams): Promise<ToolResult> {
  const args = buildLogArgs(params);
  const maxLines = params.maxLines ?? 0;

  try {
    // Always stream so we never buffer more than maxLines (or the default cap)
    // into memory — avoids maxBuffer errors on large workflow runs.
    const streamLimit = maxLines > 0 ? maxLines : 10_000;
    const { lines, totalLines } = await streamGhLogs(args, streamLimit);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              runId: params.runId,
              jobId: params.jobId ?? null,
              failedOnly: params.failedOnly !== false,
              attempt: params.attempt ?? null,
              truncated: lines.length < totalLines,
              totalLines,
              returnedLines: lines.length,
              logs: lines.join('\n'),
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
          text: `Failed to fetch logs for workflow run ${params.runId}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
