import { LOGGER } from '@legacy-sports/logging';

import { resolveWorkflowId } from './list-runs.js';
import { waitRunHint } from './wait-run.js';
import { githubGet, githubPost } from '../github-api.js';
import type { ToolResult } from '../types.js';

// Hard per-call ceiling. This server runs on a Lambda whose configured
// timeout is 30s (terraform/main/lambda-mcp-ci.tf -> var.lambda_timeout,
// terraform/main/variables.tf), which is the real constraint — NOT the
// client-side ~60s MCP transport timeout a prior version of this constant
// assumed. A wait longer than the Lambda's own timeout gets the whole
// invocation SIGKILLed by AWS before it can return a response, which the
// caller sees as a raw "Service Unavailable" transport error instead of a
// clean { status: "in_progress", hint } snapshot (LS-8429). 20s leaves
// headroom under the 30s hard limit for the credential-fetch/auth work that
// runs before this function is even invoked. Longer waits are re-armed by
// the caller via ci_wait_run.
const TRANSPORT_SAFE_WAIT_MS = 20_000;
const FIND_RUN_POLL_INTERVAL_MS = 3000;
// Worst case (attempts - 1) * FIND_RUN_POLL_INTERVAL_MS must stay well under
// TRANSPORT_SAFE_WAIT_MS — findNewRun runs BEFORE pollUntilComplete and isn't
// itself deadline-aware, so an unbounded attempt count here could exhaust the
// Lambda's timeout on its own before ever reaching the completion poll.
const FIND_RUN_MAX_ATTEMPTS = 4;
const COMPLETION_POLL_INTERVAL_MS = 5000;

interface GitHubWorkflowRun {
  id: number;
  status: string;
  conclusion: string | null;
  created_at: string;
  html_url: string;
  run_number: number;
  event: string;
  head_branch: string | null;
}

interface GitHubRunsResponse {
  workflow_runs: GitHubWorkflowRun[];
}

interface DispatchWorkflowParams {
  workflow: string | number;
  ref?: string;
  inputs?: Record<string, string>;
  waitForCompletion?: boolean;
  timeoutSeconds?: number;
}

// Workflows whose AWS OIDC role (terraform/main/github-actions-oidc.tf ->
// aws_iam_role.github_actions_plan) only trusts pull_request events or
// ref:refs/heads/main. A workflow_dispatch run against any other ref
// produces sub = "repo:.../ref:refs/heads/<branch>", which matches neither
// trust condition -- the job's `sts:AssumeRoleWithWebIdentity` step fails
// every single time, not flakily (LS-9029). Fail fast instead of dispatching
// into a guaranteed failure. Keep this list in lockstep with which
// workflows assume that role AND declare workflow_dispatch as a trigger.
const OIDC_PLAN_ROLE_MAIN_ONLY_WORKFLOWS = new Set([
  'check-migrations-applied.yml',
  'terraform-plan.yml',
]);

function isNonMainRef(ref: string): boolean {
  return ref !== 'main' && ref !== 'refs/heads/main';
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findNewRun(
  workflow: string,
  ref: string,
  dispatchedAt: Date,
): Promise<GitHubWorkflowRun | null> {
  const cutoff = dispatchedAt.getTime() - 5000; // 5s tolerance for clock skew
  for (let attempt = 0; attempt < FIND_RUN_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(FIND_RUN_POLL_INTERVAL_MS);
    }
    try {
      // Filter by event=workflow_dispatch to avoid picking up concurrent push/schedule runs.
      // Omit the branch filter when ref looks like a tag (GitHub's branch filter only matches branches).
      const isTag = !ref.includes('/') && /^v?\d/.test(ref);
      const queryParams: Record<string, string> = {
        per_page: '10',
        event: 'workflow_dispatch',
      };
      if (!isTag) {
        queryParams.branch = ref;
      }
      const data = await githubGet<GitHubRunsResponse>(
        `/actions/workflows/${encodeURIComponent(workflow)}/runs`,
        queryParams,
      );
      const match = data.workflow_runs
        .slice()
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        .find(
          (r) =>
            r.event === 'workflow_dispatch' &&
            new Date(r.created_at).getTime() >= cutoff,
        );
      if (match) return match;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/\b(401|403|404)\b/.test(msg)) throw err;
      LOGGER.error(
        '[ci_dispatch_workflow] transient error polling for new run:',
        err instanceof Error ? err : msg,
      );
    }
  }
  return null;
}

async function pollUntilComplete(
  run: GitHubWorkflowRun,
  deadlineMs: number,
): Promise<{
  conclusion: string | null;
  durationSeconds: number;
  timedOut?: boolean;
  url: string;
  runNumber: number;
}> {
  const startMs = Date.now();
  let current = run;
  while (current.status !== 'completed') {
    if (Date.now() >= deadlineMs) {
      return {
        conclusion: null,
        durationSeconds: Math.round((Date.now() - startMs) / 1000),
        timedOut: true,
        url: current.html_url,
        runNumber: current.run_number,
      };
    }
    await sleep(COMPLETION_POLL_INTERVAL_MS);
    try {
      const fresh = await githubGet<GitHubWorkflowRun>(
        `/actions/runs/${current.id}`,
      );
      current = fresh;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // 4xx errors are fatal (bad token, wrong run ID) — propagate immediately.
      if (/\b(401|403|404)\b/.test(msg)) throw err;
      LOGGER.error(
        '[ci_dispatch_workflow] transient error polling run status:',
        err instanceof Error ? err : msg,
      );
    }
  }
  return {
    conclusion: current.conclusion,
    durationSeconds: Math.round((Date.now() - startMs) / 1000),
    url: current.html_url,
    runNumber: current.run_number,
  };
}

export async function dispatchWorkflow(
  params: DispatchWorkflowParams,
): Promise<ToolResult> {
  try {
    const body: Record<string, unknown> = {
      ref: params.ref ?? 'main',
    };
    if (params.inputs && Object.keys(params.inputs).length > 0) {
      body.inputs = params.inputs;
    }

    // Resolve display names (e.g. "Legacy Sports CI Orchestrator") to the
    // filename/numeric ID the dispatch endpoint actually accepts, the same
    // way ci_list_runs does — otherwise a display name that works for every
    // sibling tool 404s here with no hint why (LS-9230).
    const workflow = await resolveWorkflowId(String(params.workflow));
    const ref = String(body.ref);

    if (OIDC_PLAN_ROLE_MAIN_ONLY_WORKFLOWS.has(workflow) && isNonMainRef(ref)) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: [
              `Refusing to dispatch "${workflow}" on ref "${ref}": this workflow assumes the ` +
                `legacy-sports-dev-github-actions-plan AWS OIDC role, whose trust policy only allows ` +
                `pull_request events or ref:refs/heads/main (terraform/main/github-actions-oidc.tf).`,
              '',
              `A workflow_dispatch run on any other branch is not flaky -- it is structurally guaranteed ` +
                `to fail "sts:AssumeRoleWithWebIdentity" inside the job every time. Retrying this call will ` +
                `not help (LS-9029).`,
              '',
              'To retrigger this required check on a PR branch, fire a genuine pull_request event instead:',
              '  worktree_commit({ message: "chore: retrigger ci" }) + worktree_push()',
              '  or: git commit --allow-empty -m "chore: retrigger ci" && git push',
            ].join('\n'),
          },
        ],
      };
    }

    const dispatchedAt = new Date();
    await githubPost(
      `/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
      body,
    );

    if (!params.waitForCompletion) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                workflow,
                ref,
                inputs: params.inputs ?? {},
                message:
                  'Workflow dispatch requested successfully. Use ci_list_runs to monitor the triggered run.',
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    // The per-call wait is transport-safe regardless of timeoutSeconds; the
    // param is kept for backward compatibility but clamped to the ceiling.
    const timeoutSeconds = Math.min(
      params.timeoutSeconds ?? TRANSPORT_SAFE_WAIT_MS / 1000,
      TRANSPORT_SAFE_WAIT_MS / 1000,
    );
    const deadlineMs = dispatchedAt.getTime() + timeoutSeconds * 1000;

    const newRun = await findNewRun(workflow, ref, dispatchedAt);
    if (!newRun) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                workflow,
                ref,
                dispatched: true,
                error: `Could not locate the triggered run within ${Math.round(((FIND_RUN_MAX_ATTEMPTS - 1) * FIND_RUN_POLL_INTERVAL_MS) / 1000)} seconds. The dispatch succeeded — use ci_list_runs to find it and ci_view_run to track its status.`,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    const result = await pollUntilComplete(newRun, deadlineMs);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            result.timedOut
              ? {
                  workflow,
                  ref,
                  runId: newRun.id,
                  runNumber: result.runNumber,
                  url: result.url,
                  status: 'in_progress',
                  elapsedSeconds: result.durationSeconds,
                  hint: waitRunHint(newRun.id),
                }
              : {
                  workflow,
                  ref,
                  runId: newRun.id,
                  runNumber: result.runNumber,
                  url: result.url,
                  status: 'completed',
                  conclusion: result.conclusion,
                  durationSeconds: result.durationSeconds,
                },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const is422NoDispatchTrigger =
      msg.includes('GitHub API 422') && /workflow_dispatch/i.test(msg);
    if (is422NoDispatchTrigger) {
      const ref = params.ref ?? 'main';
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: [
              `Cannot dispatch workflow "${params.workflow}": it has no 'workflow_dispatch' trigger (HTTP 422 from GitHub).`,
              '',
              'This workflow only runs on other events (e.g. pull_request, push) and cannot be manually dispatched. ' +
                'Retrigger the existing run instead:',
              `  1. ci_list_runs({ workflow: "${params.workflow}", branch: "${ref}" }) — find the failed run's "id"`,
              '  2. ci_rerun({ runId: <id> })',
            ].join('\n'),
          },
        ],
      };
    }
    const is403 =
      msg.includes('GitHub API 403') ||
      msg.includes('(403)') ||
      msg.includes('status: 403') ||
      msg.includes('"status":"403"');
    if (is403) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: [
              `Cannot dispatch workflow "${params.workflow}": the GitHub App token lacks actions:write permission (HTTP 403 from GitHub).`,
              '',
              'This is a known cloud-session limitation — the AGENT_AUTHOR_APP installation has contents:write and pull_requests:write but not actions:write.',
              '',
              'Workarounds (pick one):',
              '  1. Push an empty commit to re-enter the merge queue:',
              '       worktree_commit({ message: "chore: trigger merge queue" }) + worktree_push()',
              '       or: git commit --allow-empty -m "chore: trigger merge queue" && git push',
              '  2. Remove and re-add the merge-queue label on the PR.',
              '  3. Wait — if all review threads are resolved, the merge queue retries on its own cycle.',
            ].join('\n'),
          },
        ],
      };
    }
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to dispatch workflow "${params.workflow}": ${msg}`,
        },
      ],
    };
  }
}
