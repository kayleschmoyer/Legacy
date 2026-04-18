import { fetchRunLogsRing } from '../logs.js';
import type { ToolResult } from '../types.js';

interface GetLogsParams {
  runId?: number;
  jobId?: number;
  failedOnly?: boolean;
  attempt?: number;
  maxLines?: number;
  maxChars?: number;
  truncateLineLength?: number;
  errorSummary?: boolean;
  jobName?: string;
}

/**
 * Error patterns to match when extracting error summaries from CI logs.
 * Each line matching any pattern is included, along with surrounding context.
 */
const ERROR_PATTERNS =
  /(?:error\b|FAIL|failed|✗|ERR!|error TS\d|Cannot find|Module not found|ENOENT|exit code [1-9]|Failed tasks)/i;

/** Nx "Failed tasks" summary section marker. */
const NX_FAILED_SECTION = /^[\s>]*Failed tasks/i;

/**
 * GitHub Actions prints each shell command before running it as an ANSI-colored
 * line (e.g. \x1b[36;1mecho "::error::..."\x1b[0m). These command-echo lines
 * are not runtime output — they are script templates. Matching them as errors
 * causes the errorSummary to fill up with duplicate script noise instead of
 * actual failures.
 */
const ANSI_ESCAPE_PREFIX = /^\x1b\[/;

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
      !ANSI_ESCAPE_PREFIX.test(line) &&
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

/** Default hard cap on total output characters to prevent context overflow. */
const DEFAULT_MAX_CHARS = 50_000;

/**
 * Applies per-line and total-character limits to a set of log lines.
 * Returns the processed lines and whether any truncation occurred.
 */
function applyCharLimits(
  lines: string[],
  truncateLineLength: number | undefined,
  maxChars: number,
): { processedLines: string[]; charTruncated: boolean } {
  let charTruncated = false;
  let budget = maxChars;
  const processedLines: string[] = [];

  for (const rawLine of lines) {
    const line =
      truncateLineLength !== undefined && rawLine.length > truncateLineLength
        ? `${rawLine.slice(0, truncateLineLength)}...[line truncated]`
        : rawLine;

    if (budget <= 0) {
      charTruncated = true;
      break;
    }

    if (line.length > budget) {
      processedLines.push(`${line.slice(0, budget)}...[output truncated]`);
      charTruncated = true;
      budget = 0;
    } else {
      processedLines.push(line);
      budget -= line.length + 1; // +1 for the newline separator
    }
  }

  return { processedLines, charTruncated };
}

export async function getLogs(params: GetLogsParams): Promise<ToolResult> {
  if (!params.runId && !params.jobId) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Either runId or jobId is required.' }],
    };
  }

  const defaultLimit = params.errorSummary ? 10_000 : 500;
  const maxLines = params.maxLines ?? defaultLimit;
  const maxChars = params.maxChars ?? DEFAULT_MAX_CHARS;

  try {
    const streamLimit = maxLines > 0 ? maxLines : 10_000;
    const { lines, totalLines } = await fetchRunLogsRing(
      {
        runId: params.runId,
        jobId: params.jobId,
        failedOnly: params.failedOnly,
        attempt: params.attempt,
        jobName: params.jobName,
      },
      streamLimit,
    );

    // When errorSummary is requested, filter to only error lines + context
    if (params.errorSummary) {
      const summary = extractErrorSummary(lines);
      const { processedLines, charTruncated } = applyCharLimits(
        summary,
        params.truncateLineLength,
        maxChars,
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                runId: params.runId,
                jobId: params.jobId ?? null,
                jobName: params.jobName ?? null,
                failedOnly: params.failedOnly !== false,
                attempt: params.attempt ?? null,
                errorSummary: true,
                totalLogLines: totalLines,
                errorLines: summary.length,
                charTruncated,
                logs: processedLines.join('\n'),
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    const { processedLines, charTruncated } = applyCharLimits(
      lines,
      params.truncateLineLength,
      maxChars,
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              runId: params.runId,
              jobId: params.jobId ?? null,
              jobName: params.jobName ?? null,
              failedOnly: params.failedOnly !== false,
              attempt: params.attempt ?? null,
              truncated: lines.length < totalLines || charTruncated,
              charTruncated,
              totalLines,
              returnedLines: processedLines.length,
              logs: processedLines.join('\n'),
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
          text: `Failed to fetch logs for ${params.jobId ? `job ${params.jobId}` : `workflow run ${params.runId}`}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
