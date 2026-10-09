import { LOGGER } from '@legacy-sports/logging';

import { minifiedJson } from '@legacy-sports/mcp-format';
import { githubGet } from '../github-api.js';
import { getRemainingLambdaMs } from '../lambda-budget.js';
import { type GitHubJob, resolveJobsByName } from '../logs.js';
import type { ToolResult } from '../types.js';

// User-facing per-call ceiling. This server runs on a Lambda whose
// configured timeout is 30s (terraform/main/lambda-mcp-ci.tf ->
// var.lambda_timeout, terraform/main/variables.tf), which is the real
// constraint — NOT the client-side ~60s MCP transport timeout a prior
// version of this constant assumed. A wait longer than the Lambda's own
// timeout gets the whole invocation SIGKILLed by AWS before it can return a
// response, which the caller sees as a raw "Service Unavailable" transport
// error rather than the clean { status: "in_progress", hint } snapshot below
// (LS-8429).
const MAX_WAIT_SECONDS = 20;
const POLL_INTERVAL_MS = 5000;
// Reserved for response serialization + the Streamable HTTP write after the
// poll loop ends. A fixed 20s ceiling alone isn't enough: the pre-handler
// auth/credential-fetch work (lambda.ts) eats into the same 30s budget by a
// variable amount (cold starts, GitHub App token latency), so a naive 20s
// wait can still get SIGKILLed when that overhead runs long — exactly the
// regression reported against the first fix for this ticket. Clamping the
// wait to the Lambda's *actual* remaining time (via getRemainingLambdaMs)
// minus this margin fixes that; outside Lambda it's a no-op (Infinity).
const RESPONSE_MARGIN_MS = 5000;

interface WaitRunParams {
  runId: number;
  maxWaitSeconds?: number;
  /**
   * Wait for this one job (case-insensitive exact, else substring match —
   * same resolution as ci_get_logs.jobName) instead of the whole run, so
   * trailing report/cleanup jobs don't keep the caller waiting (LS-10264).
   */
  jobName?: string;
}

interface GitHubJobsResponse {
  jobs: GitHubJob[];
}

interface GitHubWorkflowRun {
  id: number;
  status: string;
  conclusion: string | null;
  run_number: number;
  html_url: string;
}

export function waitRunHint(runId: number, jobName?: string): string {
  const call = jobName
    ? `ci_wait_run({ runId: ${runId}, jobName: ${JSON.stringify(jobName)} })`
    : `ci_wait_run({ runId: ${runId} })`;
  return (
    `${jobName ? `Job "${jobName}"` : 'Run'} is still in progress. Call ${call} to continue waiting ` +
    `(each call waits up to ${MAX_WAIT_SECONDS}s and returns a status snapshot — never an ` +
    'error while the run is in progress). Do NOT re-dispatch the workflow.'
  );
}

/**
 * Resolve `jobName` to exactly one job in the run. Zero matches throws with
 * the run's job names listed; multiple matches throw AmbiguousJobNameError
 * (which lists every candidate).
 */
async function resolveJob(runId: number, jobName: string): Promise<GitHubJob> {
  const data = await githubGet<GitHubJobsResponse>(
    `/actions/runs/${runId}/jobs`,
    { per_page: '100', filter: 'latest' },
  );
  const matches = resolveJobsByName(data.jobs, jobName);
  if (matches.length === 0) {
    const names = data.jobs.map((j) => `"${j.name}"`).join(', ');
    throw new Error(
      `jobName "${jobName}" matches no job in run ${runId}. Candidate jobs: ${names || '(none yet)'}`,
    );
  }
  return matches[0];
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
  const requestedMs =
    Math.min(params.maxWaitSeconds ?? MAX_WAIT_SECONDS, MAX_WAIT_SECONDS) *
    1000;
  const lambdaSafeMs = Math.max(getRemainingLambdaMs() - RESPONSE_MARGIN_MS, 0);
  const maxWaitMs = Math.min(requestedMs, lambdaSafeMs);
  const deadlineMs = Date.now() + maxWaitMs;

  try {
    let run = await githubGet<GitHubWorkflowRun>(
      `/actions/runs/${params.runId}`,
    );
    let job = params.jobName
      ? await resolveJob(params.runId, params.jobName)
      : undefined;
    const isDone = (): boolean =>
      job ? job.status === 'completed' : run.status === 'completed';
    while (!isDone() && Date.now() < deadlineMs) {
      await sleep(
        Math.min(POLL_INTERVAL_MS, Math.max(deadlineMs - Date.now(), 1)),
      );
      try {
        run = await githubGet<GitHubWorkflowRun>(
          `/actions/runs/${params.runId}`,
        );
        if (params.jobName) {
          job = await resolveJob(params.runId, params.jobName);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // 4xx errors are fatal (bad token, wrong run ID) — propagate immediately.
        if (/\b(401|403|404)\b/.test(msg) || /^jobName "/.test(msg)) {
          throw err;
        }
        LOGGER.error(
          '[ci_wait_run] transient error polling run status:',
          err instanceof Error ? err : msg,
        );
      }
    }

    const body: Record<string, unknown> = {
      runId: run.id,
      runNumber: run.run_number,
      url: run.html_url,
      status: isDone() ? 'completed' : 'in_progress',
    };
    if (job) {
      body.jobId = job.id;
      body.jobName = job.name;
      body.runStatus = run.status;
    }
    if (isDone()) {
      body.conclusion = job ? job.conclusion : run.conclusion;
    } else {
      body.hint = waitRunHint(params.runId, job?.name);
    }
    return {
      content: [{ type: 'text', text: minifiedJson(body) }],
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
