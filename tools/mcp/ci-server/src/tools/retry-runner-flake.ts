import { retryFailed } from './retry-failed.js';
import { githubGet } from '../github-api.js';
import { fetchRunLogsRing } from '../logs.js';
import type { ToolResult } from '../types.js';

interface RetryRunnerFlakeParams {
  prNumber: number;
}

interface GitHubLabel {
  name: string;
}

interface GitHubIssue {
  labels: GitHubLabel[];
}

interface GitHubComment {
  body: string;
}

interface GitHubPull {
  head: { sha: string };
}

interface GitHubWorkflowRun {
  id: number;
  status: string;
}

interface GitHubRunsResponse {
  workflow_runs: GitHubWorkflowRun[];
}

interface GitHubJob {
  conclusion: string | null;
}

interface GitHubJobsResponse {
  total_count: number;
  jobs: GitHubJob[];
}

/** Must match the LABEL constant in .github/workflows/ci-orchestrator.yml verbatim. */
const RUNNER_FLAKE_LABEL = 'CI: Runner Flake';

/** Must match the bot comment body built in .github/workflows/ci-orchestrator.yml. */
const FLAKE_COMMENT_SIGNATURE = 'CI cancelled due to a runner restart';

/**
 * Must match the SHUTDOWN_SIGNATURE constant in
 * .github/actions/detect-runner-shutdown/action.yml verbatim — the stable
 * clause GitHub Actions writes to a job's log when a self-hosted runner is
 * torn down mid-job.
 */
const SHUTDOWN_LOG_SIGNATURE = 'runner has received a shutdown signal';

const RUN_ID_PATTERN = /\/actions\/runs\/(\d+)/;
const ORCHESTRATOR_WORKFLOW = 'ci-orchestrator.yml';
const JOBS_PER_PAGE = 100;

function noSignalResult(prNumber: number, reason: string): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text:
          `No runner-shutdown flake signal detected for PR #${prNumber}: ${reason} ` +
          `Use ci_rerun({ runId, withDiagnostics: true }) to manually retry after confirming the failure cause.`,
      },
    ],
  };
}

async function fetchAllJobs(runId: number): Promise<GitHubJob[]> {
  const all: GitHubJob[] = [];
  let page = 1;
  for (;;) {
    const data = await githubGet<GitHubJobsResponse>(
      `/actions/runs/${runId}/jobs`,
      { per_page: String(JOBS_PER_PAGE), page: String(page) },
    );
    all.push(...data.jobs);
    if (data.jobs.length < JOBS_PER_PAGE || all.length >= data.total_count) {
      break;
    }
    page += 1;
  }
  return all;
}

/**
 * Third detection layer (LS-9334). The label and bot comment are both
 * populated by the same ci-orchestrator.yml job ("⚡ Report Runner
 * Shutdown"), which can itself be skipped on a genuine mid-job runner death
 * (its gate historically only fired on an overall `cancelled` conclusion,
 * not the `failure` conclusion a cascade of downstream jobs produces —
 * see the job's header comment). When both signals are absent this falls
 * back to scanning the PR's most recent completed CI run's failed/cancelled
 * job logs directly for the same shutdown signature the orchestrator's own
 * detection uses, so the tool isn't blind to a shutdown just because the
 * artifacts that normally announce it were never emitted.
 *
 * Absence of the marker is deliberately treated as "no signal" (returns
 * undefined) rather than a guess — a genuine test failure must still be
 * refused, never silently retried.
 */
async function findShutdownRunFromLogs(
  prNumber: number,
): Promise<number | undefined> {
  const pull = await githubGet<GitHubPull>(`/pulls/${prNumber}`);

  // head_sha is a supported filter on this endpoint — scopes the result to
  // runs for the PR's current head commit only, so a stale failure from a
  // prior push can't be misattributed to the current CI state.
  const { workflow_runs: runs } = await githubGet<GitHubRunsResponse>(
    `/actions/workflows/${ORCHESTRATOR_WORKFLOW}/runs`,
    { head_sha: pull.head.sha, per_page: '10' },
  );

  // Runs are returned newest-first; only the most recent completed run is
  // relevant to "what does CI currently say about this PR".
  const latestCompleted = runs.find((run) => run.status === 'completed');
  if (!latestCompleted) return undefined;

  const jobs = await fetchAllJobs(latestCompleted.id);
  const hasFailedOrCancelledJob = jobs.some(
    (j) => j.conclusion === 'failure' || j.conclusion === 'cancelled',
  );
  if (!hasFailedOrCancelledJob) return undefined;

  const { priorityLines } = await fetchRunLogsRing(
    { runId: latestCompleted.id, failedOnly: true },
    1,
    (line) => line.includes(SHUTDOWN_LOG_SIGNATURE),
  );

  return priorityLines && priorityLines.length > 0
    ? latestCompleted.id
    : undefined;
}

/**
 * Detect-and-retry the recurring self-hosted-runner-shutdown flake in one call.
 * The repo's own ci-orchestrator.yml automation usually classifies this exact
 * failure with certainty — applying the "CI: Runner Flake" label and posting a
 * bot comment with a link to the run — so this tool keys off that existing
 * signal first instead of re-deriving the classification from raw logs. Only
 * when both of those artifacts are absent (LS-9334: the orchestrator's own
 * reporting job can be skipped on a genuine shutdown) does it fall back to
 * {@link findShutdownRunFromLogs}.
 */
export async function retryRunnerFlake(
  params: RetryRunnerFlakeParams,
): Promise<ToolResult> {
  if (
    !Number.isFinite(params.prNumber) ||
    !Number.isInteger(params.prNumber) ||
    params.prNumber <= 0
  ) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `prNumber must be a positive integer; received ${params.prNumber}.`,
        },
      ],
    };
  }

  try {
    const issue = await githubGet<GitHubIssue>(`/issues/${params.prNumber}`);
    const hasFlakeLabel = issue.labels.some(
      (label) => label.name === RUNNER_FLAKE_LABEL,
    );

    const comments = await githubGet<GitHubComment[]>(
      `/issues/${params.prNumber}/comments`,
    );

    // GitHub returns comments in ascending creation order, and a PR can
    // accumulate more than one flake+retry cycle — take the most recent
    // matching comment, not the first. The comment is preferred as the
    // source of truth for the run ID: the tool already parses it, and
    // unlike the label it cannot be edited away by label housekeeping.
    let runId: number | undefined;
    for (let i = comments.length - 1; i >= 0; i -= 1) {
      const body = comments[i]?.body ?? '';
      if (!body.includes(FLAKE_COMMENT_SIGNATURE)) continue;
      const match = RUN_ID_PATTERN.exec(body);
      if (match?.[1]) {
        runId = Number(match[1]);
        break;
      }
    }

    // Label and bot comment are independent sufficient signals, not a
    // conjunction — either one alone is enough to proceed with the retry.
    if (runId === undefined && !hasFlakeLabel) {
      // LS-9334: both artifacts the orchestrator's "Report Runner Shutdown"
      // job normally emits are missing — that job can itself be skipped on
      // a genuine shutdown (see findShutdownRunFromLogs). Fall back to
      // scanning the run's own logs before refusing.
      const shutdownRunId = await findShutdownRunFromLogs(params.prNumber);
      if (shutdownRunId === undefined) {
        return noSignalResult(
          params.prNumber,
          `neither the "${RUNNER_FLAKE_LABEL}" label nor a runner-shutdown bot ` +
            'comment with a parseable run ID was found on the PR, and no runner-shutdown ' +
            "signature was found in the failed/cancelled job logs of the PR's most recent CI run.",
        );
      }
      return retryFailed({ runId: shutdownRunId });
    }

    if (runId === undefined) {
      return noSignalResult(
        params.prNumber,
        `the "${RUNNER_FLAKE_LABEL}" label is present, but no bot comment with a ` +
          'parseable run ID was found.',
      );
    }

    return retryFailed({ runId });
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to check runner-flake signal for PR #${params.prNumber}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
