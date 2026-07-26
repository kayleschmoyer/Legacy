import { minifiedJson } from '@legacy-sports/mcp-format';
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

    // GitHub returns HTTP 200 with `enablePullRequestAutoMerge: null` (errors
    // attached separately as `warnings` by githubGraphQL) when the mutation
    // can't apply — most commonly because the PR is already enqueued/has
    // auto-merge enabled, e.g. via a prior github_merge_pr call. Detect that
    // case from the GraphQL error text and report it as a no-op success
    // instead of dereferencing null; surface anything else as a clear error.
    if (!result.data.enablePullRequestAutoMerge?.pullRequest) {
      const warningText = result.warnings?.map((w) => w.message).join('; ');
      const alreadyActive =
        warningText != null && /already|queue/i.test(warningText);
      if (alreadyActive) {
        return {
          content: [
            {
              type: 'text',
              text: minifiedJson({
                success: true,
                prNumber: params.prNumber,
                mergeMethod: params.mergeMethod,
                output: `PR #${params.prNumber} is already in the merge queue — auto-merge is already active (no change made). GitHub: ${warningText}`,
              }),
            },
          ],
        };
      }
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Failed to enable auto-merge for PR #${params.prNumber}: ${warningText ?? 'GitHub returned no pull request data for this mutation.'}`,
          },
        ],
      };
    }

    const autoMergeRequest =
      result.data.enablePullRequestAutoMerge.pullRequest.autoMergeRequest;
    const resolvedMethod = autoMergeRequest?.mergeMethod ?? params.mergeMethod;

    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            success: true,
            prNumber: params.prNumber,
            mergeMethod: resolvedMethod,
            output: `Auto-merge enabled for PR #${params.prNumber} (${resolvedMethod}). The PR will merge automatically when all required checks pass.`,
          }),
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
