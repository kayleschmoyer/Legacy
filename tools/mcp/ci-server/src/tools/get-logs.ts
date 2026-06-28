import { fetchRunLogsRing } from '../logs.js';
import type { ToolResult } from '../types.js';

interface GetLogsParams {
  runId?: number;
  runIds?: number[];
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

/** Maximum number of runs accepted in a single batch call. */
const MAX_BATCH_RUNS = 10;

/** Maximum number of concurrent run-log fetches in batch mode. */
const BATCH_CONCURRENCY = 3;

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

/** Deadline for a single ci_get_logs call — leaves ~5 s buffer before Lambda 30 s timeout. */
const LOG_FETCH_TIMEOUT_MS = 20_000;

/**
 * Build the per-run log payload (the same JSON object the singular path
 * returns inline). Shared between singular and batch modes so the per-run
 * output shape stays identical.
 */
async function buildRunPayload(
  runId: number | undefined,
  params: GetLogsParams,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const defaultLimit = params.errorSummary ? 10_000 : 500;
  const maxLines = params.maxLines ?? defaultLimit;
  const maxChars = params.maxChars ?? DEFAULT_MAX_CHARS;
  const streamLimit = maxLines > 0 ? maxLines : 10_000;

  const { lines, totalLines, skippedJobs } = await fetchRunLogsRing(
    {
      runId,
      jobId: params.jobId,
      failedOnly: params.failedOnly,
      attempt: params.attempt,
      jobName: params.jobName,
      signal,
    },
    streamLimit,
  );

  const base = {
    runId: runId ?? null,
    jobId: params.jobId ?? null,
    jobName: params.jobName ?? null,
    failedOnly: params.failedOnly !== false,
    attempt: params.attempt ?? null,
  };

  if (params.errorSummary) {
    const summary = extractErrorSummary(lines);
    const { processedLines, charTruncated } = applyCharLimits(
      summary,
      params.truncateLineLength,
      maxChars,
    );
    return {
      ...base,
      errorSummary: true,
      totalLogLines: totalLines,
      errorLines: summary.length,
      charTruncated,
      ...(skippedJobs
        ? {
            skippedJobs,
            hint: `${skippedJobs} job(s) omitted — use jobName or jobId to fetch specific job logs`,
          }
        : {}),
      logs: processedLines.join('\n'),
    };
  }

  const { processedLines, charTruncated } = applyCharLimits(
    lines,
    params.truncateLineLength,
    maxChars,
  );

  return {
    ...base,
    truncated: lines.length < totalLines || charTruncated,
    charTruncated,
    totalLines,
    returnedLines: processedLines.length,
    ...(skippedJobs
      ? {
          skippedJobs,
          hint: `${skippedJobs} job(s) omitted — use jobName or jobId to fetch specific job logs`,
        }
      : {}),
    logs: processedLines.join('\n'),
  };
}

/** Run an async mapper over items with a fixed concurrency. */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await mapper(items[i], i);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

export async function getLogs(params: GetLogsParams): Promise<ToolResult> {
  const hasRunIds = Array.isArray(params.runIds) && params.runIds.length > 0;

  if (hasRunIds) {
    if (params.jobId !== undefined) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'runIds cannot be combined with jobId; pass jobId only with a single runId.',
          },
        ],
      };
    }
    const runIds = params.runIds as number[];
    if (runIds.length > MAX_BATCH_RUNS) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `runIds accepts at most ${MAX_BATCH_RUNS} ids per call (received ${runIds.length}).`,
          },
        ],
      };
    }

    const logs: Record<string, Record<string, unknown>> = {};
    const missing: Array<{ runId: number; reason: string }> = [];

    type Outcome =
      | { runId: number; payload: Record<string, unknown> }
      | { runId: number; error: string };

    const batchSignal = AbortSignal.timeout(LOG_FETCH_TIMEOUT_MS);
    const outcomes = await mapWithConcurrency<number, Outcome>(
      runIds,
      BATCH_CONCURRENCY,
      async (runId) => {
        try {
          const payload = await buildRunPayload(runId, params, batchSignal);
          return { runId, payload };
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          return { runId, error: reason };
        }
      },
    );

    for (const outcome of outcomes) {
      if ('payload' in outcome) {
        logs[String(outcome.runId)] = outcome.payload;
      } else {
        missing.push({ runId: outcome.runId, reason: outcome.error });
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ logs, missing }, null, 2),
        },
      ],
    };
  }

  if (!params.runId && !params.jobId) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'Either runId, runIds, or jobId is required.',
        },
      ],
    };
  }

  // Singular path — preserve existing response shape (top-level fields, not
  // wrapped in logs/missing) so existing callers keep working.
  try {
    const signal = AbortSignal.timeout(LOG_FETCH_TIMEOUT_MS);
    const payload = await buildRunPayload(params.runId, params, signal);
    return {
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    };
  } catch (error) {
    const isTimeout =
      error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError');
    const base = params.jobId
      ? `job ${params.jobId}`
      : `workflow run ${params.runId}`;
    const detail = isTimeout
      ? `timed out after ${LOG_FETCH_TIMEOUT_MS / 1000}s — the run may have many or large jobs. Retry with jobName or jobId to narrow scope.`
      : error instanceof Error
        ? error.message
        : String(error);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to fetch logs for ${base}: ${detail}`,
        },
      ],
    };
  }
}
