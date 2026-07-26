import { inflateRawSync } from 'node:zlib';

import { githubGet, githubGetArrayBuffer } from './github-api.js';

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

interface GitHubJob {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  steps?: Array<{
    name: string;
    status: string;
    conclusion: string | null;
    number: number;
  }>;
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
 * Used only on the 404 log-fetch path to distinguish "job never started" from
 * a genuine missing-log error, so it costs nothing on the common success path.
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
 * Extract text content from a ZIP archive buffer.
 * Uses Node built-in zlib (inflateRawSync) to decompress individual ZIP entries.
 * Concatenates all text files found in the archive.
 * Skips entries whose declared uncompressed size exceeds MAX_UNCOMPRESSED_ENTRY_BYTES.
 */
function extractTextFromZip(buffer: ArrayBuffer): string {
  const data = Buffer.from(buffer);
  const texts: string[] = [];

  // Parse ZIP local file headers (signature 0x04034b50)
  let offset = 0;
  while (offset + 30 <= data.length) {
    // Check for local file header signature
    if (data.readUInt32LE(offset) !== 0x04034b50) break;

    const compressionMethod = data.readUInt16LE(offset + 8);
    const compressedSize = data.readUInt32LE(offset + 18);
    const uncompressedSize = data.readUInt32LE(offset + 22);
    const fileNameLength = data.readUInt16LE(offset + 26);
    const extraFieldLength = data.readUInt16LE(offset + 28);

    const dataOffset = offset + 30 + fileNameLength + extraFieldLength;

    if (compressedSize > 0 && dataOffset + compressedSize <= data.length) {
      if (uncompressedSize > MAX_UNCOMPRESSED_ENTRY_BYTES) {
        process.stderr.write(
          `[ci-server] skipping ZIP entry: uncompressed size ${uncompressedSize} exceeds ${MAX_UNCOMPRESSED_ENTRY_BYTES} byte limit\n`,
        );
      } else {
        const compressedData = data.subarray(
          dataOffset,
          dataOffset + compressedSize,
        );
        try {
          if (compressionMethod === 8) {
            // Deflated — use inflateRaw
            texts.push(inflateRawSync(compressedData).toString('utf-8'));
          } else if (compressionMethod === 0) {
            // Stored (no compression)
            texts.push(compressedData.toString('utf-8'));
          }
        } catch {
          // Skip entries that fail to decompress
        }
      }
    }

    offset = dataOffset + compressedSize;
  }

  return texts.join('');
}

/**
 * Fetch log text for a single job via the GitHub REST API.
 * GET /repos/{owner}/{repo}/actions/jobs/{job_id}/logs returns a 302 redirect
 * to a downloadable log archive (ZIP). We fetch as binary, unzip, and extract text.
 */
async function fetchJobLogs(
  jobId: number,
  signal?: AbortSignal,
): Promise<string> {
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
    return extractTextFromZip(buffer);
  }
  // Not a ZIP — treat as plain text
  return Buffer.from(buffer).toString('utf-8');
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
    let raw: string;
    try {
      raw = await fetchJobLogs(params.jobId, params.signal);
    } catch (err) {
      if (
        isBlobNotFound404(err) &&
        (await jobNeverStarted(params.jobId, params.signal))
      ) {
        return { lines: [JOB_NEVER_STARTED_MESSAGE], totalLines: 1 };
      }
      throw err;
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
          const text = await fetchJobLogs(job.id, params.signal);
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
