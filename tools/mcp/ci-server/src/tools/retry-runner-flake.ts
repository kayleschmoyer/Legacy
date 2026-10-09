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
  base?: { ref: string };
}

interface GitHubWorkflowRun {
  id: number;
  status: string;
  head_sha: string;
  event?: string;
  created_at?: string;
  run_started_at?: string;
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

/**
 * The shortest `retention-days` the CI workflows use for the build artifacts
 * later jobs download. A run older than this has had its artifacts expire, so
 * a rerun's downstream shards fail on infrastructure rather than on the code.
 */
const ARTIFACT_RETENTION_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

function staleRunResult(
  prNumber: number,
  runId: number,
  currentHeadSha: string,
  runHeadSha: string,
): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text:
          `Run ${runId}, resolved from PR #${prNumber}'s "${RUNNER_FLAKE_LABEL}" label/comment, ` +
          `is stale: it belongs to head ${runHeadSha}, but the PR's current head is ${currentHeadSha}. ` +
          'Refusing to rerun a run that has already been superseded by later commits. ' +
          "Find the PR's actual current failing run (ci_list_runs({ branch, limit: 1 }) or " +
          'github_pr_diagnose) and call ci_retry_failed({ runId }) / ci_rerun({ runId }) against it directly.',
      },
    ],
  };
}

function staleSnapshotResult(
  prNumber: number,
  runId: number,
  reason: string,
): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text:
          `Run ${runId} for PR #${prNumber} cannot be safely rerun: ${reason} ` +
          'Rerunning would replay an out-of-date snapshot, and its result (including any ' +
          '"CI: ... Failure" label the orchestrator applies) would not reflect the PR\'s live state. ' +
          'Update the branch (merge/rebase the base into it and push) or dispatch a fresh run ' +
          'with ci_dispatch_workflow, then investigate that run instead.',
      },
    ],
  };
}

/**
 * Refuse reruns of a run whose `refs/pull/N/merge` snapshot is out of date
 * (LS-10269). GitHub's rerun endpoints reuse the original checked-out merge
 * ref and the original run's artifacts, so a rerun is only meaningful while
 * (a) the run's artifacts have not expired and (b) the base branch has not
 * advanced since the run started. Returns a refusal, or undefined when the
 * rerun is safe. The base-movement lookup fails open — an API hiccup must not
 * block a legitimate flake retry — but the age check uses data already in hand.
 */
async function checkSnapshotFresh(
  prNumber: number,
  runId: number,
): Promise<ToolResult | undefined> {
  const run = await githubGet<GitHubWorkflowRun>(`/actions/runs/${runId}`);
  const startedAt = run.run_started_at ?? run.created_at;
  if (!startedAt) return undefined;

  const ageMs = Date.now() - new Date(startedAt).getTime();
  if (ageMs > ARTIFACT_RETENTION_DAYS * MS_PER_DAY) {
    return staleSnapshotResult(
      prNumber,
      runId,
      `it started ${startedAt}, longer ago than the ${ARTIFACT_RETENTION_DAYS}-day build-artifact retention window, so the artifacts its jobs need have expired.`,
    );
  }

  if (run.event !== 'pull_request') return undefined;
  try {
    const pull = await githubGet<GitHubPull>(`/pulls/${prNumber}`);
    const baseRef = pull.base?.ref;
    if (!baseRef) return undefined;
    const newer = await githubGet<unknown[]>('/commits', {
      sha: baseRef,
      since: startedAt,
      per_page: '1',
    });
    if (Array.isArray(newer) && newer.length > 0) {
      return staleSnapshotResult(
        prNumber,
        runId,
        `the base branch "${baseRef}" has advanced since the run started (${startedAt}), so its refs/pull/${prNumber}/merge snapshot is stale.`,
      );
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * The label/comment resolved below can point at a run from an earlier push —
 * neither artifact is invalidated when a new commit lands, so by the time a
 * later commit's own failure is being investigated, a stale label/comment
 * from an earlier flake can still resolve to a run that no longer reflects
 * the PR's current head (LS-9807). Verify head_sha equality before acting on
 * a label/comment-resolved run id.
 */
async function runMatchesCurrentHead(
  prNumber: number,
  runId: number,
): Promise<{ matches: boolean; currentHeadSha: string; runHeadSha: string }> {
  const [pull, run] = await Promise.all([
    githubGet<GitHubPull>(`/pulls/${prNumber}`),
    githubGet<GitHubWorkflowRun>(`/actions/runs/${runId}`),
  ]);
  return {
    matches: pull.head.sha === run.head_sha,
    currentHeadSha: pull.head.sha,
    runHeadSha: run.head_sha,
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
      const stale = await checkSnapshotFresh(params.prNumber, shutdownRunId);
      if (stale) return stale;
      return retryFailed({ runId: shutdownRunId });
    }

    if (runId === undefined) {
      return noSignalResult(
        params.prNumber,
        `the "${RUNNER_FLAKE_LABEL}" label is present, but no bot comment with a ` +
          'parseable run ID was found.',
      );
    }

    const headCheck = await runMatchesCurrentHead(params.prNumber, runId);
    if (!headCheck.matches) {
      return staleRunResult(
        params.prNumber,
        runId,
        headCheck.currentHeadSha,
        headCheck.runHeadSha,
      );
    }

    const stale = await checkSnapshotFresh(params.prNumber, runId);
    if (stale) return stale;

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
