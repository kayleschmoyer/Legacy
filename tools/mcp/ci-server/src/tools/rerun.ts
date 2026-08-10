import { githubGet, postWithRetryOnAlreadyRunning } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface RerunParams {
  runId: number;
  failedOnly?: boolean;
  jobId?: number;
  debug?: boolean;
}

interface GitHubJob {
  id: number;
  conclusion: string | null;
}

interface GitHubJobsResponse {
  jobs: GitHubJob[];
}

/**
 * Whether `runId` currently has any job left `cancelled` by an upstream
 * dependency failure (LS-9212). GitHub's `rerun-failed-jobs` endpoint only
 * reschedules jobs with conclusion `failure` — a downstream required job
 * that never ran because its dependency failed is `cancelled`, not
 * `failure`, so it's silently left stranded rather than rescheduled, and
 * eventually times out with the run stuck `blocked`.
 *
 * Returns `false` (rather than throwing) on any lookup failure so a
 * transient jobs-list error never blocks the primary rerun call — the
 * caller falls back to the pre-existing failed-only behavior.
 */
async function hasCancelledDependencyJobs(runId: number): Promise<boolean> {
  try {
    const { jobs } = await githubGet<GitHubJobsResponse>(
      `/actions/runs/${runId}/jobs`,
      { per_page: '100', filter: 'latest' },
    );
    return jobs.some((job) => job.conclusion === 'cancelled');
  } catch {
    return false;
  }
}

export async function rerun(params: RerunParams): Promise<ToolResult> {
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
    let escalatedToFullRerun = false;

    if (params.jobId) {
      // Rerun a specific job
      await postWithRetryOnAlreadyRunning(
        `/actions/jobs/${params.jobId}/rerun`,
      );
    } else if (params.failedOnly !== false) {
      // GitHub's rerun-failed-jobs endpoint only reschedules jobs with
      // conclusion `failure`; downstream required jobs left `cancelled` by
      // an upstream dependency failure are never rescheduled and eventually
      // time out (LS-9212). Detect that case and escalate to a full rerun
      // instead, which is the only way to guarantee cancelled dependents
      // get rescheduled.
      escalatedToFullRerun = await hasCancelledDependencyJobs(params.runId);

      await postWithRetryOnAlreadyRunning(
        escalatedToFullRerun
          ? `/actions/runs/${params.runId}/rerun`
          : `/actions/runs/${params.runId}/rerun-failed-jobs`,
        params.debug ? { enable_debug_logging: true } : undefined,
      );
    } else {
      // Rerun entire run
      await postWithRetryOnAlreadyRunning(
        `/actions/runs/${params.runId}/rerun`,
        params.debug ? { enable_debug_logging: true } : undefined,
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              runId: params.runId,
              jobId: params.jobId ?? null,
              scope: params.jobId
                ? 'job'
                : params.failedOnly === false
                  ? 'run'
                  : escalatedToFullRerun
                    ? 'run (escalated from failed-jobs)'
                    : 'failed-jobs',
              debug: params.debug ?? false,
              message: escalatedToFullRerun
                ? 'Rerun requested successfully. Escalated to a full run rerun because ' +
                  'this run had job(s) left `cancelled` by an upstream dependency failure ' +
                  '— rerun-failed-jobs would not have rescheduled them (LS-9212).'
                : 'Rerun requested successfully.',
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
          text: `Failed to rerun workflow run ${params.runId}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
