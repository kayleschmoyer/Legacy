import { inflateRawSync } from 'node:zlib';

import { githubGet, githubGetArrayBuffer } from './github-api.js';

/** ZIP local file header signature (`PK\x03\x04`). */
const LOCAL_FILE_HEADER_SIG = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
/** ZIP central directory file header signature (`PK\x01\x02`) — marks the end of entries. */
const CENTRAL_DIR_SIG = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
/**
 * General-purpose bit flag 3: CRC-32/compressed/uncompressed sizes are zeroed
 * in the local file header and instead stored in a trailing data descriptor
 * written after the entry's data — used when a writer streams an entry
 * without knowing its final size up front (GitHub Actions' log archiver does
 * this for larger job logs). Trusting a zeroed `compressedSize` for such an
 * entry made the parser land on garbage bytes for the next "signature" check
 * and silently `break` out of the loop, dropping every entry from that point
 * on (and everything read so far reported as `truncated: false`) — LS-9229.
 */
const FLAG_DATA_DESCRIPTOR = 0x0008;

// Built from String.fromCharCode rather than a \x1b regex literal: a literal
// ESC control character trips no-control-regex even though it is the exact,
// intentional byte GitHub Actions emits for these escape sequences.
const ESC = String.fromCharCode(27);
/**
 * Matches ANSI CSI escape sequences (LS-9557) — colour/style codes (ending in
 * `m`, e.g. `\x1b[31m`) and cursor-movement sequences some progress renderers
 * emit (ending in other letters, e.g. `\x1b[2K`). Broader than an SGR-only
 * `[0-9;]*m` match so both classes are stripped.
 */
const ANSI_ESCAPE_SEQUENCE = new RegExp(`${ESC}\\[[0-9;]*[A-Za-z]`, 'g');

/**
 * Strip ANSI escape sequences from log text (LS-9557). GitHub Actions log
 * output is heavily colourised — jest/nx output routinely has escape codes
 * adding 40-80% to a line's character length — which both inflates the
 * maxChars budget with non-content bytes and breaks literal pattern matching
 * in ci_search_logs (codes sit between semantically adjacent characters, e.g.
 * splitting "● FootballLeagueId" into "●" + escapes + "FootballLeagueId").
 */
export function stripAnsiCodes(text: string): string {
  return text.replace(ANSI_ESCAPE_SEQUENCE, '');
}

export interface FetchRunLogsParams {
  runId?: number;
  jobId?: number;
  failedOnly?: boolean;
  attempt?: number;
  jobName?: string;
  /** Optional abort signal — aborts in-flight log downloads when triggered. */
  signal?: AbortSignal;
}

/**
 * Maximum number of failed jobs for which logs are fetched in a single call.
 * Large matrix workflows (e.g. DB integration tests) can have dozens of failed
 * jobs; fetching all of them easily exceeds the Lambda 30 s timeout. When the
 * cap is hit, the response notes how many jobs were skipped so the caller can
 * narrow the query with jobName or jobId.
 */
const MAX_LOG_JOBS = 10;

/**
 * Cap on priority-matcher lines collected across a whole run's logs (LS-8391).
 * Bounds memory for a pathological log with an unusually large number of
 * matches; real jest failure summaries are far smaller than this.
 */
const PRIORITY_LINES_CAP = 300;

interface GitHubJobStep {
  name: string;
  status: string;
  conclusion: string | null;
  number: number;
}

interface GitHubJob {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  steps?: GitHubJobStep[];
}

interface GitHubJobsResponse {
  total_count: number;
  jobs: GitHubJob[];
}

/**
 * Friendly message for jobs that failed before any step executed (e.g. runner
 * provisioning failure, hosted-runner billing/spending limit, or a GitHub
 * Actions incident). GitHub's log-blob endpoint 404s for these jobs since no
 * log archive was ever produced; without this, callers see a raw Azure Blob
 * Storage XML 404 body that reads like an MCP bug (LS-7910).
 */
export const JOB_NEVER_STARTED_MESSAGE =
  'Job failed before any step executed -- no logs exist. This usually means runner provisioning failed (self-hosted runner offline, hosted-runner billing/spending limit, or a GitHub Actions incident).';

/** True for the "GitHub API 404: ..." error thrown by githubGetArrayBuffer/githubGet on a 404 response. */
function isBlobNotFound404(err: unknown): boolean {
  return err instanceof Error && /^GitHub API 404:/.test(err.message);
}

/**
 * Fetch a single job's detail (including its `steps` array) directly by id.
 * Used on the 404 log-fetch path to distinguish "job never started" from a
 * genuine missing-log error, and (LS-9556) on a bare-jobId errorSummary call
 * to get step-conclusion data for scoping — a run-scoped call already has
 * this from the jobs-list response and skips this lookup entirely.
 */
async function fetchJobDetail(
  jobId: number,
  signal?: AbortSignal,
): Promise<GitHubJob> {
  return githubGet<GitHubJob>(`/actions/jobs/${jobId}`, undefined, {
    signal,
  });
}

/**
 * Whether a job whose log fetch just 404'd has an empty (or missing) `steps`
 * array — i.e. it never started. Swallows job-detail lookup failures (treated
 * as "has steps" / unknown) so callers fall back to the original 404 error.
 */
async function jobNeverStarted(
  jobId: number,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const job = await fetchJobDetail(jobId, signal);
    return !job.steps || job.steps.length === 0;
  } catch {
    return false;
  }
}

/** Maximum number of concurrent log fetches to avoid OOM and rate limiting. */
const LOG_FETCH_CONCURRENCY = 5;

/** Maximum uncompressed size per ZIP entry (50 MB) to prevent resource exhaustion. */
const MAX_UNCOMPRESSED_ENTRY_BYTES = 50 * 1024 * 1024;

/**
 * Find the end of a streamed entry's data: the offset of the next local file
 * header or the start of the central directory, whichever comes first, or
 * the end of the buffer if neither appears (last entry, archive truncated).
 */
function findStreamedEntryEnd(data: Buffer, from: number): number {
  const nextLocal = data.indexOf(LOCAL_FILE_HEADER_SIG, from);
  const nextCentral = data.indexOf(CENTRAL_DIR_SIG, from);
  const candidates = [nextLocal, nextCentral].filter((i) => i !== -1);
  return candidates.length > 0 ? Math.min(...candidates) : data.length;
}

/** One entry (a step's raw output) extracted from a job's log ZIP archive. */
interface ZipEntry {
  name: string;
  text: string;
}

/**
 * One entry extracted from a ZIP archive, keeping its raw decompressed bytes
 * instead of forcing a UTF-8 decode — used by callers that need to preserve
 * binary content (e.g. writing an Actions artifact's files back to disk
 * unchanged) rather than read it as log text.
 */
export interface RawZipEntry {
  name: string;
  data: Buffer;
}

/**
 * Extract every entry (name + raw decompressed bytes) from a ZIP archive
 * buffer. Uses Node built-in zlib (inflateRawSync) to decompress individual
 * ZIP entries. Skips entries whose declared uncompressed size exceeds
 * MAX_UNCOMPRESSED_ENTRY_BYTES. GitHub Actions names each job-log entry
 * `<step-number>_<step-name>.txt`, which `scopeEntriesToFailingSteps`
 * (LS-9556) relies on to slice a job's log down to only the step that failed;
 * Actions artifact ZIPs (a different producer) use the uploaded file's own
 * relative path as the entry name instead.
 */
export function extractZipEntriesRaw(buffer: ArrayBuffer): RawZipEntry[] {
  const data = Buffer.from(buffer);
  const entries: RawZipEntry[] = [];

  // Parse ZIP local file headers (signature 0x04034b50)
  let offset = 0;
  while (offset + 30 <= data.length) {
    // Check for local file header signature
    if (data.readUInt32LE(offset) !== 0x04034b50) break;

    const generalPurposeBitFlag = data.readUInt16LE(offset + 6);
    const compressionMethod = data.readUInt16LE(offset + 8);
    const headerCompressedSize = data.readUInt32LE(offset + 18);
    const uncompressedSize = data.readUInt32LE(offset + 22);
    const fileNameLength = data.readUInt16LE(offset + 26);
    const extraFieldLength = data.readUInt16LE(offset + 28);

    const nameStart = offset + 30;
    const nameEnd = nameStart + fileNameLength;
    if (nameEnd > data.length) {
      // Malformed header: fileNameLength claims more bytes than remain in
      // the buffer. Nothing past this point in the archive can be trusted,
      // so stop parsing instead of reading with an out-of-range offset
      // (legacy-sports-review-bot, LS-9229).
      break;
    }
    const name = data.subarray(nameStart, nameEnd).toString('utf-8');
    const dataOffset = nameEnd + extraFieldLength;
    if (dataOffset > data.length) break;

    // Streamed entries (bit 3) have zeroed sizes in the local header — the
    // header field can't be trusted, so locate the boundary by scanning
    // forward for the next entry instead.
    const streamed = (generalPurposeBitFlag & FLAG_DATA_DESCRIPTOR) !== 0;
    const entryEnd = streamed
      ? findStreamedEntryEnd(data, dataOffset)
      : dataOffset + headerCompressedSize;
    const compressedSize = streamed
      ? entryEnd - dataOffset
      : headerCompressedSize;

    if (compressedSize > 0 && entryEnd <= data.length) {
      if (!streamed && uncompressedSize > MAX_UNCOMPRESSED_ENTRY_BYTES) {
        process.stderr.write(
          `[ci-server] skipping ZIP entry: uncompressed size ${uncompressedSize} exceeds ${MAX_UNCOMPRESSED_ENTRY_BYTES} byte limit\n`,
        );
      } else {
        const compressedData = data.subarray(dataOffset, entryEnd);
        try {
          if (compressionMethod === 8) {
            // Deflated — use inflateRaw. Raw deflate streams are
            // self-terminating, so a streamed entry's trailing data
            // descriptor bytes (included in `compressedData` since its real
            // length is unknown) are harmlessly ignored past the stream end.
            entries.push({
              name,
              data: inflateRawSync(compressedData, {
                maxOutputLength: MAX_UNCOMPRESSED_ENTRY_BYTES,
              }),
            });
          } else if (compressionMethod === 0 && !streamed) {
            // Stored (no compression) — only trustworthy when the header's
            // size fields are real, i.e. not a streamed entry.
            entries.push({ name, data: Buffer.from(compressedData) });
          }
        } catch {
          // Skip entries that fail to decompress
        }
      }
    }

    offset = entryEnd;
  }

  return entries;
}

/**
 * Extract every entry (name + decompressed text) from a ZIP archive buffer.
 * Thin UTF-8-decoding wrapper around {@link extractZipEntriesRaw} for
 * callers (job log parsing) that only ever deal with text content.
 */
function extractZipEntries(buffer: ArrayBuffer): ZipEntry[] {
  return extractZipEntriesRaw(buffer).map(({ name, data }) => ({
    name,
    text: data.toString('utf-8'),
  }));
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
 * `conclusion: "failure"` (LS-9556). Structural fix for the recurring
 * errorSummary defect (LS-8391/LS-8405/LS-8772): instead of scoring every
 * line of the *whole* job log — which mixes in successful setup/checkout/
 * other-tool steps' noise (runner bootstrap heartbeats, git fetch spam,
 * unrelated tools' success output) — use the GitHub Jobs API's per-step
 * conclusion (already available on the job) to slice to only the step that
 * actually failed, before any line-level pattern matching runs. Each prior
 * fix instead bolted on one more tool-specific regex to the whole-log scan,
 * which is why the defect class kept recurring for every new job type.
 *
 * Returns null when step data is unavailable, no step is marked "failure",
 * or no ZIP entry could be matched to a failing step number — callers
 * should fall back to the whole job log in that case (e.g. a cancelled job
 * with no distinct failing step).
 */
function scopeEntriesToFailingSteps(
  entries: ZipEntry[],
  steps: GitHubJobStep[] | undefined,
): string | null {
  if (!steps || steps.length === 0) return null;
  const failingNumbers = new Set(
    steps.filter((s) => s.conclusion === 'failure').map((s) => s.number),
  );
  if (failingNumbers.size === 0) return null;

  const matched = entries.filter((e) => {
    const n = stepNumberFromEntryName(e.name);
    return n !== null && failingNumbers.has(n);
  });
  if (matched.length === 0) return null;

  return matched.map((e) => e.text).join('\n');
}

/**
 * Fetch a single job's log as per-step ZIP entries via the GitHub REST API.
 * GET /repos/{owner}/{repo}/actions/jobs/{job_id}/logs returns a 302 redirect
 * to a downloadable log archive (ZIP). We fetch as binary, unzip, and extract
 * each entry. When the response isn't a ZIP (plain text), it is returned as a
 * single synthetic entry with no step-number prefix, so step-scoping cleanly
 * no-ops for those callers instead of misbehaving.
 */
async function fetchJobLogEntries(
  jobId: number,
  signal?: AbortSignal,
): Promise<ZipEntry[]> {
  const buffer = await githubGetArrayBuffer(`/actions/jobs/${jobId}/logs`, {
    signal,
  });
  // The response may be a ZIP archive or plain text depending on the server.
  // Check for ZIP magic bytes (PK\x03\x04).
  const header = new Uint8Array(buffer.slice(0, 4));
  if (
    header[0] === 0x50 &&
    header[1] === 0x4b &&
    header[2] === 0x03 &&
    header[3] === 0x04
  ) {
    return extractZipEntries(buffer);
  }
  // Not a ZIP — treat as plain text
  return [
    { name: `job-${jobId}`, text: Buffer.from(buffer).toString('utf-8') },
  ];
}

/** Fetch log text for a single job, concatenating all of its ZIP entries. */
async function fetchJobLogs(
  jobId: number,
  signal?: AbortSignal,
): Promise<string> {
  const entries = await fetchJobLogEntries(jobId, signal);
  return entries.map((e) => e.text).join('');
}

/**
 * Fetch all jobs for a workflow run, handling pagination.
 * The GitHub API returns at most 100 jobs per page; this loops until all are fetched.
 */
async function fetchAllJobs(
  runId: number,
  attemptSuffix: string,
  signal?: AbortSignal,
): Promise<GitHubJob[]> {
  const allJobs: GitHubJob[] = [];
  let page = 1;

  for (;;) {
    const jobsData = await githubGet<GitHubJobsResponse>(
      `/actions/runs/${runId}${attemptSuffix}/jobs`,
      { per_page: '100', page: String(page) },
      { signal },
    );

    allJobs.push(...jobsData.jobs);

    // If we got fewer than 100 or have all jobs, stop paginating
    if (jobsData.jobs.length < 100 || allJobs.length >= jobsData.total_count) {
      break;
    }
    page++;
  }

  return allJobs;
}

/**
 * Process jobs in batches to limit concurrency and avoid OOM / rate limiting.
 */
async function fetchJobLogsBatched(
  jobs: GitHubJob[],
  concurrency: number,
  signal?: AbortSignal,
): Promise<string[]> {
  const results: string[] = [];

  for (let i = 0; i < jobs.length; i += concurrency) {
    const batch = jobs.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (job) => {
        try {
          const text = await fetchJobLogs(job.id, signal);
          return `${job.name}\n${text}`;
        } catch (err) {
          if (
            isBlobNotFound404(err) &&
            (!job.steps || job.steps.length === 0)
          ) {
            return `${job.name}\n${JOB_NEVER_STARTED_MESSAGE}`;
          }
          const reason = isAbortError(err) ? 'timed out' : 'failed';
          return `${job.name}\n(Log fetch ${reason} for this job)`;
        }
      }),
    );
    results.push(...batchResults);
  }

  return results;
}

/** Returns true for AbortError / TimeoutError (DOMException name variants). */
function isAbortError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.name === 'AbortError' || err.name === 'TimeoutError';
  }
  return false;
}

/** Result of {@link fetchRunLogs} — log text plus how much of the run it actually covered. */
export interface FetchRunLogsResult {
  text: string;
  /** Number of jobs whose logs were actually fetched and included in `text`. */
  jobsSearched: number;
  /** Total number of jobs in the run's scope (post jobName filter, pre failedOnly/MAX_LOG_JOBS filtering). */
  jobsTotal: number;
  /**
   * True when `failedOnly` (the default) filtered every job out of scope —
   * i.e. jobs existed but none were non-successful — as opposed to a run
   * with genuinely zero jobs. Callers should not treat a zero-match search
   * result as "pattern absent" when this is true.
   */
  skippedByFailedOnly: boolean;
}

/**
 * Fetch logs for a workflow run or a specific job.
 *
 * When `jobId` is provided, fetches logs for that single job.
 * When `failedOnly` is true (default), fetches logs only for non-successful jobs
 * (failure, cancelled, timed_out, startup_failure, etc.).
 * Otherwise, fetches logs for all jobs in the run.
 *
 * Each job's logs are prefixed with its name for identification,
 * matching the format previously produced by `gh run view --log`.
 */
export async function fetchRunLogs(
  params: FetchRunLogsParams,
): Promise<FetchRunLogsResult> {
  // Single job requested — fetch directly. A directly-targeted jobId is
  // never filtered by failedOnly, so scope is always exactly that one job.
  if (params.jobId) {
    const text = await fetchJobLogs(params.jobId, params.signal);
    return {
      text,
      jobsSearched: 1,
      jobsTotal: 1,
      skippedByFailedOnly: false,
    };
  }

  if (!params.runId) {
    throw new Error('runId is required when jobId is not provided');
  }

  const attemptSuffix = params.attempt ? `/attempts/${params.attempt}` : '';
  let allJobs = await fetchAllJobs(params.runId, attemptSuffix, params.signal);

  if (params.jobName) {
    const nameLower = params.jobName.toLowerCase();
    allJobs = allJobs.filter((j) => j.name.toLowerCase().includes(nameLower));
  }

  const failedOnly = params.failedOnly !== false;
  const jobsTotal = allJobs.length;
  let jobs = failedOnly
    ? allJobs.filter((j) => j.conclusion !== 'success')
    : allJobs;

  const skippedByFailedOnly = failedOnly && jobsTotal > 0 && jobs.length === 0;

  if (jobs.length === 0) {
    return {
      text: failedOnly
        ? 'No failed jobs found in this workflow run.'
        : 'No jobs found in this workflow run.',
      jobsSearched: 0,
      jobsTotal,
      skippedByFailedOnly,
    };
  }

  const skipped = jobs.length > MAX_LOG_JOBS ? jobs.length - MAX_LOG_JOBS : 0;
  if (skipped > 0) jobs = jobs.slice(0, MAX_LOG_JOBS);

  // Fetch logs with concurrency limiting to avoid OOM and rate limiting
  const logEntries = await fetchJobLogsBatched(
    jobs,
    LOG_FETCH_CONCURRENCY,
    params.signal,
  );

  if (skipped > 0) {
    logEntries.push(
      `(${skipped} additional job(s) omitted — use jobName or jobId to fetch specific job logs)`,
    );
  }

  return {
    text: logEntries.join('\n\n'),
    jobsSearched: jobs.length,
    jobsTotal,
    skippedByFailedOnly: false,
  };
}

/**
 * Append one line to a fixed-size ring buffer, dropping the oldest line when full.
 * Trims in batches to keep amortized cost O(1) per line — calling `shift()` per
 * push would be O(n) per call and quadratic across a multi-million-line stream.
 */
function pushLine(buffer: string[], line: string, maxLines: number): void {
  buffer.push(line);
  if (buffer.length > maxLines * 2) {
    buffer.splice(0, buffer.length - maxLines);
  }
}

/** Final trim after streaming completes — leaves exactly the last `maxLines`. */
function trimRingBuffer(buffer: string[], maxLines: number): void {
  if (buffer.length > maxLines) {
    buffer.splice(0, buffer.length - maxLines);
  }
}

/**
 * Fetch logs and collect the last `maxLines` lines (ring buffer).
 * Processes logs per-job incrementally to avoid buffering the entire run in memory.
 *
 * When `priorityMatcher` is provided, every line of the full log is also
 * tested against it (independent of the `maxLines` ring-buffer window) and
 * matches are returned in `priorityLines`, capped at `PRIORITY_LINES_CAP`.
 * This lets callers surface high-signal lines (e.g. jest failure markers,
 * LS-8391) that would otherwise be dropped when they fall outside the
 * ring-buffered tail of a large log.
 */
export async function fetchRunLogsRing(
  params: FetchRunLogsParams,
  maxLines: number,
  priorityMatcher?: (line: string) => boolean,
): Promise<{
  lines: string[];
  totalLines: number;
  skippedJobs?: number;
  priorityLines?: string[];
}> {
  // Single job — fetch and trim directly
  if (params.jobId) {
    let entries: ZipEntry[];
    try {
      entries = await fetchJobLogEntries(params.jobId, params.signal);
    } catch (err) {
      if (
        isBlobNotFound404(err) &&
        (await jobNeverStarted(params.jobId, params.signal))
      ) {
        return { lines: [JOB_NEVER_STARTED_MESSAGE], totalLines: 1 };
      }
      throw err;
    }

    let raw = entries.map((e) => e.text).join('');
    if (priorityMatcher) {
      // errorSummary requested — scope to the failing step before falling
      // back to the whole job log (LS-9556). A bare jobId call has no step
      // data yet, so look the job up once, best-effort.
      try {
        const job = await fetchJobDetail(params.jobId, params.signal);
        const scoped = scopeEntriesToFailingSteps(entries, job.steps);
        if (scoped !== null) raw = scoped;
      } catch {
        // Step lookup is best-effort here — fall back to the unscoped log
        // rather than failing the whole call over it.
      }
    }
    const allLines = raw.split(/\r?\n/);
    return {
      lines: allLines.length <= maxLines ? allLines : allLines.slice(-maxLines),
      totalLines: allLines.length,
      priorityLines: priorityMatcher
        ? allLines.filter(priorityMatcher).slice(0, PRIORITY_LINES_CAP)
        : undefined,
    };
  }

  if (!params.runId) {
    throw new Error('runId is required when jobId is not provided');
  }

  const attemptSuffix = params.attempt ? `/attempts/${params.attempt}` : '';
  const allJobs = await fetchAllJobs(
    params.runId,
    attemptSuffix,
    params.signal,
  );

  const failedOnly = params.failedOnly !== false;
  let jobs = failedOnly
    ? allJobs.filter((j) => j.conclusion !== 'success')
    : allJobs;

  if (params.jobName) {
    const nameLower = params.jobName.toLowerCase();
    jobs = jobs.filter((j) => j.name.toLowerCase().includes(nameLower));
  }

  if (jobs.length === 0) {
    const msg = failedOnly
      ? 'No failed jobs found in this workflow run.'
      : 'No jobs found in this workflow run.';
    return { lines: [msg], totalLines: 1 };
  }

  const skippedJobs =
    jobs.length > MAX_LOG_JOBS ? jobs.length - MAX_LOG_JOBS : 0;
  if (skippedJobs > 0) jobs = jobs.slice(0, MAX_LOG_JOBS);

  // Process per-job incrementally: keep a rolling buffer of the last maxLines lines
  const ringBuffer: string[] = [];
  const priorityLines: string[] = [];
  let totalLines = 0;

  for (let i = 0; i < jobs.length; i += LOG_FETCH_CONCURRENCY) {
    const batch = jobs.slice(i, i + LOG_FETCH_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (job) => {
        try {
          const entries = await fetchJobLogEntries(job.id, params.signal);
          let text = entries.map((e) => e.text).join('');
          if (priorityMatcher) {
            // errorSummary requested — scope to the failing step (LS-9556).
            // Step data is already on `job` from the run-jobs API response,
            // no extra request needed here (unlike the bare-jobId path).
            const scoped = scopeEntriesToFailingSteps(entries, job.steps);
            if (scoped !== null) text = scoped;
          }
          return { name: job.name, text };
        } catch (err) {
          if (
            isBlobNotFound404(err) &&
            (!job.steps || job.steps.length === 0)
          ) {
            return { name: job.name, text: JOB_NEVER_STARTED_MESSAGE };
          }
          const reason = isAbortError(err) ? 'timed out' : 'failed';
          return {
            name: job.name,
            text: `(Log fetch ${reason} for this job)`,
          };
        }
      }),
    );

    for (const { name, text } of batchResults) {
      // Iterate lines without spread: `[...arr]` and `push(...arr)` pass each
      // element as a function argument, which trips the engine's argument-count
      // limit (surfaces as "Maximum call stack size exceeded") for logs with
      // hundreds of thousands of lines.
      pushLine(ringBuffer, name, maxLines);
      totalLines += 1;
      if (
        priorityMatcher &&
        priorityLines.length < PRIORITY_LINES_CAP &&
        priorityMatcher(name)
      ) {
        priorityLines.push(name);
      }

      const textLines = text.split(/\r?\n/);
      totalLines += textLines.length;
      for (const line of textLines) {
        pushLine(ringBuffer, line, maxLines);
        if (
          priorityMatcher &&
          priorityLines.length < PRIORITY_LINES_CAP &&
          priorityMatcher(line)
        ) {
          priorityLines.push(line);
        }
      }
    }
  }

  trimRingBuffer(ringBuffer, maxLines);
  return {
    lines: ringBuffer,
    totalLines,
    skippedJobs: skippedJobs || undefined,
    priorityLines: priorityMatcher ? priorityLines : undefined,
  };
}
