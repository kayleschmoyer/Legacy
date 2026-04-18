import { githubGet } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface WaitForRunParams {
  runId: number;
  timeoutSecs?: number;
  pollIntervalSecs?: number;
}

interface GitHubWorkflowRun {
  id: number;
  run_number: number;
  run_attempt: number;
  conclusion: string | null;
  created_at: string;
  display_title: string;
  event: string;
  head_branch: string;
  head_sha: string;
  name: string;
  started_at?: string | null;
  status: string;
  updated_at: string;
  html_url: string;
  workflow_id: number;
}

interface GitHubJob {
  id: number;
  run_id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
}

interface GitHubJobsResponse {
  total_count: number;
  jobs: GitHubJob[];
}

const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'skipped']);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapRun(run: GitHubWorkflowRun) {
  return {
    attempt: run.run_attempt,
    conclusion: run.conclusion,
    createdAt: run.created_at,
    databaseId: run.id,
    displayTitle: run.display_title,
    event: run.event,
    headBranch: run.head_branch,
    headSha: run.head_sha,
    name: run.name,
    number: run.run_number,
    startedAt: run.started_at ?? null,
    status: run.status,
    updatedAt: run.updated_at,
    url: run.html_url,
    workflowDatabaseId: run.workflow_id,
    workflowName: run.name,
  };
}

export async function waitForRun(
  params: WaitForRunParams,
): Promise<ToolResult> {
  const timeoutSecs = params.timeoutSecs ?? 1200;
  const pollIntervalSecs = params.pollIntervalSecs ?? 30;
  const deadlineMs = Date.now() + timeoutSecs * 1000;
  let pollCount = 0;

  try {
    while (true) {
      const run = await githubGet<GitHubWorkflowRun>(
        `/actions/runs/${params.runId}`,
      );

      pollCount++;

      if (TERMINAL_STATUSES.has(run.status) || run.status === 'completed') {
        const jobsData = await githubGet<GitHubJobsResponse>(
          `/actions/runs/${params.runId}/jobs`,
          { per_page: '100' },
        );

        const jobs = jobsData.jobs.map((job) => ({
          databaseId: job.id,
          name: job.name,
          status: job.status,
          conclusion: job.conclusion,
          startedAt: job.started_at,
          completedAt: job.completed_at,
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  ...mapRun(run),
                  jobs,
                  pollCount,
                  timedOut: false,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      const remainingMs = deadlineMs - Date.now();
      if (remainingMs <= 0) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  ...mapRun(run),
                  jobs: [],
                  pollCount,
                  timedOut: true,
                  timeoutSecs,
                  message: `Run ${params.runId} did not complete within ${timeoutSecs}s (status: ${run.status}). Use ci_view_run to check current status.`,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      const waitMs = Math.min(pollIntervalSecs * 1000, remainingMs);
      await sleep(waitMs);
    }
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to wait for workflow run ${params.runId}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
