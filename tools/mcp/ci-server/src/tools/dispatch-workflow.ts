import { githubGet, githubPost } from '../github-api.js';
import type { ToolResult } from '../types.js';
import { waitRunHint } from './wait-run.js';

// Hard per-call ceiling: cloud sessions kill any MCP call at ~60s (transport
// timeout), losing the result. No single call may block longer than this —
// longer waits are re-armed by the caller via ci_wait_run.
const TRANSPORT_SAFE_WAIT_MS = 55_000;
const FIND_RUN_POLL_INTERVAL_MS = 3000;
const FIND_RUN_MAX_ATTEMPTS = 10;
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
      console.error(
        '[ci_dispatch_workflow] transient error polling for new run:',
        err,
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
      console.error(
        '[ci_dispatch_workflow] transient error polling run status:',
        err,
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

    const workflow = String(params.workflow);
    const ref = String(body.ref);

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
                error:
                  'Could not locate the triggered run within 30 seconds. The dispatch succeeded — use ci_list_runs to find it and ci_view_run to track its status.',
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
              '  2. ci_rerun_failed_jobs({ runId: <id> })',
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
