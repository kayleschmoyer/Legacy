import { fetchRunLogsRing, stripAnsiCodes } from '../logs.js';
import { formatBatchLogPayload, formatLogPayload } from '../format.js';
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
 * GitHub Actions' own failure annotation (LS-8772), rendered from a step's
 * `::error::...` workflow command or auto-emitted when a `run:` step exits
 * non-zero. This is the single most reliable anchor for "the failing step" —
 * unlike the generic ERROR_PATTERNS scan, it cannot false-positive on script
 * source, branch names, or unrelated job chatter, because GitHub only emits
 * it for the step GitHub itself considers failed.
 */
const GITHUB_ERROR_ANNOTATION = /^##\[error\]/;

export function isGithubErrorAnnotationLine(line: string): boolean {
  return GITHUB_ERROR_ANNOTATION.test(stripAnsiCodes(line));
}

/**
 * Start/end markers for a GitHub Actions `##[group]Run ...` block. These
 * blocks echo the step's *script source* (the YAML `run:` block content,
 * verbatim) followed by `shell:`/`env:` scaffolding — never runtime output.
 * A script that merely contains the word "error"/"failed" in a string
 * literal (e.g. `echo "❌ pnpm-lock.yaml not found"`) matches ERROR_PATTERNS
 * even though it never executed, crowding real failures out of the 200-line
 * cap (LS-8772). Lines inside this block are excluded from the generic
 * ERROR_PATTERNS scan entirely.
 */
const GROUP_RUN_START = /^##\[group\]Run\b/;
const GROUP_END = /^##\[endgroup\]/;

/**
 * `git fetch`'s own ref-update output, e.g.
 * `   * [new branch]      LS-1001-fix-join-league-error-logging -> origin/...`
 * or `   a1b2c3d..e4f5g6h  main -> origin/main`. Branch names routinely
 * contain words like "error" or "failed" (e.g. a ticket about fixing error
 * logging), which matches ERROR_PATTERNS' generic `\berror\b`/`failed` scan
 * even though this is checkout scaffolding, not job output (LS-8772).
 */
const GIT_FETCH_NOISE =
  /^\s*(?:\*\s*\[new (?:branch|tag)\]|[0-9a-f]{7,40}\.\.[0-9a-f]{7,40})\s+\S+\s+->\s+\S+/;

/**
 * GitHub Actions prints each shell command before running it as an ANSI-colored
 * line (e.g. \x1b[36;1mecho "::error::..."\x1b[0m). These command-echo lines
 * are not runtime output — they are script templates. Matching them as errors
 * causes the errorSummary to fill up with duplicate script noise instead of
 * actual failures.
 */
// Built from String.fromCharCode rather than a \x1b regex literal: a literal
// ESC control character trips no-control-regex even though it is the exact,
// intentional byte GitHub Actions emits for these escape sequences.
const ESC = String.fromCharCode(27);
const ANSI_ESCAPE_PREFIX = new RegExp(`^${ESC}\\[`);

/**
 * Jest's own failure markers (LS-8391). errorSummary's generic ERROR_PATTERNS
 * treats these the same as console.error noise (React prop warnings,
 * intentional error-path test fixtures), so a busy suite can crowd the real
 * `FAIL <file>` / `Tests: N failed` lines out of the 200-line cap. These are
 * matched against the ANSI-stripped line — jest colors "FAIL" and "✕" — and
 * given priority so they always survive extraction. See isJestFailureLine.
 */
const JEST_FAILURE_PATTERNS = [
  /(?:^|\s)FAIL(?:\s|$)/, // suite failure header, e.g. "FAIL src/foo.spec.ts"
  /Test Suites:.*failed/i,
  /Tests:.*failed/i,
  /(?:^|\s)✕(?:\s|$)/, // individual failing test marker
];

export function isJestFailureLine(line: string): boolean {
  const stripped = stripAnsiCodes(line);
  return JEST_FAILURE_PATTERNS.some((pattern) => pattern.test(stripped));
}

/**
 * Playwright's own failure markers (LS-8405). The E2E job runs Playwright
 * inside a composite-action bash script whose own status/echo lines (e.g.
 * "⚠️ Playwright browser installation failed", "❌ Critical E2E tests
 * failed", "::error::...") also match the generic ERROR_PATTERNS scan and
 * can crowd the real per-test failure output (spec file, TimeoutError,
 * failed assertion) out of the 200-line cap. Matched against the
 * ANSI-stripped line and given priority so they always survive extraction,
 * same mechanism as isJestFailureLine.
 */
const PLAYWRIGHT_FAILURE_PATTERNS = [
  /✘/, // Playwright list-reporter failing test marker
  /TimeoutError:/,
  /Error: expect\(/,
  /Error Context:/,
  /(?:^|\s)\d+ failed\b/, // end-of-run summary line, e.g. "  1 failed"
];

export function isPlaywrightFailureLine(line: string): boolean {
  const stripped = stripAnsiCodes(line);
  return PLAYWRIGHT_FAILURE_PATTERNS.some((pattern) => pattern.test(stripped));
}

/** Priority matcher combining Jest (LS-8391) and Playwright (LS-8405) failure markers. */
export function isTestFailureLine(line: string): boolean {
  return isJestFailureLine(line) || isPlaywrightFailureLine(line);
}

/**
 * Priority matcher combining framework-specific failure markers with
 * GitHub's own `##[error]` annotation (LS-8772). Passed to
 * `fetchRunLogsRing` so these lines always survive the 200-line cap,
 * regardless of how much unrelated noise (script source, git scaffolding,
 * other jobs' chatter) also matches the generic ERROR_PATTERNS scan.
 */
export function isPriorityFailureLine(line: string): boolean {
  return isTestFailureLine(line) || isGithubErrorAnnotationLine(line);
}

function extractErrorSummary(
  allLines: string[],
  priorityLines: string[] = [],
): string[] {
  const result: string[] = [];
  const contextLines = 2;
  let inNxFailedSection = false;
  let inGroupRunBlock = false;

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

    // Track `##[group]Run ...` / `##[endgroup]` blocks — these echo a
    // step's script source verbatim, never runtime output (LS-8772).
    if (GROUP_RUN_START.test(line)) {
      inGroupRunBlock = true;
    }
    if (GROUP_END.test(line)) {
      inGroupRunBlock = false;
      continue;
    }
    if (inGroupRunBlock) {
      continue;
    }

    if (
      ERROR_PATTERNS.test(line) &&
      !ANSI_ESCAPE_PREFIX.test(line) &&
      !/node_modules/.test(line) &&
      !/^\s*at\s/.test(line) &&
      !GIT_FETCH_NOISE.test(line)
    ) {
      // Add context before — never git-fetch noise, even as context (LS-8772)
      for (let j = Math.max(0, i - contextLines); j < i; j++) {
        const ctx = allLines[j];
        if (GIT_FETCH_NOISE.test(ctx)) continue;
        if (!result.includes(ctx)) result.push(ctx);
      }
      result.push(line);
      // Add context after — same exclusion
      for (
        let j = i + 1;
        j <= Math.min(allLines.length - 1, i + contextLines);
        j++
      ) {
        const ctx = allLines[j];
        if (GIT_FETCH_NOISE.test(ctx)) continue;
        result.push(ctx);
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

  // Jest's own failure markers (LS-8391) go first and are guaranteed to
  // survive the cap, even when the generic-pattern matches above would
  // otherwise fill the whole 200-line budget with console.error noise.
  const prioritySeen = new Set(priorityLines);
  const rest = deduped.filter((line) => !prioritySeen.has(line));
  return [...priorityLines, ...rest].slice(0, 200);
}

/** Default hard cap on total output characters to prevent context overflow. */
const DEFAULT_MAX_CHARS = 50_000;

/** Maximum number of runs accepted in a single batch call. */
const MAX_BATCH_RUNS = 10;

/** Maximum number of concurrent run-log fetches in batch mode. */
const BATCH_CONCURRENCY = 3;

function applyHardCharCap(text: string, maxChars: number): string {
  if (text.length > maxChars) {
    return text.slice(0, maxChars) + `\n... [truncated at ${maxChars} chars]`;
  }
  return text;
}

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

/** A run's log result split into scalar metadata and the raw log text. */
interface RunPayload {
  meta: Record<string, unknown>;
  logs: string;
}

/**
 * Build the per-run log payload (metadata + raw log text), shared between
 * singular and batch modes so the per-run output shape stays identical. The
 * log text is kept separate from the metadata object — see
 * `formatLogPayload` (LS-8504) for why it must never be JSON.stringify'd
 * together with the log content.
 */
async function buildRunPayload(
  runId: number | undefined,
  params: GetLogsParams,
  signal?: AbortSignal,
): Promise<RunPayload> {
  const defaultLimit = params.errorSummary ? 10_000 : 500;
  const maxLines = params.maxLines ?? defaultLimit;
  const maxChars = params.maxChars ?? DEFAULT_MAX_CHARS;
  const streamLimit = maxLines > 0 ? maxLines : 10_000;

  const { lines, totalLines, skippedJobs, priorityLines } =
    await fetchRunLogsRing(
      {
        runId,
        jobId: params.jobId,
        failedOnly: params.failedOnly,
        attempt: params.attempt,
        jobName: params.jobName,
        signal,
      },
      streamLimit,
      params.errorSummary ? isPriorityFailureLine : undefined,
    );

  const base = {
    runId: runId ?? null,
    jobId: params.jobId ?? null,
    jobName: params.jobName ?? null,
    failedOnly: params.failedOnly !== false,
    attempt: params.attempt ?? null,
  };

  if (params.errorSummary) {
    const summary = extractErrorSummary(lines, priorityLines);
    // Strip ANSI escape sequences (LS-9557) after line selection — the
    // selection heuristics above (##[group] blocks, command-echo detection
    // via ANSI_ESCAPE_PREFIX) rely on the raw escape codes — but before the
    // char-based caps below, so truncateLineLength/maxChars budget real
    // content instead of escape bytes.
    const strippedSummary = summary.map(stripAnsiCodes);
    const { processedLines, charTruncated } = applyCharLimits(
      strippedSummary,
      params.truncateLineLength,
      maxChars,
    );
    return {
      meta: {
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
      },
      logs: processedLines.join('\n'),
    };
  }

  // Strip ANSI escape sequences (LS-9557) after the ring-buffer's maxLines
  // selection but before the char-based caps below.
  const strippedLines = lines.map(stripAnsiCodes);
  const { processedLines, charTruncated } = applyCharLimits(
    strippedLines,
    params.truncateLineLength,
    maxChars,
  );

  return {
    meta: {
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
    },
    logs: processedLines.join('\n'),
  };
}

/** Run an async mapper over items with a fixed concurrency. */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
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

    const runs: Array<{
      runId: number;
      meta: Record<string, unknown>;
      logs: string;
    }> = [];
    const missing: Array<{ runId: number; reason: string }> = [];

    type Outcome =
      | { runId: number; payload: RunPayload }
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
        runs.push({
          runId: outcome.runId,
          meta: outcome.payload.meta,
          logs: outcome.payload.logs,
        });
      } else {
        missing.push({ runId: outcome.runId, reason: outcome.error });
      }
    }

    const maxChars = params.maxChars ?? DEFAULT_MAX_CHARS;
    const batchText = applyHardCharCap(
      formatBatchLogPayload(missing, runs),
      maxChars,
    );
    return {
      content: [
        {
          type: 'text',
          text: batchText,
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

  // Singular path — metadata header + raw log text (LS-8504), not wrapped in
  // a logs/missing object, so existing single-run callers keep working.
  try {
    const signal = AbortSignal.timeout(LOG_FETCH_TIMEOUT_MS);
    const payload = await buildRunPayload(params.runId, params, signal);
    const maxChars = params.maxChars ?? DEFAULT_MAX_CHARS;
    const text = applyHardCharCap(
      formatLogPayload(payload.meta, payload.logs),
      maxChars,
    );
    return { content: [{ type: 'text', text }] };
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
