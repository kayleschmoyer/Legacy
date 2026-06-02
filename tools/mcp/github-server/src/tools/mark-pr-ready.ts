import { getRepoOwnerName } from '../auth.js';
import { githubGraphQL, githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

/**
 * Trigger label for the Reviewer Bot (W1). Applying it after a PR is marked
 * ready ensures every subsequent `synchronize` (fix-push) re-fires a review
 * cycle — review.yml only re-triggers on push when this label is present.
 * See `.agents/skills/pr-lifecycle/SKILL.md` (Label Ownership) and
 * `.github/workflows/review.yml`.
 */
const READY_FOR_REVIEW_LABEL = 'bot:ready-for-review';

interface MarkPRReadyParams {
  number: number;
  /**
   * Apply the `bot:ready-for-review` label after the PR is ready (default
   * true). The Reviewer Bot's first cycle fires on the `ready_for_review`
   * event regardless, but the label is required for fix-push cycles to
   * re-trigger review. Pass `false` only when the caller intentionally manages
   * the label itself (e.g. a remove-then-add re-trigger).
   */
  applyReadyLabel?: boolean;
}

interface PRNodeIdResponse {
  repository: {
    pullRequest: {
      id: string;
      isDraft: boolean;
    } | null;
  };
}

interface MarkReadyResponse {
  markPullRequestReadyForReview: {
    pullRequest: {
      number: number;
      isDraft: boolean;
      url: string;
    };
  };
}

const GET_PR_NODE_ID = `
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      id
      isDraft
    }
  }
}`;

const MARK_READY_MUTATION = `
mutation($prId: ID!) {
  markPullRequestReadyForReview(input: { pullRequestId: $prId }) {
    pullRequest {
      number
      isDraft
      url
    }
  }
}`;

/**
 * Best-effort apply of `bot:ready-for-review`. GitHub's add-labels endpoint is
 * additive and idempotent: re-posting a label the PR already carries is a no-op
 * and emits no `labeled` webhook event, so this is safe to call on both the
 * freshly-marked-ready and already-ready paths. Failure is non-fatal — the PR
 * is already ready — but is surfaced so the caller can re-apply manually.
 */
async function applyReadyForReviewLabel(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<{ applied: boolean; error?: string }> {
  try {
    await githubRest({
      method: 'POST',
      path: `/repos/${owner}/${repo}/issues/${prNumber}/labels`,
      body: { labels: [READY_FOR_REVIEW_LABEL] },
    });
    return { applied: true };
  } catch (error) {
    return {
      applied: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function markPRReady(
  params: MarkPRReadyParams,
): Promise<ToolResult> {
  const applyReadyLabel = params.applyReadyLabel ?? true;

  try {
    const repo = await getRepoOwnerName();

    // Get the PR's GraphQL node ID
    const prResult = await githubGraphQL<PRNodeIdResponse>(GET_PR_NODE_ID, {
      owner: repo.owner,
      repo: repo.name,
      number: params.number,
    });

    const pr = prResult.data.repository.pullRequest;

    if (!pr) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `PR #${params.number} not found in ${repo.owner}/${repo.name}.`,
          },
        ],
      };
    }

    if (!pr.isDraft) {
      // Already ready — still ensure the trigger label is present so fix-push
      // cycles re-fire the Reviewer Bot.
      const label = applyReadyLabel
        ? await applyReadyForReviewLabel(repo.owner, repo.name, params.number)
        : { applied: false };
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                number: params.number,
                alreadyReady: true,
                readyForReviewLabelApplied: label.applied,
                ...(label.error ? { labelError: label.error } : {}),
                message: `PR #${params.number} is already marked as ready for review.`,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    // Mark as ready
    const result = await githubGraphQL<MarkReadyResponse>(MARK_READY_MUTATION, {
      prId: pr.id,
    });

    const updated = result.data.markPullRequestReadyForReview.pullRequest;

    // Apply the trigger label last, after the PR is ready, so review.yml fires
    // a cycle on every subsequent fix-push (not just the initial
    // `ready_for_review` event).
    const label = applyReadyLabel
      ? await applyReadyForReviewLabel(repo.owner, repo.name, params.number)
      : { applied: false };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              number: updated.number,
              isDraft: updated.isDraft,
              url: updated.url,
              readyForReviewLabelApplied: label.applied,
              ...(label.error ? { labelError: label.error } : {}),
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to mark PR #${params.number} as ready: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
