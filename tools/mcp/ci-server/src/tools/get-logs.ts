import { fetchRunLogsRing } from '../logs.js';
import type { ToolResult } from '../types.js';

interface GetLogsParams {
  runId: number;
  jobId?: number;
  failedOnly?: boolean;
  attempt?: number;
  maxLines?: number;
  errorSummary?: boolean;
}

/**
 * Error patterns to match when extracting error summaries from CI logs.
 * Each line matching any pattern is included, along with surrounding context.
 */
const ERROR_PATTERNS =
  /(?:error\b|FAIL|failed|✗|ERR!|error TS\d|Cannot find|Module not found|ENOENT|exit code [1-9]|Failed tasks)/i;

/** Nx "Failed tasks" summary section marker. */
const NX_FAILED_SECTION = /^[\s>]*Failed tasks/i;

function extractErrorSummary(allLines: string[]): string[] {
  const result: string[] = [];
  const contextLines = 2;
  let inNxFailedSection = false;

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];

    // Capture the full "Failed tasks" section from Nx output
    if (NX_FAILED_SECTION.test(line)) {
      inNxFailedSection = true;
    }
    if (inNxFailedSection) {
      result.push(line);
      // End on empty line or end of output
      if (inNxFailedSection && i > 0 && !line.trim()) {
        inNxFailedSection = false;
      }
      continue;
    }

    if (
      ERROR_PATTERNS.test(line) &&
      !/node_modules/.test(line) &&
      !/^\s*at\s/.test(line)
    ) {
      // Add context before
      for (let j = Math.max(0, i - contextLines); j < i; j++) {
        const ctx = allLines[j];
        if (!result.includes(ctx)) result.push(ctx);
      }
      result.push(line);
      // Add context after
      for (
        let j = i + 1;
        j <= Math.min(allLines.length - 1, i + contextLines);
        j++
      ) {
        result.push(allLines[j]);
      }
    }
  }

  // Deduplicate while preserving order, then cap at ~200 lines
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const line of result) {
    if (!seen.has(line)) {
      seen.add(line);
      deduped.push(line);
    }
  }
  return deduped.slice(0, 200);
}

export async function getLogs(params: GetLogsParams): Promise<ToolResult> {
  const defaultLimit = params.errorSummary ? 10_000 : 500;
  const maxLines = params.maxLines ?? defaultLimit;

  try {
    const streamLimit = maxLines > 0 ? maxLines : 10_000;
    const { lines, totalLines } = await fetchRunLogsRing(
      {
        runId: params.runId,
        jobId: params.jobId,
        failedOnly: params.failedOnly,
        attempt: params.attempt,
      },
      streamLimit,
    );

    // When errorSummary is requested, filter to only error lines + context
    if (params.errorSummary) {
      const summary = extractErrorSummary(lines);
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
                errorSummary: true,
                totalLogLines: totalLines,
                errorLines: summary.length,
                logs: summary.join('\n'),
              },
              null,
              2,
            ),
          },
        ],
      };
    }

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
