import { githubGet } from '../github-api.js';
import type { ToolResult } from '../types.js';

// Hard per-call ceiling. This server runs on a Lambda whose configured
// timeout is 30s (terraform/main/lambda-mcp-ci.tf -> var.lambda_timeout,
// terraform/main/variables.tf), which is the real constraint — NOT the
// client-side ~60s MCP transport timeout a prior version of this constant
// assumed. A wait longer than the Lambda's own timeout gets the whole
// invocation SIGKILLed by AWS before it can return a response, which the
// caller sees as a raw "Service Unavailable" transport error rather than the
// clean { status: "in_progress", hint } snapshot below (LS-8429). 20s leaves
// headroom under the 30s hard limit for the credential-fetch/auth work that
// runs before this function is even invoked. Longer waits are re-armed by
// the caller re-invoking this tool.
const MAX_WAIT_SECONDS = 20;
const POLL_INTERVAL_MS = 5000;

interface WaitRunParams {
  runId: number;
  maxWaitSeconds?: number;
}

interface GitHubWorkflowRun {
  id: number;
  status: string;
  conclusion: string | null;
  run_number: number;
  html_url: string;
}

export function waitRunHint(runId: number): string {
  return (
    `Run is still in progress. Call ci_wait_run({ runId: ${runId} }) to continue waiting ` +
    `(each call waits up to ${MAX_WAIT_SECONDS}s and returns a status snapshot — never an ` +
    'error while the run is in progress). Do NOT re-dispatch the workflow.'
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Bounded wait for a workflow run to complete. Transport-safe replacement for
 * a single long-poll: each call blocks at most MAX_WAIT_SECONDS and returns a
 * { status: "in_progress" } snapshot (not an error) if the run has not
 * finished, so the caller re-arms with another call instead of losing an
 * in-flight long-poll to the MCP transport timeout.
 */
export async function waitRun(params: WaitRunParams): Promise<ToolResult> {
  const maxWaitSeconds = Math.min(
    params.maxWaitSeconds ?? MAX_WAIT_SECONDS,
    MAX_WAIT_SECONDS,
  );
  const deadlineMs = Date.now() + maxWaitSeconds * 1000;

  try {
    let run = await githubGet<GitHubWorkflowRun>(
      `/actions/runs/${params.runId}`,
    );
    while (run.status !== 'completed' && Date.now() < deadlineMs) {
      await sleep(
        Math.min(POLL_INTERVAL_MS, Math.max(deadlineMs - Date.now(), 1)),
      );
      try {
        run = await githubGet<GitHubWorkflowRun>(
          `/actions/runs/${params.runId}`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // 4xx errors are fatal (bad token, wrong run ID) — propagate immediately.
        if (/\b(401|403|404)\b/.test(msg)) throw err;
        console.error('[ci_wait_run] transient error polling run status:', err);
      }
    }

    const body: Record<string, unknown> = {
      runId: run.id,
      runNumber: run.run_number,
      url: run.html_url,
      status: run.status === 'completed' ? 'completed' : 'in_progress',
    };
    if (run.status === 'completed') {
      body.conclusion = run.conclusion;
    } else {
      body.hint = waitRunHint(params.runId);
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(body, null, 2) }],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to check run ${params.runId}: ${msg}`,
        },
      ],
    };
  }
}
