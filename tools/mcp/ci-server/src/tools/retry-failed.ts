import { githubGet, postWithRetryOnAlreadyRunning } from '../github-api.js';
import { fetchRunLogsRing } from '../logs.js';
import type { ToolResult } from '../types.js';
import { minifiedJson } from '@legacy-sports/mcp-format';

interface RetryFailedParams {
  runId: number;
  withFreshLogs?: boolean;
}

interface GitHubWorkflowRun {
  id: number;
  run_attempt: number;
  conclusion: string | null;
  status: string;
  html_url: string;
}

interface GitHubJob {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
}

interface GitHubJobsResponse {
  total_count: number;
  jobs: GitHubJob[];
}

/**
 * Error patterns mirroring ci_get_logs `errorSummary` extraction, used to
 * surface a small "why" snippet from the original run so the caller doesn't
 * have to follow up with a second log fetch.
 */
const ERROR_PATTERNS =
  /(?:error\b|FAIL|failed|✗|ERR!|error TS\d|Cannot find|Module not found|ENOENT|exit code [1-9]|Failed tasks)/i;
// Built from String.fromCharCode rather than a \x1b regex literal: a literal
// ESC control character trips no-control-regex even though it is the exact,
// intentional byte GitHub Actions emits for these escape sequences.
const ESC = String.fromCharCode(27);
const ANSI_ESCAPE_PREFIX = new RegExp(`^${ESC}\\[`);

const MAX_SNIPPET_LINES = 40;
const SNIPPET_FETCH_LINES = 2000;
const JOBS_PER_PAGE = 100;

async function fetchAllJobs(runId: number): Promise<{
  jobs: GitHubJob[];
  total: number;
}> {
  const all: GitHubJob[] = [];
  let page = 1;
  let total = 0;
  for (;;) {
    const data = await githubGet<GitHubJobsResponse>(
      `/actions/runs/${runId}/jobs`,
      {
        per_page: String(JOBS_PER_PAGE),
        page: String(page),
        filter: 'latest',
      },
    );
    total = data.total_count;
    all.push(...data.jobs);
    if (data.jobs.length < JOBS_PER_PAGE || all.length >= data.total_count) {
      break;
    }
    page += 1;
  }
  return { jobs: all, total };
}

function extractSnippet(lines: string[]): string[] {
  const matches: string[] = [];
  for (const line of lines) {
    if (
      ERROR_PATTERNS.test(line) &&
      !ANSI_ESCAPE_PREFIX.test(line) &&
      !/node_modules/.test(line) &&
      !/^\s*at\s/.test(line)
    ) {
      matches.push(line);
      if (matches.length >= MAX_SNIPPET_LINES) break;
    }
  }
  return matches;
}

export async function retryFailed(
  params: RetryFailedParams,
): Promise<ToolResult> {
  if (
    !Number.isFinite(params.runId) ||
    !Number.isInteger(params.runId) ||
    params.runId <= 0
  ) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text:
            `runId must be a positive integer; received ${params.runId}. ` +
            `Use the "id" field from ci_list_runs output ("databaseId" is an alias for the same value).`,
        },
      ],
    };
  }

  try {
    const originalRun = await githubGet<GitHubWorkflowRun>(
      `/actions/runs/${params.runId}`,
    );
    const { jobs: allJobs, total: jobsTotal } = await fetchAllJobs(
      params.runId,
    );

    const failedJobs = allJobs.filter(
      (j) => j.conclusion === 'failure' || j.conclusion === 'cancelled',
    );

    if (failedJobs.length === 0) {
      const totals = {
        total: jobsTotal,
        passed: allJobs.filter((j) => j.conclusion === 'success').length,
        skipped: allJobs.filter((j) => j.conclusion === 'skipped').length,
        inProgress: allJobs.filter((j) => j.status === 'in_progress').length,
      };
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text:
              `No failed jobs to rerun for run ${params.runId} ` +
              `(status=${originalRun.status}, conclusion=${originalRun.conclusion ?? 'null'}). ` +
              `Job totals: ${JSON.stringify(totals)}. ` +
              `Use ci_rerun({ runId, failedOnly: false }) if you intended to rerun the whole workflow.`,
          },
        ],
      };
    }

    let originalLogSnippet = '';
    try {
      const { lines } = await fetchRunLogsRing(
        { runId: params.runId, failedOnly: true },
        SNIPPET_FETCH_LINES,
      );
      originalLogSnippet = extractSnippet(lines).join('\n');
    } catch {
      originalLogSnippet = '';
    }

    await postWithRetryOnAlreadyRunning(
      `/actions/runs/${params.runId}/rerun-failed-jobs`,
    );

    const updatedRun = await githubGet<GitHubWorkflowRun>(
      `/actions/runs/${params.runId}`,
    );

    const payload = {
      originalRunId: params.runId,
      originalAttempt: originalRun.run_attempt,
      newRunId: updatedRun.id,
      newAttempt: updatedRun.run_attempt,
      failedJobsRerun: failedJobs.map((j) => ({
        databaseId: j.id,
        name: j.name,
        conclusion: j.conclusion,
      })),
      originalLogSnippet,
      url: updatedRun.html_url,
      ...(params.withFreshLogs
        ? {
            followUp:
              `withFreshLogs requested — once the new attempt completes, call ` +
              `ci_get_logs({ runId: ${updatedRun.id}, attempt: ${updatedRun.run_attempt}, errorSummary: true }) ` +
              `to fetch fresh failure logs.`,
          }
        : {}),
      note:
        'GitHub reruns reuse the same run id and increment run_attempt; ' +
        'newRunId equals originalRunId by design — use newAttempt to disambiguate.',
    };

    return {
      content: [{ type: 'text', text: minifiedJson(payload) }],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to retry failed jobs for run ${params.runId}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
