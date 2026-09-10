import { formatRunJobs } from '../format.js';
import { githubGet } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface ViewRunJobsParams {
  runId: number;
  attempt?: number;
  filter?:
    | 'failure'
    | 'success'
    | 'skipped'
    | 'cancelled'
    | 'in_progress'
    | 'queued'
    | 'pending';
  includeSteps?: boolean;
}

// Job *conclusion* values (failure/success/skipped/cancelled) only exist once
// a job is done, so they filter on `job.conclusion`. These are job *status*
// values instead — a job waiting for a runner to pick it up never has a
// conclusion — so they filter on `job.status` the same way `in_progress`
// already does (LS-9709: without this, finding the one stuck job in a large
// job dump meant eyeballing the whole list for `status: "queued"` by hand).
const STATUS_FILTERS = new Set(['in_progress', 'queued', 'pending']);

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
        STATUS_FILTERS.has(f) ? j.status === f : j.conclusion === f,
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
          text: formatRunJobs(params.runId, summary, mapped, includeSteps),
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
