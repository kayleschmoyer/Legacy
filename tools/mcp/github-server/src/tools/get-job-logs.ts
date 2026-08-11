import { inflateRawSync } from 'node:zlib';

import { getRepoOwnerName } from '../auth.js';
import { githubGetArrayBuffer, githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

export interface GetJobLogsParams {
  jobId?: number;
  runId?: number;
  failedOnly?: boolean;
  tailLines?: number;
  maxChars?: number;
  errorSummary?: boolean;
  truncateLineLength?: number;
}

/** Default hard cap on output characters to prevent context window overflow. */
const DEFAULT_MAX_CHARS = 10_000;

/** Default number of tail lines when tail_lines is not specified. */
const DEFAULT_TAIL_LINES = 200;

interface GitHubJob {
  id: number;
  name: string;
  conclusion: string | null;
}

interface GitHubJobsResponse {
  total_count: number;
  jobs: GitHubJob[];
}

/** Maximum uncompressed size per ZIP entry (50 MB) to prevent resource exhaustion. */
const MAX_UNCOMPRESSED_ENTRY_BYTES = 50 * 1024 * 1024;

/**
 * Extract concatenated text content from a ZIP archive buffer.
 * Uses Node built-in zlib to decompress individual deflated entries.
 * Skips entries whose declared uncompressed size exceeds MAX_UNCOMPRESSED_ENTRY_BYTES.
 */
function extractTextFromZip(buffer: ArrayBuffer): string {
  const data = Buffer.from(buffer);
  const texts: string[] = [];
  let offset = 0;

  while (offset + 30 <= data.length) {
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
          `[get-job-logs] skipping ZIP entry: uncompressed size ${uncompressedSize} exceeds ${MAX_UNCOMPRESSED_ENTRY_BYTES} byte limit\n`,
        );
      } else {
        const compressed = data.subarray(
          dataOffset,
          dataOffset + compressedSize,
        );
        try {
          if (compressionMethod === 8) {
            texts.push(inflateRawSync(compressed).toString('utf-8'));
          } else if (compressionMethod === 0) {
            texts.push(compressed.toString('utf-8'));
          }
        } catch (err) {
          process.stderr.write(
            `[get-job-logs] failed to decompress ZIP entry: ${err instanceof Error ? err.message : String(err)}\n`,
          );
        }
      }
    }

    offset = dataOffset + compressedSize;
  }

  return texts.join('');
}

/**
 * Fetch the raw log text for a single GitHub Actions job.
 * The endpoint returns a 302 redirect to the log archive (ZIP or plain text).
 */
async function fetchJobLog(
  owner: string,
  repo: string,
  jobId: number,
): Promise<string> {
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
    return extractTextFromZip(buffer);
  }

  return Buffer.from(buffer).toString('utf-8');
}

/**
 * Fetch all jobs for a run, optionally filtering to failed ones.
 * Handles pagination (GitHub returns ≤100 per page).
 */
async function fetchJobs(
  owner: string,
  repo: string,
  runId: number,
  failedOnly: boolean,
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

  return failedOnly
    ? allJobs.filter((j) => j.conclusion !== 'success')
    : allJobs;
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
 * Apply tail-lines, per-line, and maxChars limits to a set of log lines.
 * Returns the processed text and whether truncation occurred.
 */
function applyLimits(
  lines: string[],
  tailLines: number,
  maxChars: number,
  truncateLineLength?: number,
): { text: string; truncated: boolean; totalBytes: number } {
  const totalBytes = lines.reduce((n, l) => n + l.length + 1, 0);
  const tailed = lines.length > tailLines ? lines.slice(-tailLines) : lines;

  let budget = maxChars;
  const out: string[] = [];
  for (const rawLine of tailed) {
    if (budget <= 0) break;
    const line =
      truncateLineLength !== undefined && rawLine.length > truncateLineLength
        ? `${rawLine.slice(0, truncateLineLength)}...[line truncated]`
        : rawLine;
    if (line.length > budget) {
      out.push(line.slice(0, budget));
      budget = 0;
    } else {
      out.push(line);
      budget -= line.length + 1;
    }
  }

  const charsTruncated = budget <= 0;
  const lineTruncated = lines.length > tailLines;
  const truncated = lineTruncated || charsTruncated;
  const indicator = truncated
    ? `\n... [truncated, ${totalBytes} total bytes]`
    : '';

  return { text: out.join('\n') + indicator, truncated, totalBytes };
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

  const { owner, name } = await getRepoOwnerName();
  const tailLines = params.tailLines ?? DEFAULT_TAIL_LINES;
  const maxChars = params.maxChars ?? DEFAULT_MAX_CHARS;
  const failedOnly = params.failedOnly !== false;

  try {
    let rawText: string;
    let jobLabel: string;

    if (params.jobId) {
      rawText = await fetchJobLog(owner, name, params.jobId);
      jobLabel = `job ${params.jobId}`;
    } else {
      if (!params.runId) {
        throw new Error('runId is required when jobId is not provided');
      }
      const jobs = await fetchJobs(owner, name, params.runId, failedOnly);
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
      const parts = await Promise.all(
        jobs.map(async (job) => {
          try {
            const text = await fetchJobLog(owner, name, job.id);
            return `${job.name}\n${text}`;
          } catch {
            return `${job.name}\n(Failed to fetch logs for this job)`;
          }
        }),
      );
      rawText = parts.join('\n\n');
      jobLabel = `run ${params.runId}`;
    }

    const allLines = rawText.split(/\r?\n/);

    if (params.errorSummary) {
      const errorLines = extractErrorSummary(allLines);
      const { text, truncated, totalBytes } = applyLimits(
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
                truncated,
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

    const { text, truncated, totalBytes } = applyLimits(
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
              truncated,
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
