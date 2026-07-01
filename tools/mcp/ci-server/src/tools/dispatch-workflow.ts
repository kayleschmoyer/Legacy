import { githubGet, githubPost } from '../github-api.js';
import type { ToolResult } from '../types.js';

const MAX_TIMEOUT_SECONDS = 3600;
const FIND_RUN_POLL_INTERVAL_MS = 3000;
const FIND_RUN_MAX_ATTEMPTS = 10;
const COMPLETION_POLL_INTERVAL_MS = 10000;

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

    const timeoutSeconds = Math.min(
      params.timeoutSeconds ?? 600,
      MAX_TIMEOUT_SECONDS,
    );
    const deadlineMs = Date.now() + timeoutSeconds * 1000;

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
            {
              workflow,
              ref,
              runId: newRun.id,
              runNumber: result.runNumber,
              url: result.url,
              conclusion: result.conclusion,
              durationSeconds: result.durationSeconds,
              ...(result.timedOut
                ? {
                    timedOut: true,
                    hint: `Run is still in progress after ${timeoutSeconds}s. Use ci_view_run({ runId: ${newRun.id} }) to check its current status.`,
                  }
                : {}),
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
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
