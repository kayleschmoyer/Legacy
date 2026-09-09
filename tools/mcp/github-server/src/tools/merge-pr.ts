import { minifiedJson } from '@legacy-sports/mcp-format';
import { fetchPrLabels } from './manage-labels.js';
import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface MergePRParams {
  number: number;
  strategy: 'queue' | 'direct';
}

interface MergeResponse {
  sha: string;
  merged: boolean;
  message: string;
}

// This repo's merge queue (.github/workflows/merge-queue.yml) is a custom
// label-based workflow, not GitHub's native merge queue/auto-merge feature —
// see docs/ci-cd/merge-queue-guide.md. It watches for this label; nothing
// else enqueues a PR into it.
const MERGE_WHEN_READY_LABEL = 'merge-when-ready';

export async function mergePR(params: MergePRParams): Promise<ToolResult> {
  try {
    const repo = await getRepoOwnerName();

    if (params.strategy === 'direct') {
      // Direct merge via REST API — bypasses merge queue (admin merge)
      const mergeResult = await githubRest<MergeResponse>({
        method: 'PUT',
        path: `/repos/${repo.owner}/${repo.name}/pulls/${params.number}/merge`,
        body: {
          merge_method: 'squash',
          commit_title: `PR #${params.number}`,
        },
      });

      return {
        content: [
          {
            type: 'text',
            text: minifiedJson({
              success: true,
              prNumber: params.number,
              strategy: params.strategy,
              sha: mergeResult.sha,
              merged: mergeResult.merged,
              output: mergeResult.message,
            }),
          },
        ],
      };
    }

    // Queue strategy: apply the merge-when-ready label — that is what
    // actually enqueues the PR into this repo's custom merge-queue workflow
    // (GitHub's native `enablePullRequestAutoMerge` GraphQL mutation is a
    // no-op here: this repo doesn't use GitHub's built-in merge queue at
    // all, so a caller trusting that mutation's success gets a false
    // positive — the PR never enters the queue that actually merges PRs).
    const labelsPath = `/repos/${repo.owner}/${repo.name}/issues/${params.number}/labels`;
    try {
      await githubRest({
        method: 'POST',
        path: labelsPath,
        body: { labels: [MERGE_WHEN_READY_LABEL] },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('(404)')) {
        return {
          isError: true,
          content: [{ type: 'text', text: `PR #${params.number} not found.` }],
        };
      }
      throw error;
    }

    // Verify the label actually took — GitHub's Labels API can 200 without
    // applying the label on a permission edge case, and a caller trusting
    // the POST response alone reproduces the exact silent-failure bug this
    // fix addresses (LS-9851). Confirm the enqueue really happened before
    // reporting success.
    const currentLabels = await fetchPrLabels(labelsPath);
    if (!currentLabels.includes(MERGE_WHEN_READY_LABEL)) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `PR #${params.number}: applied the ${MERGE_WHEN_READY_LABEL} label but it is not present on the PR afterward — the enqueue did not take effect. Merge manually via strategy: "direct" instead.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            success: true,
            prNumber: params.number,
            strategy: params.strategy,
            output: `PR #${params.number} labeled ${MERGE_WHEN_READY_LABEL} — the merge queue will process it automatically once all required checks pass.`,
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
            ? `Failed to merge PR #${params.number}: this PR modifies .github/workflows/ files and the configured PAT lacks the \`workflow\` OAuth scope. Ask the repo owner to either merge manually or add the \`workflow\` scope to the PAT in .env.local (GITHUB_TOKEN). Original error: ${message}`
            : `Failed to merge PR #${params.number} (strategy: ${params.strategy}): ${message}`,
        },
      ],
    };
  }
}
