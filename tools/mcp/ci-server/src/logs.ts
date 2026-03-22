import { inflateRawSync } from 'node:zlib';

import { githubGet, githubGetArrayBuffer } from './github-api.js';

export interface FetchRunLogsParams {
  runId: number;
  jobId?: number;
  failedOnly?: boolean;
  attempt?: number;
}

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

/** Maximum number of concurrent log fetches to avoid OOM and rate limiting. */
const LOG_FETCH_CONCURRENCY = 5;

/**
 * Extract text content from a ZIP archive buffer.
 * Uses Node built-in zlib (inflateRawSync) to decompress individual ZIP entries.
 * Concatenates all text files found in the archive.
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
    const fileNameLength = data.readUInt16LE(offset + 26);
    const extraFieldLength = data.readUInt16LE(offset + 28);

    const dataOffset = offset + 30 + fileNameLength + extraFieldLength;

    if (compressedSize > 0 && dataOffset + compressedSize <= data.length) {
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

    offset = dataOffset + compressedSize;
  }

  return texts.join('');
}

/**
 * Fetch log text for a single job via the GitHub REST API.
 * GET /repos/{owner}/{repo}/actions/jobs/{job_id}/logs returns a 302 redirect
 * to a downloadable log archive (ZIP). We fetch as binary, unzip, and extract text.
 */
async function fetchJobLogs(jobId: number): Promise<string> {
  const buffer = await githubGetArrayBuffer(`/actions/jobs/${jobId}/logs`);
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
): Promise<GitHubJob[]> {
  const allJobs: GitHubJob[] = [];
  let page = 1;

  for (;;) {
    const jobsData = await githubGet<GitHubJobsResponse>(
      `/actions/runs/${runId}${attemptSuffix}/jobs`,
      { per_page: '100', page: String(page) },
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
): Promise<string[]> {
  const results: string[] = [];

  for (let i = 0; i < jobs.length; i += concurrency) {
    const batch = jobs.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (job) => {
        try {
          const text = await fetchJobLogs(job.id);
          return `${job.name}\n${text}`;
        } catch {
          return `${job.name}\n(Failed to fetch logs for this job)`;
        }
      }),
    );
    results.push(...batchResults);
  }

  return results;
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
): Promise<string> {
  // Single job requested — fetch directly
  if (params.jobId) {
    return fetchJobLogs(params.jobId);
  }

  const attemptSuffix = params.attempt ? `/attempts/${params.attempt}` : '';
  const allJobs = await fetchAllJobs(params.runId, attemptSuffix);

  const failedOnly = params.failedOnly !== false;
  const jobs = failedOnly
    ? allJobs.filter((j) => j.conclusion !== 'success')
    : allJobs;

  if (jobs.length === 0) {
    return failedOnly
      ? 'No failed jobs found in this workflow run.'
      : 'No jobs found in this workflow run.';
  }

  // Fetch logs with concurrency limiting to avoid OOM and rate limiting
  const logEntries = await fetchJobLogsBatched(jobs, LOG_FETCH_CONCURRENCY);

  return logEntries.join('\n\n');
}

/**
 * Fetch logs and collect the last `maxLines` lines (ring buffer).
 * Processes logs per-job incrementally to avoid buffering the entire run in memory.
 */
export async function fetchRunLogsRing(
  params: FetchRunLogsParams,
  maxLines: number,
): Promise<{ lines: string[]; totalLines: number }> {
  // Single job — fetch and trim directly
  if (params.jobId) {
    const raw = await fetchJobLogs(params.jobId);
    const allLines = raw.split(/\r?\n/);
    return {
      lines: allLines.length <= maxLines ? allLines : allLines.slice(-maxLines),
      totalLines: allLines.length,
    };
  }

  const attemptSuffix = params.attempt ? `/attempts/${params.attempt}` : '';
  const allJobs = await fetchAllJobs(params.runId, attemptSuffix);

  const failedOnly = params.failedOnly !== false;
  const jobs = failedOnly
    ? allJobs.filter((j) => j.conclusion !== 'success')
    : allJobs;

  if (jobs.length === 0) {
    const msg = failedOnly
      ? 'No failed jobs found in this workflow run.'
      : 'No jobs found in this workflow run.';
    return { lines: [msg], totalLines: 1 };
  }

  // Process per-job incrementally: keep a rolling buffer of the last maxLines lines
  const ringBuffer: string[] = [];
  let totalLines = 0;

  for (let i = 0; i < jobs.length; i += LOG_FETCH_CONCURRENCY) {
    const batch = jobs.slice(i, i + LOG_FETCH_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (job) => {
        try {
          const text = await fetchJobLogs(job.id);
          return { name: job.name, text };
        } catch {
          return {
            name: job.name,
            text: '(Failed to fetch logs for this job)',
          };
        }
      }),
    );

    for (const { name, text } of batchResults) {
      const jobLines = [`${name}`, ...text.split(/\r?\n/)];
      totalLines += jobLines.length;

      // Add to ring buffer, trimming if it exceeds maxLines
      ringBuffer.push(...jobLines);
      if (ringBuffer.length > maxLines) {
        ringBuffer.splice(0, ringBuffer.length - maxLines);
      }
    }
  }

  return { lines: ringBuffer, totalLines };
}
