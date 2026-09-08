import { githubGet, postWithRetryOnAlreadyRunning } from '../github-api.js';
import { isAlreadyRunningError, isTimeoutError } from '../http-retry.js';
import { checkStaleMergeRef } from '../merge-ref-staleness.js';
import type { ToolResult } from '../types.js';

interface RerunParams {
  runId: number;
  failedOnly?: boolean;
  jobId?: number;
  jobName?: string;
  debug?: boolean;
}

interface GitHubJob {
  id: number;
  name: string;
  conclusion: string | null;
}

interface GitHubJobsResponse {
  jobs: GitHubJob[];
}

const JOBS_PER_PAGE = 100;

/**
 * Fetch every job on a run, paginating past GitHub's 100-per-page cap —
 * large matrix workflows (e.g. DB integration tests) can have well over 100
 * jobs, and a single unpaginated page would silently miss a match beyond
 * the first 100 (review finding on LS-9608). Mirrors fetchAllJobs in
 * retry-failed.ts.
 */
async function fetchAllJobs(runId: number): Promise<GitHubJob[]> {
  const all: GitHubJob[] = [];
  let page = 1;
  for (;;) {
    const { jobs } = await githubGet<GitHubJobsResponse>(
      `/actions/runs/${runId}/jobs`,
      { per_page: String(JOBS_PER_PAGE), page: String(page), filter: 'latest' },
    );
    all.push(...jobs);
    if (jobs.length < JOBS_PER_PAGE) break;
    page += 1;
  }
  return all;
}

/**
 * Resolve a job name to its numeric id via a case-insensitive substring
 * match against the run's job list — mirrors the jobName resolution already
 * used by ci_get_logs (logs.ts). Throws (caught by the caller's try/catch)
 * with a message naming the candidates on no match or an ambiguous match,
 * since a single-job rerun must target exactly one job.
 */
async function resolveJobIdByName(
  runId: number,
  jobName: string,
): Promise<number> {
  const jobs = await fetchAllJobs(runId);
  const nameLower = jobName.toLowerCase();
  const matches = jobs.filter((j) => j.name.toLowerCase().includes(nameLower));

  if (matches.length === 0) {
    throw new Error(
      `No job matching jobName "${jobName}" found in run ${runId}. ` +
        `Available jobs: ${jobs.map((j) => j.name).join(', ') || '(none)'}.`,
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `jobName "${jobName}" matched ${matches.length} jobs in run ${runId} — ` +
        `ambiguous. Matches: ${matches.map((j) => `${j.name} (${j.id})`).join(', ')}. ` +
        `Pass jobId instead to disambiguate.`,
    );
  }

  return matches[0].id;
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

    const effectiveJobId = params.jobId
      ? params.jobId
      : params.jobName
        ? await resolveJobIdByName(params.runId, params.jobName)
        : undefined;

    if (effectiveJobId) {
      // Rerun a specific job
      await postWithRetryOnAlreadyRunning(
        `/actions/jobs/${effectiveJobId}/rerun`,
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

    const staleMergeRefWarning = await checkStaleMergeRef(params.runId);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              runId: params.runId,
              jobId: effectiveJobId ?? null,
              jobName: params.jobName ?? null,
              scope: effectiveJobId
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
              ...(staleMergeRefWarning
                ? { warning: staleMergeRefWarning }
                : {}),
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // The retry wrapper (withRetryOnAlreadyRunning) already absorbed the
    // short-lived version of this race; a match here means the run is still
    // rejecting reruns after that budget — most likely trailing jobs (e.g.
    // "Summarize & Report", "Remove Merge Label on Failure") haven't been
    // scheduled/picked up yet even though the substantive build/test/E2E
    // jobs are done. rerun-failed-jobs gates on the run's overall status,
    // not any individual job's, so blindly re-guessing here wastes calls
    // (LS-9647) — hand the caller the cheap, definitive check instead of a
    // bare error: ci_wait_run already polls the run's top-level status,
    // which only reaches "completed" once every job, cleanup included, has
    // finished.
    if (isAlreadyRunningError(message)) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                runId: params.runId,
                status: 'not_yet_reschedulable',
                message,
                hint:
                  `Run ${params.runId} still rejects reruns as "already running" — this usually means trailing ` +
                  'jobs (cleanup/summarize steps) are still queued even though the substantive jobs finished. ' +
                  `Call ci_wait_run({ runId: ${params.runId} }) and re-invoke it per its hint until it returns ` +
                  'status: "completed" (that field only flips once every job on the run, including cleanup, is ' +
                  'done) — then retry this rerun call.',
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    // A client-side per-attempt timeout (LS-8704) — GitHub's rerun endpoint
    // was taking too long to respond rather than erroring outright. Without
    // this check the underlying request would have kept running until the
    // ci-server Lambda's own 30s hard timeout killed it, which the caller
    // sees as a raw, unparseable "Service Unavailable" transport error
    // instead of an actionable one. Safe to retry immediately — nothing was
    // mutated server-side by a request that never got a response.
    if (isTimeoutError(error)) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text:
              `Rerun request for run ${params.runId} timed out waiting for GitHub to respond ` +
              '(client-side guard, not a GitHub error) — safe to retry this same call immediately.',
          },
        ],
      };
    }

    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to rerun workflow run ${params.runId}: ${message}`,
        },
      ],
    };
  }
}
