import { getRepoOwnerName } from '../auth.js';
import { COPILOT_BOT } from '../constants.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface RequestReviewBatchParams {
  prs: number[];
  reviewers?: string[];
  copilot?: boolean;
}

export async function requestReviewBatch(
  params: RequestReviewBatchParams,
): Promise<ToolResult> {
  const uniquePrs = [...new Set(params.prs)];

  // Collect all reviewers — deduplicate and strip empty/whitespace entries
  const allReviewers = [
    ...new Set(
      [
        ...(params.copilot !== false ? [COPILOT_BOT] : []),
        ...(params.reviewers ?? []),
      ]
        .map((r) => r.trim())
        .filter(Boolean),
    ),
  ];

  if (allReviewers.length === 0) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'No reviewers specified. Provide at least one reviewer or enable copilot.',
        },
      ],
    };
  }

  const results: Array<{
    prNumber: number;
    success: boolean;
    error?: string;
  }> = [];

  try {
    const repo = await getRepoOwnerName();

    // Process PRs in parallel batches of 10 to avoid overwhelming the API
    const BATCH_SIZE = 10;
    for (let i = 0; i < uniquePrs.length; i += BATCH_SIZE) {
      const batch = uniquePrs.slice(i, i + BATCH_SIZE);
      const promises = batch.map(async (prNumber) => {
        const path = `/repos/${repo.owner}/${repo.name}/pulls/${prNumber}/requested_reviewers`;

        try {
          await githubRest({
            method: 'POST',
            path,
            body: { reviewers: allReviewers },
          });
          return { prNumber, success: true };
        } catch (error) {
          // Only fall back to individual requests for 422 validation errors
          // (e.g. bot reviewers rejected in batch). Re-throw other failures.
          const is422 =
            error instanceof Error && /failed \(422\)/.test(error.message);
          if (!is422) {
            return {
              prNumber,
              success: false,
              error: error instanceof Error ? error.message : String(error),
            };
          }

          // 422 — try reviewers individually
          const individualResults: Array<{
            reviewer: string;
            success: boolean;
            error?: string;
          }> = [];

          for (const reviewer of allReviewers) {
            try {
              await githubRest({
                method: 'POST',
                path,
                body: { reviewers: [reviewer] },
              });
              individualResults.push({ reviewer, success: true });
            } catch (individualError) {
              individualResults.push({
                reviewer,
                success: false,
                error:
                  individualError instanceof Error
                    ? individualError.message
                    : String(individualError),
              });
            }
          }

          const allSucceeded = individualResults.every((r) => r.success);
          if (allSucceeded) {
            return { prNumber, success: true };
          }

          const failedReviewers = individualResults
            .filter((r) => !r.success)
            .map((r) => `${r.reviewer}: ${r.error}`)
            .join('; ');

          return {
            prNumber,
            success: false,
            error: failedReviewers,
          };
        }
      });

      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
    }
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to get repo info: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return {
    isError: failed > 0,
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            requestedTotal: params.prs.length,
            total: results.length,
            succeeded,
            failed,
            reviewers: allReviewers,
            results,
          },
          null,
          2,
        ),
      },
    ],
  };
}
