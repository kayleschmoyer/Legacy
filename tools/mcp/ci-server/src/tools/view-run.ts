import { githubGet } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface ViewRunParams {
  runId: number;
  attempt?: number;
  includeJobs?: boolean;
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

function mapJob(job: GitHubJob) {
  return {
    databaseId: job.id,
    name: job.name,
    status: job.status,
    conclusion: job.conclusion,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    steps: job.steps?.map((s) => ({
      name: s.name,
      status: s.status,
      conclusion: s.conclusion,
      number: s.number,
    })),
  };
}

export async function viewRun(params: ViewRunParams): Promise<ToolResult> {
  try {
    const attemptSuffix = params.attempt ? `/attempts/${params.attempt}` : '';
    const run = await githubGet<GitHubWorkflowRun>(
      `/actions/runs/${params.runId}${attemptSuffix}`,
    );

    const result: Record<string, unknown> = mapRun(run);

    if (params.includeJobs !== false) {
      const jobsData = await githubGet<GitHubJobsResponse>(
        `/actions/runs/${params.runId}${attemptSuffix}/jobs`,
        { per_page: '100' },
      );
      result.jobs = jobsData.jobs.map(mapJob);
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to view workflow run ${params.runId}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
