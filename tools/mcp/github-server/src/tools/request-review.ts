import { getRepoOwnerName, tryGhAuthToken } from '../auth.js';
import { COPILOT_BOT } from '../constants.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface RequestReviewParams {
  number: number;
  reviewers?: string[];
  copilot?: boolean;
}

/**
 * Logins GitHub may return in the `requested_reviewers` response.
 * The REST API normalizes the bot name to "Copilot" in the response
 * even though we send "copilot-pull-request-reviewer[bot]" in the request.
 */
const COPILOT_RESPONSE_LOGINS = new Set([
  'Copilot',
  'copilot-pull-request-reviewer[bot]',
  'copilot-pull-request-reviewer',
]);

interface PullResponse {
  requested_reviewers?: Array<{ login: string }>;
}

/**
 * Request Copilot review using a **user** OAuth token.
 *
 * GitHub's `requestReviewers` REST API silently drops the Copilot reviewer
 * when called with any GitHub App installation token (`ghs_*`), including
 * both custom app tokens and the built-in `GITHUB_TOKEN` in Actions. The
 * API returns HTTP 201 success but the reviewer does not appear in the
 * response's `requested_reviewers` array.
 *
 * Only user-scoped tokens (OAuth from `gh auth login`, fine-grained PATs)
 * successfully add Copilot as a reviewer. This function resolves a user
 * token via `gh auth token` and makes a direct fetch call, bypassing the
 * MCP server's default token resolution which may return an app token.
 *
 * If no user token is available, falls back to the default token (which
 * will likely fail silently for Copilot).
 */
async function requestCopilotReview(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<{ success: boolean; error?: string }> {
  const userToken = await tryGhAuthToken();

  if (!userToken) {
    // Fall back to default token — it will likely be an app token that
    // silently fails, but we verify the response and report the error.
    try {
      const response = await githubRest<PullResponse>({
        method: 'POST',
        path: `/repos/${owner}/${repo}/pulls/${prNumber}/requested_reviewers`,
        body: { reviewers: [COPILOT_BOT] },
      });
      const added = response.requested_reviewers?.map((r) => r.login) ?? [];
      if ([...COPILOT_RESPONSE_LOGINS].some((l) => added.includes(l))) {
        return { success: true };
      }
      return {
        success: false,
        error:
          'No user OAuth token available (gh auth token failed) and the ' +
          'default token (likely a GitHub App installation token) silently ' +
          'dropped the Copilot reviewer. Run `gh auth login` to configure a ' +
          'user token.',
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  // Use the user OAuth token directly — bypasses the MCP server's default
  // token resolution which may return an app installation token.
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/requested_reviewers`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${userToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reviewers: [COPILOT_BOT] }),
  });

  if (!res.ok) {
    const text = await res.text();
    return {
      success: false,
      error: `GitHub API returned ${res.status}: ${text}`,
    };
  }

  const data = (await res.json()) as PullResponse;
  const addedLogins = data.requested_reviewers?.map((r) => r.login) ?? [];
  if ([...COPILOT_RESPONSE_LOGINS].some((l) => addedLogins.includes(l))) {
    return { success: true };
  }

  return {
    success: false,
    error:
      'Copilot reviewer was silently dropped despite using a user OAuth ' +
      'token. The PR author may be a GitHub App — Copilot does not review ' +
      'App-authored PRs via the API. Try requesting from the GitHub UI.',
  };
}
export async function requestReview(
  params: RequestReviewParams,
): Promise<ToolResult> {
  const results: Array<{ reviewer: string; success: boolean; error?: string }> =
    [];

  try {
    const repo = await getRepoOwnerName();
    const path = `/repos/${repo.owner}/${repo.name}/pulls/${params.number}/requested_reviewers`;

    // Separate Copilot from other reviewers — Copilot needs special handling
    const wantsCopilot = params.copilot !== false;
    const humanReviewers = params.reviewers?.length
      ? [...params.reviewers]
      : [];

    if (!wantsCopilot && humanReviewers.length === 0) {
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

    // Handle Copilot separately — requires a user OAuth token
    if (wantsCopilot) {
      const copilotResult = await requestCopilotReview(
        repo.owner,
        repo.name,
        params.number,
      );
      results.push({
        reviewer: COPILOT_BOT,
        success: copilotResult.success,
        ...(copilotResult.error ? { error: copilotResult.error } : {}),
      });
    }

    // Handle human reviewers via the default token (app tokens work fine here)
    if (humanReviewers.length > 0) {
      try {
        const response = await githubRest<PullResponse>({
          method: 'POST',
          path,
          body: { reviewers: humanReviewers },
        });
        const addedLogins = new Set(
          response.requested_reviewers?.map((r) => r.login) ?? [],
        );
        for (const reviewer of humanReviewers) {
          results.push({
            reviewer,
            success: addedLogins.has(reviewer),
            ...(!addedLogins.has(reviewer)
              ? {
                  error:
                    'Reviewer was silently dropped by the API. They may not have access to this repository.',
                }
              : {}),
          });
        }
      } catch (error) {
        // If batch fails, try individually
        for (const reviewer of humanReviewers) {
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
