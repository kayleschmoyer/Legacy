import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface RequestReviewParams {
  number: number;
  reviewers?: string[];
  copilot?: boolean;
}

const COPILOT_BOT = 'copilot-pull-request-reviewer[bot]';

export async function requestReview(
  params: RequestReviewParams,
): Promise<ToolResult> {
  const results: Array<{ reviewer: string; success: boolean; error?: string }> =
    [];

  try {
    const repo = await getRepoOwnerName();
    const path = `/repos/${repo.owner}/${repo.name}/pulls/${params.number}/requested_reviewers`;

    // Collect all reviewers into a single request
    const allReviewers: string[] = [];

    if (params.copilot !== false) {
      allReviewers.push(COPILOT_BOT);
    }
    if (params.reviewers?.length) {
      allReviewers.push(...params.reviewers);
    }

    if (allReviewers.length === 0) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `No reviewers specified for PR #${params.number}. Provide at least one reviewer or enable copilot.`,
          },
        ],
      };
    }

    try {
      await githubRest({
        method: 'POST',
        path,
        body: { reviewers: allReviewers },
      });
      for (const reviewer of allReviewers) {
        results.push({ reviewer, success: true });
      }
    } catch (error) {
      // If batch fails, try individually
      for (const reviewer of allReviewers) {
        try {
          await githubRest({
            method: 'POST',
            path,
            body: { reviewers: [reviewer] },
          });
          results.push({ reviewer, success: true });
        } catch (individualError) {
          results.push({
            reviewer,
            success: false,
            error:
              individualError instanceof Error
                ? individualError.message
                : String(individualError),
          });
        }
      }
    }
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to request reviewers on PR #${params.number}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }

  const allSucceeded = results.every((r) => r.success);
  return {
    isError: !allSucceeded ? true : undefined,
    content: [
      {
        type: 'text',
        text: JSON.stringify({ prNumber: params.number, results }, null, 2),
      },
    ],
  };
}
