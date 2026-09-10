import { minifiedJson } from '@legacy-sports/mcp-format';
import { githubGet, githubPost } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface ForceCancelRunParams {
  runId: number;
  confirmNormalCancelFailed?: boolean;
  maxWaitSeconds?: number;
}

interface GitHubWorkflowRun {
  id: number;
  status: string;
  conclusion: string | null;
}

// This server is Lambda-hosted with a 30s execution timeout (same constraint
// documented in unwedge-orchestrator.ts/wait-run.ts) — bound polling well
// under that so a slow-to-terminate run degrades to a resumable "cancelling"
// response instead of the Lambda getting SIGKILLed mid-poll.
const MAX_POLL_SECONDS = 20;
const POLL_INTERVAL_MS = 3000;

function errorResult(text: string): ToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

function jsonResult(body: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: 'text', text: minifiedJson(body) }],
  };
}

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll until the run reaches `completed`, or the wait budget runs out.
 * Mirrors unwedge-orchestrator.ts's pollForCancellation.
 */
async function pollUntilTerminal(
  runId: number,
  maxWaitSeconds: number,
): Promise<GitHubWorkflowRun> {
  const deadlineMs = Date.now() + maxWaitSeconds * 1000;
  let run = await githubGet<GitHubWorkflowRun>(`/actions/runs/${runId}`);
  while (run.status !== 'completed' && Date.now() < deadlineMs) {
    await sleep(
      Math.min(POLL_INTERVAL_MS, Math.max(deadlineMs - Date.now(), 1)),
    );
    run = await githubGet<GitHubWorkflowRun>(`/actions/runs/${runId}`);
  }
  return run;
}

/**
 * Force-terminate a run that GitHub's normal cancel endpoint cannot evict —
 * e.g. a job queued for a self-hosted runner that has already shut down, so
 * the graceful cancel signal has no runner left to deliver it to (LS-9709,
 * the ci_cancel_run gap from the LS-9710 incident: two normal cancels 18
 * minutes apart both returned "Cancellation requested" without the job ever
 * actually terminating).
 *
 * Deliberately gated behind `confirmNormalCancelFailed: true` rather than
 * being a drop-in replacement for `ci_cancel_run` — `POST .../force-cancel`
 * is a more disruptive operation (GitHub's docs describe it as a last
 * resort), so this refuses to run until the caller states a normal cancel
 * was already attempted and didn't work. It also never trusts GitHub's
 * "request accepted" response on its own: like `ci_cancel_run`, it re-fetches
 * the run afterward, but goes further by polling until the run actually
 * reaches a terminal state (or the poll budget is spent) instead of reporting
 * whatever status a single immediate re-GET happens to catch.
 */
export async function forceCancelRun(
  params: ForceCancelRunParams,
): Promise<ToolResult> {
  if (
    !Number.isFinite(params.runId) ||
    !Number.isInteger(params.runId) ||
    params.runId <= 0
  ) {
    return errorResult(
      `runId must be a positive integer; received ${params.runId}. ` +
        `Use the "id" field from ci_list_runs output ("databaseId" is an alias for the same value).`,
    );
  }

  if (params.confirmNormalCancelFailed !== true) {
    return errorResult(
      'ci_force_cancel_run refuses to run without confirmNormalCancelFailed: true. ' +
        `Try ci_cancel_run({ runId: ${params.runId} }) first — force-cancel is a more disruptive operation ` +
        '(GitHub reserves it for runs a normal cancel cannot evict, e.g. a job queued for a self-hosted runner ' +
        'that has already shut down) and is not a default substitute for a normal cancel. Once a normal cancel ' +
        `has been requested and the run is still not terminating, retry as ci_force_cancel_run({ runId: ${params.runId}, confirmNormalCancelFailed: true }).`,
    );
  }

  const maxWaitSeconds = Math.min(
    params.maxWaitSeconds ?? MAX_POLL_SECONDS,
    MAX_POLL_SECONDS,
  );

  let before: GitHubWorkflowRun;
  try {
    before = await githubGet<GitHubWorkflowRun>(
      `/actions/runs/${params.runId}`,
    );
  } catch (error) {
    return errorResult(
      `Failed to look up run ${params.runId} before force-cancelling: ${errMsg(error)}`,
    );
  }

  if (before.status === 'completed') {
    return jsonResult({
      status: 'already-completed',
      runId: params.runId,
      conclusion: before.conclusion,
      message: `Run ${params.runId} has already completed with conclusion "${before.conclusion}" — nothing to force-cancel.`,
    });
  }

  try {
    await githubPost(`/actions/runs/${params.runId}/force-cancel`);
  } catch (error) {
    const msg = errMsg(error);
    const is409 = msg.includes('GitHub API 409');
    return errorResult(
      is409
        ? `Cannot force-cancel run ${params.runId}: it has already completed (HTTP 409 from GitHub).`
        : `Force-cancel request failed for run ${params.runId}: ${msg}`,
    );
  }

  let after: GitHubWorkflowRun;
  try {
    after = await pollUntilTerminal(params.runId, maxWaitSeconds);
  } catch (error) {
    return errorResult(
      `Force-cancel was requested for run ${params.runId}, but confirming its termination failed: ${errMsg(error)}. ` +
        `The force-cancel request itself was already accepted by GitHub — call ci_force_cancel_run({ runId: ${params.runId}, confirmNormalCancelFailed: true }) ` +
        'again to retry confirmation.',
    );
  }

  if (after.status !== 'completed') {
    return jsonResult({
      status: 'cancelling',
      runId: params.runId,
      hint:
        `Force-cancel was accepted but run ${params.runId} had not transitioned to "completed" after ` +
        `${maxWaitSeconds}s of polling. Call ci_force_cancel_run({ runId: ${params.runId}, confirmNormalCancelFailed: true }) ` +
        'again to keep polling — force-cancel is idempotent against an already-cancelling run, so this both ' +
        're-requests it and continues waiting rather than reporting a false "requested" result.',
    });
  }

  const terminated = after.conclusion === 'cancelled';
  return jsonResult({
    status: terminated ? 'terminated' : 'completed-otherwise',
    runId: params.runId,
    conclusion: after.conclusion,
    message: terminated
      ? `Run ${params.runId} was force-cancelled and confirmed terminated (status: "completed", conclusion: "cancelled").`
      : `Run ${params.runId} reached a terminal state ("${after.conclusion}") that is not "cancelled" — it likely ` +
        'completed on its own between the force-cancel request and this confirmation poll.',
  });
}
