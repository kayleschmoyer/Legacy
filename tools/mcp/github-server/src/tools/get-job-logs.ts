import { LOGGER } from '@legacy-sports/logging/server';
import { inflateRawSync } from 'node:zlib';

import { getRepoOwnerName } from '../auth.js';
import { githubGetArrayBuffer, githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

export interface GetJobLogsParams {
  jobId?: number;
  runId?: number;
  failedOnly?: boolean;
  conclusions?: string[];
  jobNameContains?: string;
  listOnly?: boolean;
  limit?: number;
  offset?: number;
  tailLines?: number;
  maxChars?: number;
  errorSummary?: boolean;
  truncateLineLength?: number;
  grepPattern?: string;
  failedStepOnly?: boolean;
}

/** Default hard cap on output characters to prevent context window overflow. */
const DEFAULT_MAX_CHARS = 10_000;

/**
 * Friendly message for a job whose log archive GitHub hasn't finished
 * uploading yet. The check-run conclusion is delivered by webhook before the
 * log blob is durably available, so a log fetch immediately after
 * completion routinely 404s even for a perfectly valid job_id (LS-10158).
 */
const LOGS_NOT_YET_AVAILABLE_MESSAGE =
  'Job logs are not yet available -- GitHub has not finished uploading them. ' +
  'This is normal within ~1-2 minutes of job completion; retry shortly.';

/**
 * True for the raw Azure Blob Storage 404 GitHub's log-blob endpoint returns
 * when a job's log archive hasn't finished uploading yet -- distinct from the
 * JSON 404 GitHub returns for an unknown job_id, which never mentions
 * BlobNotFound (LS-10158). Without this check the caller sees the raw
 * storage-provider XML body and reads it as a hard failure / bad job_id
 * rather than "too early, retry".
 */
function isBlobNotFoundError(err: unknown): boolean {
  return (
    err instanceof Error &&
    /failed \(404\)/.test(err.message) &&
    /<Code>BlobNotFound<\/Code>/.test(err.message)
  );
}

/** Default number of tail lines when tail_lines is not specified. */
const DEFAULT_TAIL_LINES = 200;

interface GitHubJobStep {
  name: string;
  conclusion: string | null;
  number: number;
}

interface GitHubJob {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  /**
   * Present on both the "list jobs for a workflow run" and "get a job for a
   * workflow run" REST responses. Used (LS-9644) to scope a job's log down
   * to the step GitHub itself marked as failing, instead of blindly tailing
   * the whole concatenated log — a plain tail can land entirely inside an
   * unrelated later step (e.g. a cleanup step) and never reach the failing
   * step's own output.
   */
  steps?: GitHubJobStep[];
}

/** Minimal per-job projection returned by `list_only` mode (LS-10144) —
 * id/name/status/conclusion/timestamps only, no log bytes, so a full sharded
 * run's job list fits well under the tool-result token cap. */
interface JobSummary {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

function toJobSummary(job: GitHubJob): JobSummary {
  return {
    id: job.id,
    name: job.name,
    status: job.status,
    conclusion: job.conclusion,
    startedAt: job.started_at ?? null,
    completedAt: job.completed_at ?? null,
  };
}

/** Default page size for `list_only` mode's limit/offset pagination. */
const DEFAULT_LIST_LIMIT = 100;

interface GitHubJobsResponse {
  total_count: number;
  jobs: GitHubJob[];
}

/** Maximum uncompressed size per ZIP entry (50 MB) to prevent resource exhaustion. */
const MAX_UNCOMPRESSED_ENTRY_BYTES = 50 * 1024 * 1024;

/** One entry (a step's raw output) extracted from a job's log ZIP archive. */
interface ZipEntry {
  name: string;
  text: string;
}

/**
 * Extract every entry (name + decompressed text) from a ZIP archive buffer.
 * Uses Node built-in zlib to decompress individual deflated entries.
 * Skips entries whose declared uncompressed size exceeds MAX_UNCOMPRESSED_ENTRY_BYTES.
 * GitHub Actions names each entry `<step-number>_<step-name>.txt`, which
 * `scopeEntriesToFailingSteps` relies on to slice a job's log down to only
 * the step that failed (mirrors the ci-server LS-9556 pattern).
 */
function extractZipEntries(buffer: ArrayBuffer): ZipEntry[] {
  const data = Buffer.from(buffer);
  const entries: ZipEntry[] = [];
  let offset = 0;

  while (offset + 30 <= data.length) {
    if (data.readUInt32LE(offset) !== 0x04034b50) break;

    const compressionMethod = data.readUInt16LE(offset + 8);
    const compressedSize = data.readUInt32LE(offset + 18);
    const uncompressedSize = data.readUInt32LE(offset + 22);
    const fileNameLength = data.readUInt16LE(offset + 26);
    const extraFieldLength = data.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + fileNameLength;
    if (nameEnd > data.length) break;
    const name = data.subarray(nameStart, nameEnd).toString('utf-8');
    const dataOffset = nameEnd + extraFieldLength;

    if (compressedSize > 0 && dataOffset + compressedSize <= data.length) {
      if (uncompressedSize > MAX_UNCOMPRESSED_ENTRY_BYTES) {
        LOGGER.error(
          `[get-job-logs] skipping ZIP entry: uncompressed size ${uncompressedSize} exceeds ${MAX_UNCOMPRESSED_ENTRY_BYTES} byte limit`,
          new Error('ZIP entry exceeds uncompressed size limit'),
        );
      } else {
        const compressed = data.subarray(
          dataOffset,
          dataOffset + compressedSize,
        );
        try {
          if (compressionMethod === 8) {
            entries.push({
              name,
              text: inflateRawSync(compressed).toString('utf-8'),
            });
          } else if (compressionMethod === 0) {
            entries.push({ name, text: compressed.toString('utf-8') });
          }
        } catch (err) {
          LOGGER.error(
            '[get-job-logs] failed to decompress ZIP entry',
            err instanceof Error ? err : new Error(String(err)),
          );
        }
      }
    }

    offset = dataOffset + compressedSize;
  }

  return entries;
}

/** Parse the leading `<n>_` step-number prefix from a ZIP entry name (e.g.
 * "3_Lint.txt" -> 3). Returns null when the name doesn't follow this
 * convention (defensive — callers fall back to no step-scoping). */
function stepNumberFromEntryName(name: string): number | null {
  const match = /^(\d+)_/.exec(name);
  return match ? Number(match[1]) : null;
}

/**
 * Scope a job's log entries down to only the step(s) GitHub marked
 * `conclusion: "failure"` (LS-9644, mirroring the ci-server LS-9556 fix).
 * Returns null when step data is unavailable, no step failed, or no ZIP
 * entry could be matched to a failing step number — callers fall back to
 * the whole job log in that case.
 */
function scopeEntriesToFailingSteps(
  entries: ZipEntry[],
  steps: GitHubJobStep[] | undefined,
): { text: string; stepNames: string[] } | null {
  if (!steps || steps.length === 0) return null;
  const failingSteps = steps.filter((s) => s.conclusion === 'failure');
  if (failingSteps.length === 0) return null;

  const failingNumbers = new Set(failingSteps.map((s) => s.number));
  const matched = entries.filter((e) => {
    const n = stepNumberFromEntryName(e.name);
    return n !== null && failingNumbers.has(n);
  });
  if (matched.length === 0) return null;

  return {
    text: matched.map((e) => e.text).join('\n'),
    stepNames: failingSteps.map((s) => s.name),
  };
}

/**
 * Fetch the raw log content for a single GitHub Actions job, split into its
 * per-step ZIP entries when the archive is a ZIP. `entries` is null for the
 * (rare) plain-text log response, in which case no step-scoping is possible.
 */
async function fetchJobLogEntries(
  owner: string,
  repo: string,
  jobId: number,
): Promise<{ entries: ZipEntry[] | null; text: string }> {
  const buffer = await githubGetArrayBuffer(
    owner,
    repo,
    `/actions/jobs/${jobId}/logs`,
  );

  const header = new Uint8Array(buffer.slice(0, 4));
  if (
    header[0] === 0x50 &&
    header[1] === 0x4b &&
    header[2] === 0x03 &&
    header[3] === 0x04
  ) {
    const entries = extractZipEntries(buffer);
    return { entries, text: entries.map((e) => e.text).join('') };
  }

  return { entries: null, text: Buffer.from(buffer).toString('utf-8') };
}

/**
 * Fetch a single job's detail (including its `steps` array) directly by id.
 * Used on the job_id path (LS-9644) to get step-conclusion data for
 * scoping — a run_id-scoped fetch already has this from the jobs-list
 * response and skips this extra lookup entirely. Best-effort: callers
 * swallow failures and fall back to no step-scoping.
 */
async function fetchJobDetail(
  owner: string,
  repo: string,
  jobId: number,
): Promise<GitHubJob | undefined> {
  return githubRest<GitHubJob>({
    method: 'GET',
    path: `/repos/${owner}/${repo}/actions/jobs/${jobId}`,
  });
}

/** Marks the start of a GitHub Actions log-group, e.g. `##[group]Run npm test`. */
const LOG_GROUP_START = /##\[group\]/;
/** Marks the end of a GitHub Actions log-group. */
const LOG_GROUP_END = /##\[endgroup\]/;
/** Marks a line GitHub Actions itself flagged as an error annotation. */
const LOG_ERROR_MARKER = /##\[error\]/;

/**
 * Fallback scoping (LS-10107) for when structural step->ZIP-entry matching
 * fails to identify a span — e.g. a composite action collapses several
 * virtual steps into one ZIP entry, so the failing step's own entry still
 * contains mostly-unrelated output. Locates the failing span directly from
 * GitHub's own `##[group]`/`##[error]` annotations embedded in the raw log
 * text: from the nearest `##[group]` before the first `##[error]`, through
 * the nearest `##[endgroup]` after the last `##[error]` (or end of text).
 * Returns null when no `##[error]` marker is present at all.
 */
function scopeToErrorBoundary(text: string): string | null {
  const lines = text.split(/\r?\n/);
  const errorIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (LOG_ERROR_MARKER.test(lines[i])) errorIndices.push(i);
  }
  if (errorIndices.length === 0) return null;

  let start = 0;
  for (let i = errorIndices[0]; i >= 0; i--) {
    if (LOG_GROUP_START.test(lines[i])) {
      start = i;
      break;
    }
  }

  let end = lines.length - 1;
  for (let i = errorIndices[errorIndices.length - 1]; i < lines.length; i++) {
    if (LOG_GROUP_END.test(lines[i])) {
      end = i;
      break;
    }
  }

  return lines.slice(start, end + 1).join('\n');
}

/**
 * Fetch a job's log text, scoped to its failing step(s) when step data is
 * available and a ZIP entry matches (LS-9644). Falls back to the full job
 * log text (previous behaviour) whenever scoping isn't possible — e.g. a
 * plain-text log response, a job with no distinct failing step (cancelled
 * at the job level), or missing step data.
 *
 * When `failedStepOnly` is set, structural scoping failure is not the end of
 * the road (LS-10107): a `##[group]`/`##[error]` boundary scan is tried next,
 * and if that also can't locate a span, the response says so explicitly via
 * `stepScopeFailed` rather than silently returning the unscoped tail with
 * `scopedToFailingStep: false`.
 */
async function fetchScopedJobLog(
  owner: string,
  repo: string,
  jobId: number,
  knownSteps?: GitHubJobStep[],
  failedStepOnly?: boolean,
): Promise<{
  text: string;
  scopedToFailingStep: boolean;
  stepNames: string[];
  stepScopeFailed: boolean;
}> {
  const { entries, text } = await fetchJobLogEntries(owner, repo, jobId);
  if (!entries) {
    if (failedStepOnly) {
      const errorScoped = scopeToErrorBoundary(text);
      if (errorScoped) {
        return {
          text: errorScoped,
          scopedToFailingStep: true,
          stepNames: [],
          stepScopeFailed: false,
        };
      }
    }
    return {
      text,
      scopedToFailingStep: false,
      stepNames: [],
      stepScopeFailed: Boolean(failedStepOnly),
    };
  }

  let steps = knownSteps;
  if (!steps) {
    try {
      const detail = await fetchJobDetail(owner, repo, jobId);
      steps = detail?.steps;
    } catch (err) {
      LOGGER.warn(
        `[get-job-logs] failed to fetch job detail for step-scoping, falling back to whole log (job ${jobId})`,
        err instanceof Error ? err : new Error(String(err)),
      );
      steps = undefined;
    }
  }

  const scoped = scopeEntriesToFailingSteps(entries, steps);
  if (scoped) {
    return {
      text: scoped.text,
      scopedToFailingStep: true,
      stepNames: scoped.stepNames,
      stepScopeFailed: false,
    };
  }

  if (failedStepOnly) {
    const errorScoped = scopeToErrorBoundary(text);
    if (errorScoped) {
      return {
        text: errorScoped,
        scopedToFailingStep: true,
        stepNames: [],
        stepScopeFailed: false,
      };
    }
  }

  return {
    text,
    scopedToFailingStep: false,
    stepNames: [],
    stepScopeFailed: Boolean(failedStepOnly),
  };
}

/**
 * Fetch every job for a run, unfiltered. Handles pagination (GitHub returns
 * ≤100 per page) — a sharded run's ~24+ jobs need at most one extra page.
 */
async function fetchAllJobs(
  owner: string,
  repo: string,
  runId: number,
): Promise<GitHubJob[]> {
  const allJobs: GitHubJob[] = [];
  let page = 1;

  for (;;) {
    const data = await githubRest<GitHubJobsResponse>({
      method: 'GET',
      path: `/repos/${owner}/${repo}/actions/runs/${runId}/jobs`,
      query: { per_page: '100', page: String(page) },
    });
    allJobs.push(...data.jobs);
    if (data.jobs.length < 100 || allJobs.length >= data.total_count) break;
    page++;
  }

  return allJobs;
}

export interface JobFilterOptions {
  failedOnly: boolean;
  /**
   * REST job conclusions (lowercase, e.g. "cancelled", "failure",
   * "timed_out") to keep. Supersedes `failedOnly` when non-empty (LS-10144)
   * — this is the only way to reach a specific non-success conclusion such
   * as `cancelled` without also pulling in every other non-success job.
   */
  conclusions?: string[];
  /** Case-insensitive substring match against job.name. */
  nameContains?: string;
}

/**
 * Apply conclusion/name filters to a job list (LS-10144). `conclusions`
 * (when given) replaces the `failedOnly` conclusion check entirely rather
 * than narrowing it further, since a caller who explicitly asks for
 * `["cancelled"]` wants exactly that, not "cancelled AND not-success".
 */
function filterJobs(
  jobs: GitHubJob[],
  { failedOnly, conclusions, nameContains }: JobFilterOptions,
): GitHubJob[] {
  let filtered = jobs;

  if (conclusions && conclusions.length > 0) {
    const wanted = new Set(conclusions.map((c) => c.toLowerCase()));
    filtered = filtered.filter(
      (j) => j.conclusion !== null && wanted.has(j.conclusion.toLowerCase()),
    );
  } else if (failedOnly) {
    filtered = filtered.filter((j) => j.conclusion !== 'success');
  }

  if (nameContains) {
    const needle = nameContains.toLowerCase();
    filtered = filtered.filter((j) => j.name.toLowerCase().includes(needle));
  }

  return filtered;
}

/** Error-line patterns that indicate a CI failure worth surfacing. */
const ERROR_PATTERN =
  /(?:error\b|FAIL|failed|✗|ERR!|error TS\d|Cannot find|Module not found|ENOENT|exit code [1-9]|Failed tasks)/i;

const NX_FAILED_SECTION = /^[\s>]*Failed tasks/i;

/** True if `line` starts with an ANSI CSI escape sequence (ESC `[`). */
function startsWithAnsiEscape(line: string): boolean {
  return line.charCodeAt(0) === 0x1b && line[1] === '[';
}

/**
 * Extract lines that match error patterns, with 2 lines of surrounding context.
 * Mirrors the ci_get_logs errorSummary behaviour so agents get a consistent
 * interface regardless of which server they call.
 */
function extractErrorSummary(allLines: string[]): string[] {
  const result: string[] = [];
  const CTX = 2;
  let inNxSection = false;

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];

    if (NX_FAILED_SECTION.test(line)) inNxSection = true;
    if (inNxSection) {
      result.push(line);
      if (i > 0 && !line.trim()) inNxSection = false;
      continue;
    }

    if (
      ERROR_PATTERN.test(line) &&
      !startsWithAnsiEscape(line) &&
      !/node_modules/.test(line) &&
      !/^\s*at\s/.test(line)
    ) {
      for (let j = Math.max(0, i - CTX); j < i; j++) {
        if (!result.includes(allLines[j])) result.push(allLines[j]);
      }
      result.push(line);
      for (let j = i + 1; j <= Math.min(allLines.length - 1, i + CTX); j++) {
        result.push(allLines[j]);
      }
    }
  }

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const line of result) {
    if (!seen.has(line)) {
      seen.add(line);
      deduped.push(line);
    }
  }
  return deduped;
}

/**
 * Hard cap on a user-supplied grep_pattern. Mirrors the ci-server
 * ci_search_logs convention (LS-9633) — log-search patterns are short by
 * nature, and a very long pattern is both unnecessary and a ReDoS smell.
 */
const MAX_GREP_PATTERN_LENGTH = 200;

/**
 * Validate a grep_pattern. Returns a human-readable rejection reason, or
 * null when acceptable. grep_pattern is a literal substring match only (no
 * regex option), which sidesteps ReDoS entirely — a caller needing regex
 * search should reach for the ci-server's ci_search_logs instead.
 */
function validateGrepPattern(pattern: string): string | null {
  if (pattern.length > MAX_GREP_PATTERN_LENGTH) {
    return `grep_pattern too long (${pattern.length} > ${MAX_GREP_PATTERN_LENGTH} characters).`;
  }
  return null;
}

/**
 * Build a case-insensitive literal-substring line matcher for grep_pattern.
 */
function buildGrepMatcher(pattern: string): (line: string) => boolean {
  const needle = pattern.toLowerCase();
  return (line: string) => line.toLowerCase().includes(needle);
}

/** Number of context lines surrounding each grep_pattern match. */
const GREP_CONTEXT_LINES = 2;

/**
 * Extract lines matching `isMatch`, with `GREP_CONTEXT_LINES` of surrounding
 * context on each side, deduplicated (LS-9633) — lets a caller pull just the
 * pass/fail summary or a specific test name out of a large job log instead
 * of relying on tail_lines alone, which can land entirely inside an
 * unrelated section (e.g. a live-reporter's ANSI-overwritten progress
 * lines). Mirrors extractErrorSummary's windowing, minus the Nx
 * "Failed tasks" special-casing that only applies to the fixed error
 * pattern.
 */
function extractGrepMatches(
  allLines: string[],
  isMatch: (line: string) => boolean,
): string[] {
  const result: string[] = [];

  for (let i = 0; i < allLines.length; i++) {
    if (!isMatch(allLines[i])) continue;

    for (let j = Math.max(0, i - GREP_CONTEXT_LINES); j < i; j++) {
      result.push(allLines[j]);
    }
    result.push(allLines[i]);
    for (
      let j = i + 1;
      j <= Math.min(allLines.length - 1, i + GREP_CONTEXT_LINES);
      j++
    ) {
      result.push(allLines[j]);
    }
  }

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const line of result) {
    if (!seen.has(line)) {
      seen.add(line);
      deduped.push(line);
    }
  }
  return deduped;
}

/**
 * Apply tail-lines, per-line, and maxChars limits to a set of log lines.
 * Returns the processed text, whether truncation occurred, the total byte
 * size of the untruncated input, and the number of lines actually returned.
 */
function applyLimits(
  lines: string[],
  tailLines: number,
  maxChars: number,
  truncateLineLength?: number,
): {
  text: string;
  truncated: boolean;
  totalBytes: number;
  returnedLines: number;
} {
  const totalBytes = lines.reduce((n, l) => n + l.length + 1, 0);
  const tailed = lines.length > tailLines ? lines.slice(-tailLines) : lines;

  // Walk the tail window from its END backwards so that when maxChars binds
  // before the whole window fits, what gets dropped is the EARLIER part of
  // the window, not the true tail — otherwise a larger tail_lines only moves
  // the window's start earlier without ever showing more of the log's actual
  // end (LS-10107).
  let budget = maxChars;
  const out: string[] = [];
  let charsTruncated = false;
  for (let i = tailed.length - 1; i >= 0; i--) {
    if (budget <= 0) {
      charsTruncated = true;
      break;
    }
    const rawLine = tailed[i];
    const line =
      truncateLineLength !== undefined && rawLine.length > truncateLineLength
        ? `${rawLine.slice(0, truncateLineLength)}...[line truncated]`
        : rawLine;
    if (line.length > budget) {
      out.unshift(line.slice(line.length - budget));
      budget = 0;
      charsTruncated = true;
    } else {
      out.unshift(line);
      budget -= line.length + 1;
    }
  }

  const lineTruncated = lines.length > tailLines;
  const truncated = lineTruncated || charsTruncated;
  const indicator = truncated
    ? `\n... [truncated, ${totalBytes} total bytes]`
    : '';

  return {
    text: out.join('\n') + indicator,
    truncated,
    totalBytes,
    returnedLines: out.length,
  };
}

export async function getJobLogs(
  params: GetJobLogsParams,
): Promise<ToolResult> {
  if (!params.jobId && !params.runId) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'Provide job_id to fetch a single job, or run_id to fetch all (failed) jobs in a run.',
        },
      ],
    };
  }

  if (params.grepPattern && params.errorSummary) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'grep_pattern and error_summary are mutually exclusive — use grep_pattern to search for a custom pattern, or error_summary for the built-in error/failure heuristic.',
        },
      ],
    };
  }

  if (params.grepPattern) {
    const reason = validateGrepPattern(params.grepPattern);
    if (reason) {
      return { isError: true, content: [{ type: 'text', text: reason }] };
    }
  }

  if (params.listOnly && !params.runId) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: "list_only requires run_id — it lists a run's jobs, there is nothing to list for a single job_id.",
        },
      ],
    };
  }

  const { owner, name } = await getRepoOwnerName();
  const tailLines = params.tailLines ?? DEFAULT_TAIL_LINES;
  const maxChars = params.maxChars ?? DEFAULT_MAX_CHARS;
  const failedOnly = params.failedOnly !== false;
  const filterOptions: JobFilterOptions = {
    failedOnly,
    conclusions: params.conclusions,
    nameContains: params.jobNameContains,
  };

  try {
    if (params.listOnly && params.runId) {
      const allJobs = await fetchAllJobs(owner, name, params.runId);
      const matched = filterJobs(allJobs, filterOptions);
      const offset = params.offset ?? 0;
      const limit = params.limit ?? DEFAULT_LIST_LIMIT;
      const page = matched.slice(offset, offset + limit);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                jobLabel: `run ${params.runId}`,
                totalJobs: allJobs.length,
                matchedJobs: matched.length,
                returnedJobs: page.length,
                offset,
                limit,
                ...(offset + page.length < matched.length
                  ? { nextOffset: offset + page.length }
                  : {}),
                jobs: page.map(toJobSummary),
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    let rawText: string;
    let jobLabel: string;
    let scopedToFailingStep = false;
    let failingSteps: string[] = [];
    let stepScopeFailed = false;

    if (params.jobId) {
      let scoped;
      try {
        scoped = await fetchScopedJobLog(
          owner,
          name,
          params.jobId,
          undefined,
          params.failedStepOnly,
        );
      } catch (err) {
        if (isBlobNotFoundError(err)) {
          return {
            isError: true,
            content: [{ type: 'text', text: LOGS_NOT_YET_AVAILABLE_MESSAGE }],
          };
        }
        throw err;
      }
      rawText = scoped.text;
      scopedToFailingStep = scoped.scopedToFailingStep;
      failingSteps = scoped.stepNames;
      stepScopeFailed = scoped.stepScopeFailed;
      jobLabel = `job ${params.jobId}`;
    } else {
      if (!params.runId) {
        throw new Error('runId is required when jobId is not provided');
      }
      const allJobs = await fetchAllJobs(owner, name, params.runId);
      const jobs = filterJobs(allJobs, filterOptions);
      if (jobs.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: failedOnly
                ? `No failed jobs found in run ${params.runId}.`
                : `No jobs found in run ${params.runId}.`,
            },
          ],
        };
      }
      const stepNamesByJob = new Set<string>();
      let anyStepScopeFailed = false;
      const parts = await Promise.all(
        jobs.map(async (job) => {
          try {
            const scoped = await fetchScopedJobLog(
              owner,
              name,
              job.id,
              job.steps,
              params.failedStepOnly,
            );
            if (scoped.scopedToFailingStep) {
              scopedToFailingStep = true;
              for (const s of scoped.stepNames) stepNamesByJob.add(s);
            }
            if (scoped.stepScopeFailed) anyStepScopeFailed = true;
            return `${job.name}\n${scoped.text}`;
          } catch (err) {
            if (isBlobNotFoundError(err)) {
              return `${job.name}\n${LOGS_NOT_YET_AVAILABLE_MESSAGE}`;
            }
            return `${job.name}\n(Failed to fetch logs for this job)`;
          }
        }),
      );
      failingSteps = [...stepNamesByJob];
      stepScopeFailed = anyStepScopeFailed;
      rawText = parts.join('\n\n');
      jobLabel = `run ${params.runId}`;
    }

    const stepScopeFailedMessage = stepScopeFailed
      ? 'failed_step_only was requested but no failing step could be located ' +
        '(no matching step entry and no ##[error] annotation in the log) -- ' +
        'showing the unscoped tail instead.'
      : undefined;

    const allLines = rawText.split(/\r?\n/);

    if (params.grepPattern) {
      const matcher = buildGrepMatcher(params.grepPattern);
      const matchedLines = extractGrepMatches(allLines, matcher);
      const { text, truncated, totalBytes, returnedLines } = applyLimits(
        matchedLines,
        tailLines,
        maxChars,
        params.truncateLineLength,
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                jobLabel,
                grepPattern: params.grepPattern,
                totalLogLines: allLines.length,
                matchedLines: matchedLines.length,
                scopedToFailingStep,
                ...(scopedToFailingStep ? { failingSteps } : {}),
                ...(stepScopeFailed
                  ? { stepScopeFailed, stepScopeFailedMessage }
                  : {}),
                truncated,
                returnedLines,
                ...(truncated ? { returnedFrom: 'tail' } : {}),
                totalBytes,
                logs: text,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    if (params.errorSummary) {
      const errorLines = extractErrorSummary(allLines);
      const { text, truncated, totalBytes, returnedLines } = applyLimits(
        errorLines,
        tailLines,
        maxChars,
        params.truncateLineLength,
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                jobLabel,
                errorSummary: true,
                totalLogLines: allLines.length,
                errorLines: errorLines.length,
                scopedToFailingStep,
                ...(scopedToFailingStep ? { failingSteps } : {}),
                ...(stepScopeFailed
                  ? { stepScopeFailed, stepScopeFailedMessage }
                  : {}),
                truncated,
                returnedLines,
                ...(truncated ? { returnedFrom: 'tail' } : {}),
                totalBytes,
                logs: text,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    const { text, truncated, totalBytes, returnedLines } = applyLimits(
      allLines,
      tailLines,
      maxChars,
      params.truncateLineLength,
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              jobLabel,
              totalLines: allLines.length,
              tailLines,
              scopedToFailingStep,
              ...(scopedToFailingStep ? { failingSteps } : {}),
              ...(stepScopeFailed
                ? { stepScopeFailed, stepScopeFailedMessage }
                : {}),
              truncated,
              returnedLines,
              ...(truncated ? { returnedFrom: 'tail' } : {}),
              totalBytes,
              logs: text,
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
          text: `Failed to fetch logs: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
