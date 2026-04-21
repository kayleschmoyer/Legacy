import { githubGraphQL } from '../github-api.js';
import { resolvePullRequestNodeId } from '../pr-utils.js';
import type { ToolResult } from '../types.js';

export type MergeMethod = 'SQUASH' | 'MERGE' | 'REBASE';

interface EnableAutoMergeParams {
  prNumber: number;
  mergeMethod: MergeMethod;
}

interface EnableAutoMergeResponse {
  enablePullRequestAutoMerge: {
    pullRequest: {
      number: number;
      autoMergeRequest: { mergeMethod: string } | null;
    };
  };
}

const ENABLE_AUTO_MERGE_MUTATION = `
mutation($prId: ID!, $mergeMethod: PullRequestMergeMethod!) {
  enablePullRequestAutoMerge(input: { pullRequestId: $prId, mergeMethod: $mergeMethod }) {
    pullRequest { number autoMergeRequest { mergeMethod } }
  }
}`;

export async function enableAutoMerge(
  params: EnableAutoMergeParams,
): Promise<ToolResult> {
  try {
    const prId = await resolvePullRequestNodeId(params.prNumber);
    if (!prId) {
      return {
        isError: true,
        content: [{ type: 'text', text: `PR #${params.prNumber} not found.` }],
      };
    }

    const result = await githubGraphQL<EnableAutoMergeResponse>(
      ENABLE_AUTO_MERGE_MUTATION,
      { prId, mergeMethod: params.mergeMethod },
    );

    const autoMergeRequest =
      result.data.enablePullRequestAutoMerge.pullRequest.autoMergeRequest;
    const resolvedMethod = autoMergeRequest?.mergeMethod ?? params.mergeMethod;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              prNumber: params.prNumber,
              mergeMethod: resolvedMethod,
              output: `Auto-merge enabled for PR #${params.prNumber} (${resolvedMethod}). The PR will merge automatically when all required checks pass.`,
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isWorkflowScopeError =
      message.includes('workflow') &&
      (message.includes('without `workflow` scope') ||
        message.includes("without 'workflow' scope") ||
        message.includes('refusing to allow a Personal Access token'));
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: isWorkflowScopeError
            ? `Failed to enable auto-merge for PR #${params.prNumber}: this PR modifies .github/workflows/ files and the configured PAT lacks the \`workflow\` OAuth scope. Ask the repo owner to either merge manually or add the \`workflow\` scope to the PAT in .env.local (GITHUB_TOKEN). Original error: ${message}`
            : `Failed to enable auto-merge for PR #${params.prNumber}: ${message}`,
        },
      ],
    };
  }
}
