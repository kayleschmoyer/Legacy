import { markdownTable, minifiedJson } from '@legacy-sports/mcp-format';
import { resolveWorkflowId } from './list-runs.js';
import { githubGet } from '../github-api.js';
import { getRemainingLambdaMs } from '../lambda-budget.js';
import type { ToolResult } from '../types.js';

export type RunnerMinutesGroupBy = 'workflow' | 'label' | 'day';

interface RunnerMinutesParams {
  created?: string;
  workflows?: string[];
  groupBy: RunnerMinutesGroupBy;
}

interface RunSummary {
  id: number;
  name: string;
  created_at: string;
}

interface RunsPage {
  total_count: number;
  workflow_runs: RunSummary[];
}

export interface RunnerJob {
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  runner_name?: string | null;
  runner_group_name?: string | null;
  labels?: string[];
}

interface JobsPage {
  total_count: number;
  jobs: RunnerJob[];
}

const PER_PAGE = 100;
/** GitHub's list-runs endpoints never return past the 1,000th result of one query. */
const RUN_SEARCH_CAP = 1000;
const MAX_DAYS = 31;
const JOB_FETCH_CONCURRENCY = 8;
/** Stop this far ahead of the Lambda's hard kill so the error still reaches the caller. */
const LAMBDA_SAFETY_MS = 4_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const CREATED_RE = /^(\d{4}-\d{2}-\d{2})(?:\.\.(\d{4}-\d{2}-\d{2}))?$/;
const GITHUB_HOSTED_LABEL_RE = /^(ubuntu|windows|macos)-/;

/**
 * Expand `YYYY-MM-DD` or `YYYY-MM-DD..YYYY-MM-DD` into its UTC days. Runs are
 * listed one day at a time so a busy range stays under RUN_SEARCH_CAP per query.
 */
export function expandCreatedDays(created: string): string[] {
  const match = CREATED_RE.exec(created.trim());
  if (!match) {
    throw new Error(
      `created must be YYYY-MM-DD or YYYY-MM-DD..YYYY-MM-DD (got "${created}").`,
    );
  }
  const start = Date.parse(`${match[1]}T00:00:00Z`);
  const end = Date.parse(`${match[2] ?? match[1]}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    throw new Error(`created is not a valid ascending range: "${created}".`);
  }
  const dayCount = (end - start) / DAY_MS + 1;
  if (dayCount > MAX_DAYS) {
    throw new Error(
      `created spans ${dayCount} days; the maximum is ${MAX_DAYS}. Split the range.`,
    );
  }
  return Array.from({ length: dayCount }, (_, i) =>
    new Date(start + i * DAY_MS).toISOString().slice(0, 10),
  );
}

/**
 * Minutes a job actually spent on a runner, or 0 when it never ran on one.
 *
 * A job cancelled while still *queued* carries started_at and completed_at
 * with an EMPTY-STRING runner_name — its "duration" is queue time, so a job
 * queued for 24h would otherwise read as 1,440 runner minutes (LS-10342).
 * Only a non-empty runner_name plus a positive duration counts.
 */
export function jobRunnerMinutes(job: RunnerJob): number {
  if (!job.runner_name || !job.started_at || !job.completed_at) return 0;
  const ms = Date.parse(job.completed_at) - Date.parse(job.started_at);
  return ms > 0 ? ms / 60_000 : 0;
}

export function isGithubHosted(job: RunnerJob): boolean {
  if (
    job.runner_group_name === 'GitHub Actions' ||
    job.runner_name?.startsWith('GitHub Actions')
  ) {
    return true;
  }
  const labels = job.labels ?? [];
  return (
    labels.length > 0 && labels.every((l) => GITHUB_HOSTED_LABEL_RE.test(l))
  );
}

interface Bucket {
  selfHostedMinutes: number;
  githubHostedMinutes: number;
  jobs: number;
  runIds: Set<number>;
}

interface Aggregate {
  buckets: Map<string, Bucket>;
  runs: number;
  ranRuns: number;
  gatedOutRuns: number;
  queuedNeverRanJobs: number;
}

function newBucket(): Bucket {
  return {
    selfHostedMinutes: 0,
    githubHostedMinutes: 0,
    jobs: 0,
    runIds: new Set(),
  };
}

/**
 * Fold one run's jobs into the aggregate. A run only counts as having *ran*
 * when at least one job spent time on a runner: a gated-out `workflow_run`
 * execution lists every job as `skipped`, so its job count says nothing about
 * whether the suite ran (LS-10342).
 */
export function addRun(
  aggregate: Aggregate,
  run: RunSummary,
  jobs: readonly RunnerJob[],
  groupBy: RunnerMinutesGroupBy,
): void {
  aggregate.runs += 1;
  let ran = false;
  for (const job of jobs) {
    const minutes = jobRunnerMinutes(job);
    if (minutes === 0) {
      if (!job.runner_name && job.started_at && job.completed_at) {
        aggregate.queuedNeverRanJobs += 1;
      }
      continue;
    }
    ran = true;
    const key =
      groupBy === 'workflow'
        ? run.name
        : groupBy === 'day'
          ? run.created_at.slice(0, 10)
          : [...(job.labels ?? [])].sort().join(',') || '(no labels)';
    const bucket = aggregate.buckets.get(key) ?? newBucket();
    aggregate.buckets.set(key, bucket);
    if (isGithubHosted(job)) bucket.githubHostedMinutes += minutes;
    else bucket.selfHostedMinutes += minutes;
    bucket.jobs += 1;
    bucket.runIds.add(run.id);
  }
  if (ran) aggregate.ranRuns += 1;
  else if (jobs.length > 0 && jobs.every((j) => j.conclusion === 'skipped')) {
    aggregate.gatedOutRuns += 1;
  }
}

async function listRunsForDay(
  path: string,
  day: string,
  checkDeadline: () => void,
): Promise<RunSummary[]> {
  const runs: RunSummary[] = [];
  for (let page = 1; ; page++) {
    checkDeadline();
    const data = await githubGet<RunsPage>(path, {
      created: day,
      per_page: String(PER_PAGE),
      page: String(page),
    });
    if (data.total_count > RUN_SEARCH_CAP) {
      throw new Error(
        `${data.total_count} runs on ${day} exceeds GitHub's ${RUN_SEARCH_CAP}-result listing cap, so the total would be undercounted. Pass workflows to split the query.`,
      );
    }
    runs.push(...data.workflow_runs);
    if (data.workflow_runs.length < PER_PAGE || runs.length >= data.total_count)
      return runs;
  }
}

async function listJobs(
  runId: number,
  checkDeadline: () => void,
): Promise<RunnerJob[]> {
  const jobs: RunnerJob[] = [];
  for (let page = 1; ; page++) {
    checkDeadline();
    // filter=all: earlier attempts burned runner minutes too.
    const data = await githubGet<JobsPage>(`/actions/runs/${runId}/jobs`, {
      filter: 'all',
      per_page: String(PER_PAGE),
      page: String(page),
    });
    jobs.push(...data.jobs);
    if (data.jobs.length < PER_PAGE || jobs.length >= data.total_count)
      return jobs;
  }
}

const round = (minutes: number) => Math.round(minutes * 10) / 10;

/**
 * Runner-minutes aggregation mode of ci_list_runs (LS-10342): sums job
 * durations across every run created in a day/range, split self-hosted vs
 * GitHub-hosted. Any API failure fails the whole call — a partial sum (or
 * zeros) is indistinguishable from a real answer.
 */
export async function runnerMinutes(
  params: RunnerMinutesParams,
): Promise<ToolResult> {
  let processed = 0;
  let total = 0;
  try {
    if (!params.created) throw new Error('created is required with groupBy.');
    const days = expandCreatedDays(params.created);

    const deadline = Date.now() + getRemainingLambdaMs() - LAMBDA_SAFETY_MS;
    const checkDeadline = () => {
      if (Date.now() > deadline) {
        throw new Error(
          'ran out of time before every run was read. Narrow created to fewer days or pass workflows.',
        );
      }
    };

    const paths = params.workflows?.length
      ? await Promise.all(
          params.workflows.map(
            async (w) =>
              `/actions/workflows/${encodeURIComponent(await resolveWorkflowId(w))}/runs`,
          ),
        )
      : ['/actions/runs'];

    const runsById = new Map<number, RunSummary>();
    for (const path of new Set(paths)) {
      for (const day of days) {
        for (const run of await listRunsForDay(path, day, checkDeadline)) {
          runsById.set(run.id, run);
        }
      }
    }
    const runs = [...runsById.values()];
    total = runs.length;

    const aggregate: Aggregate = {
      buckets: new Map(),
      runs: 0,
      ranRuns: 0,
      gatedOutRuns: 0,
      queuedNeverRanJobs: 0,
    };
    let next = 0;
    const worker = async () => {
      while (next < runs.length) {
        const run = runs[next++];
        addRun(
          aggregate,
          run,
          await listJobs(run.id, checkDeadline),
          params.groupBy,
        );
        processed += 1;
      }
    };
    await Promise.all(
      Array.from({ length: JOB_FETCH_CONCURRENCY }, () => worker()),
    );

    const rows = [...aggregate.buckets.entries()]
      .map(([key, b]) => ({
        [params.groupBy]: key,
        selfHostedMin: round(b.selfHostedMinutes),
        githubHostedMin: round(b.githubHostedMinutes),
        jobs: b.jobs,
        runs: b.runIds.size,
      }))
      .sort(
        (a, b) =>
          b.selfHostedMin +
          b.githubHostedMin -
          (a.selfHostedMin + a.githubHostedMin),
      );
    const sum = (pick: (b: Bucket) => number) =>
      round([...aggregate.buckets.values()].reduce((n, b) => n + pick(b), 0));
    const summary = {
      created: params.created,
      selfHostedMin: sum((b) => b.selfHostedMinutes),
      githubHostedMin: sum((b) => b.githubHostedMinutes),
      runs: aggregate.runs,
      // Runs with >=1 job that spent time on a runner — the only "it ran" signal.
      ranRuns: aggregate.ranRuns,
      // Every job skipped (gated-out workflow_run): listed jobs, zero execution.
      gatedOutRuns: aggregate.gatedOutRuns,
      // Cancelled while queued (empty runner_name): excluded, queue time is not runner time.
      queuedNeverRanJobs: aggregate.queuedNeverRanJobs,
    };

    return {
      content: [
        {
          type: 'text',
          text:
            rows.length === 0
              ? minifiedJson(summary)
              : `${minifiedJson(summary)}\n\n${markdownTable(rows)}`,
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const rateLimited = /^GitHub API (403|429)\b/.test(message);
    const progress = total > 0 ? ` after ${processed}/${total} runs` : '';
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text:
            `Runner-minutes aggregation failed${progress}; no totals returned (a partial sum would undercount). ` +
            (rateLimited
              ? 'GitHub rate limit or permission denial — wait for the limit to reset, or narrow created/workflows. '
              : '') +
            message,
        },
      ],
    };
  }
}
