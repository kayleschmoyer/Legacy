import { githubGet } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface ViewRunJobsParams {
  runId: number;
  attempt?: number;
  filter?: 'failure' | 'success' | 'skipped' | 'cancelled' | 'in_progress';
  includeSteps?: boolean;
}

interface GitHubJobStep {
  name: string;
  status: string;
  conclusion: string | null;
  number: number;
  started_at: string | null;
  completed_at: string | null;
}

interface GitHubJob {
  id: number;
  run_id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  steps?: GitHubJobStep[];
}

interface GitHubJobsResponse {
  total_count: number;
  jobs: GitHubJob[];
}

function mapJob(job: GitHubJob, includeSteps: boolean) {
  const mapped: Record<string, unknown> = {
    databaseId: job.id,
    name: job.name,
    status: job.status,
    conclusion: job.conclusion,
    startedAt: job.started_at,
    completedAt: job.completed_at,
  };
  if (includeSteps && job.steps) {
    mapped.steps = job.steps.map((s) => ({
      number: s.number,
      name: s.name,
      status: s.status,
      conclusion: s.conclusion,
    }));
  }
  return mapped;
}

export async function viewRunJobs(
  params: ViewRunJobsParams,
): Promise<ToolResult> {
  try {
    const attemptSuffix = params.attempt ? `/attempts/${params.attempt}` : '';
    const includeSteps = params.includeSteps ?? false;

    // Fetch all jobs (max 100 per page; most runs have far fewer)
    const jobsData = await githubGet<GitHubJobsResponse>(
      `/actions/runs/${params.runId}${attemptSuffix}/jobs`,
      { per_page: '100', filter: 'latest' },
    );

    let jobs = jobsData.jobs;
    if (params.filter) {
      const f = params.filter;
      jobs = jobs.filter((j) =>
        f === 'in_progress' ? j.status === 'in_progress' : j.conclusion === f,
      );
    }

    const mapped = jobs.map((j) => mapJob(j, includeSteps));

    const summary = {
      total: jobsData.total_count,
      returned: mapped.length,
      passed: jobsData.jobs.filter((j) => j.conclusion === 'success').length,
      failed: jobsData.jobs.filter((j) => j.conclusion === 'failure').length,
      cancelled: jobsData.jobs.filter((j) => j.conclusion === 'cancelled')
        .length,
      skipped: jobsData.jobs.filter((j) => j.conclusion === 'skipped').length,
      inProgress: jobsData.jobs.filter((j) => j.status === 'in_progress')
        .length,
      allPassed:
        jobsData.jobs.length > 0 &&
        jobsData.jobs.every((j) => j.conclusion === 'success'),
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { runId: params.runId, summary, jobs: mapped },
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
          text: `Failed to list jobs for run ${params.runId}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
