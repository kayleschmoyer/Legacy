import { githubPost } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface DispatchWorkflowParams {
  workflow: string | number;
  ref?: string;
  inputs?: Record<string, string>;
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

    await githubPost(
      `/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
      body,
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              workflow,
              ref: body.ref,
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
