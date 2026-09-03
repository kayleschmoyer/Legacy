import { LOGGER } from '@legacy-sports/logging';
import { minifiedJson } from '@legacy-sports/mcp-format';

import { githubGet, githubPost } from '../github-api.js';
import type { ToolResult } from '../types.js';

const WORKFLOW_FILE = 'ci-orchestrator.yml';
const CI_RUN_LABEL = 'ci:run';

// Pending 0-job runs younger than this are treated as "maybe still
// registering its jobs" rather than wedged. Genuine wedges observed in
// LS-9587's recurrences (LS-9528/PR#7232, LS-9492/PR#7271, LS-9293/PR#7458)
// held the orchestrator-<PR#> concurrency group for well over 5 minutes —
// this default trades a small amount of recovery latency for not cancelling
// a run that would have registered its jobs a few seconds later.
const DEFAULT_STALE_AFTER_SECONDS = 300;

// Hard per-call ceiling, same rationale as ci_wait_run/ci_dispatch_workflow
// (see their headers): this server is Lambda-hosted with a 30s execution
// timeout. This tool does several discovery GETs (PR lookup, run list, jobs
// check) before it even starts polling for cancellation, so its own poll
// budget is set lower than ci_wait_run's 20s to leave headroom.
const MAX_POLL_SECONDS = 12;
const POLL_INTERVAL_MS = 3000;

const PENDING_STATUSES = new Set(['queued', 'pending', 'waiting', 'requested']);

interface UnwedgeOrchestratorParams {
  prNumber: number;
  runId?: number;
  staleAfterSeconds?: number;
  maxWaitSeconds?: number;
}

interface GitHubPull {
  head: { sha: string; ref: string };
}

interface GitHubWorkflowRun {
  id: number;
  status: string;
  conclusion: string | null;
  created_at: string;
  head_sha: string;
}

interface GitHubRunsResponse {
  workflow_runs: GitHubWorkflowRun[];
}

interface GitHubJobsResponse {
  total_count: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function hasZeroJobs(runId: number): Promise<boolean> {
  const jobs = await githubGet<GitHubJobsResponse>(
    `/actions/runs/${runId}/jobs`,
    { per_page: '1' },
  );
  return jobs.total_count === 0;
}

/**
 * Find the stalest pending, 0-job orchestrator run for the PR's current head
 * SHA — the signature of the ci-orchestrator.yml concurrency-group wedge
 * (LS-7752): a run enters `pending`, holding the `orchestrator-<PR#>` group
 * (cancel-in-progress: false) without ever registering jobs, so CI Gate never
 * posts for the SHA. Only returns a run older than `staleAfterSeconds` to
 * avoid flagging a run that simply hasn't started its jobs yet.
 */
// Runs are returned newest-first, so every run for the PR's current head SHA
// is clustered at the front of the list — a page with zero matches means
// we've walked past all activity for this SHA into strictly older pushes,
// which can't share it. Bounded by wall-clock time rather than a fixed page
// count (same pattern as ci_wait_run/ci_dispatch_workflow) so a branch with
// an unusually long run history for one SHA degrades to "give up and report
// no wedge found" instead of ever exceeding the Lambda's execution budget.
const RUNS_PER_PAGE = 100;
const DISCOVERY_MAX_SECONDS = 15;

async function findAllRunsForHeadSha(
  headRef: string,
  headSha: string,
): Promise<GitHubWorkflowRun[]> {
  const deadlineMs = Date.now() + DISCOVERY_MAX_SECONDS * 1000;
  const matches: GitHubWorkflowRun[] = [];
  let page = 1;
  while (Date.now() < deadlineMs) {
    const data = await githubGet<GitHubRunsResponse>(
      `/actions/workflows/${WORKFLOW_FILE}/runs`,
      { branch: headRef, per_page: String(RUNS_PER_PAGE), page: String(page) },
    );
    const pageMatches = data.workflow_runs.filter(
      (run) => run.head_sha === headSha,
    );
    matches.push(...pageMatches);

    const isLastPage = data.workflow_runs.length < RUNS_PER_PAGE;
    if (isLastPage || pageMatches.length === 0) break;
    page += 1;
  }
  return matches;
}

async function findWedgedRun(
  prNumber: number,
  staleAfterSeconds: number,
): Promise<GitHubWorkflowRun | null> {
  const pull = await githubGet<GitHubPull>(`/pulls/${prNumber}`);
  const headSha = pull.head.sha;
  const headRef = pull.head.ref;

  const runsForHeadSha = await findAllRunsForHeadSha(headRef, headSha);

  const now = Date.now();
  const candidates = runsForHeadSha.filter(
    (run) =>
      PENDING_STATUSES.has(run.status) &&
      now - new Date(run.created_at).getTime() >= staleAfterSeconds * 1000,
  );

  for (const candidate of candidates) {
    if (await hasZeroJobs(candidate.id)) {
      return candidate;
    }
  }
  return null;
}

async function cancelRunTolerant(runId: number): Promise<void> {
  try {
    await githubPost(`/actions/runs/${runId}/cancel`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // 409 means the run already completed (raced us) — fall through to
    // polling, which will pick up its actual terminal conclusion.
    if (!msg.includes('GitHub API 409')) throw error;
  }
}

async function pollForCancellation(
  runId: number,
  maxWaitSeconds: number,
): Promise<{ conclusion: string | null; timedOut: boolean }> {
  const deadlineMs = Date.now() + maxWaitSeconds * 1000;
  let run = await githubGet<GitHubWorkflowRun>(`/actions/runs/${runId}`);
  while (run.status !== 'completed' && Date.now() < deadlineMs) {
    await sleep(
      Math.min(POLL_INTERVAL_MS, Math.max(deadlineMs - Date.now(), 1)),
    );
    try {
      run = await githubGet<GitHubWorkflowRun>(`/actions/runs/${runId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // 4xx errors are fatal (bad token, wrong run ID) — propagate immediately.
      if (/\b(401|403|404)\b/.test(msg)) throw err;
      LOGGER.error(
        '[ci_unwedge_orchestrator] transient error polling run status:',
        err instanceof Error ? err : msg,
      );
    }
  }
  return {
    conclusion: run.status === 'completed' ? run.conclusion : null,
    timedOut: run.status !== 'completed',
  };
}

/**
 * Apply the ci:run label rather than dispatching ci-orchestrator.yml
 * directly — ci-run-label.yml's "Dispatch CI Orchestrator for ci:run" job
 * routes the redispatch through workflow_dispatch specifically so it never
 * re-enters the orchestrator-<PR#> concurrency group we just freed
 * (.github/workflows/ci-run-label.yml header comment).
 */
async function redispatchViaLabel(prNumber: number): Promise<void> {
  await githubPost(`/issues/${prNumber}/labels`, { labels: [CI_RUN_LABEL] });
}

function jsonResult(body: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: 'text', text: minifiedJson(body) }],
  };
}

/**
 * Detect and recover a wedged ci-orchestrator.yml run in one call, replacing
 * the raw `gh run list` / `gh api .../jobs` / `gh run view` fallback (LS-9587).
 *
 * Two entry modes:
 *  - Fresh (no `runId`): discover the wedged run for `prNumber`'s current
 *    head SHA, cancel it, then poll for confirmed cancellation.
 *  - Resume (`runId` set, from a prior `{ status: "cancelling" }` response):
 *    skip discovery and re-cancellation, only poll for confirmed
 *    cancellation, then redispatch.
 *
 * Every response is a structured, non-error snapshot except on a genuine
 * failure (bad token, PR not found, etc.) — mirrors ci_wait_run's
 * never-throw-while-pending contract.
 */
export async function unwedgeOrchestrator(
  params: UnwedgeOrchestratorParams,
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

  const staleAfterSeconds =
    params.staleAfterSeconds ?? DEFAULT_STALE_AFTER_SECONDS;
  const maxWaitSeconds = Math.min(
    params.maxWaitSeconds ?? MAX_POLL_SECONDS,
    MAX_POLL_SECONDS,
  );

  try {
    let runId = params.runId;

    if (runId === undefined) {
      const wedged = await findWedgedRun(params.prNumber, staleAfterSeconds);
      if (!wedged) {
        return jsonResult({
          status: 'clean',
          prNumber: params.prNumber,
          message:
            `No wedged (pending, 0-job, older than ${staleAfterSeconds}s) ` +
            `orchestrator run found for PR #${params.prNumber}'s current head SHA.`,
        });
      }
      runId = wedged.id;
      await cancelRunTolerant(runId);
    }

    const { conclusion, timedOut } = await pollForCancellation(
      runId,
      maxWaitSeconds,
    );

    if (timedOut) {
      return jsonResult({
        status: 'cancelling',
        prNumber: params.prNumber,
        runId,
        hint:
          `Cancellation requested but not yet confirmed. Call ` +
          `ci_unwedge_orchestrator({ prNumber: ${params.prNumber}, runId: ${runId} }) ` +
          'to continue waiting — this will not re-discover or re-cancel, only poll and ' +
          'redispatch once the cancellation lands.',
      });
    }

    if (conclusion !== 'cancelled') {
      // The run reached a terminal state on its own (e.g. it started
      // registering jobs and finished normally) before our cancel took
      // effect — it was not actually wedged, so there is nothing to
      // redispatch.
      return jsonResult({
        status: 'unnecessary',
        prNumber: params.prNumber,
        runId,
        conclusion,
        message: `Run ${runId} completed with conclusion "${conclusion}" instead of being cancelled — it was not actually wedged; no redispatch needed.`,
      });
    }

    await redispatchViaLabel(params.prNumber);

    return jsonResult({
      status: 'redispatched',
      prNumber: params.prNumber,
      cancelledRunId: runId,
      message:
        `Cancelled wedged run ${runId} and applied the "${CI_RUN_LABEL}" label to dispatch ` +
        `a fresh ${WORKFLOW_FILE} run. Use ci_list_runs({ workflow: "${WORKFLOW_FILE}", branch: "<branch>" }) ` +
        'to confirm the new run appears.',
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to unwedge orchestrator for PR #${params.prNumber}: ${msg}`,
        },
      ],
    };
  }
}
