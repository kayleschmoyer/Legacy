import { getRepoOwnerName, tryGhAuthToken } from '../auth.js';
import { COPILOT_BOT } from '../constants.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface RequestReviewParams {
  prs: number[];
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

interface PrSnapshot {
  head: { sha: string };
}

interface ReviewSummary {
  user: { login: string } | null;
  commit_id: string;
}

interface CheckRun {
  status: string;
  conclusion: string | null;
}

interface CheckRunsResponse {
  total_count: number;
  check_runs: CheckRun[];
}

/**
 * Check whether re-requesting Copilot would be a no-op.
 *
 * Two short-circuit branches, checked in order (cheapest first):
 *
 * 1. The `bot-review` CheckRun for HEAD is `queued` / `in_progress` /
 *    `completed + success` — the copilot-auto-approve workflow is handling
 *    (or has handled) this commit. One API call; covers the common
 *    steady-state case without paginating reviews.
 * 2. Copilot has already posted a review for the PR's current HEAD SHA.
 *    Only reached when `bot-review` is missing or in a non-success
 *    completed state — then we still need to confirm whether a review
 *    snuck in (e.g. `bot-review` failed on a non-Copilot concern after
 *    Copilot already approved).
 *
 * Uses the `bot-review` CheckRun rather than `requested_reviewers` because
 * the latter conflates "pending", "in flight", and "bot errored and dropped
 * itself" — it cannot distinguish the one case where a re-request is
 * needed. `bot-review` is owned by `.github/workflows/copilot-auto-approve.yml`
 * and its state machine is under our control.
 *
 * Returns `handled: false` on any API failure so the caller falls through to
 * the POST — never want the precheck to suppress a needed re-request.
 */
async function copilotAlreadyHandled(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<{ handled: boolean; reason?: string }> {
  try {
    const pr = await githubRest<PrSnapshot>({
      method: 'GET',
      path: `/repos/${owner}/${repo}/pulls/${prNumber}`,
    });
    const headSha = pr.head.sha;

    // Branch 1: inspect the `bot-review` CheckRun for HEAD (cheap, one call).
    const checkRuns = await githubRest<CheckRunsResponse>({
      method: 'GET',
      path: `/repos/${owner}/${repo}/commits/${headSha}/check-runs`,
      query: { check_name: 'bot-review', per_page: '1' },
    });
    const run = checkRuns.check_runs[0];
    if (run) {
      if (run.status === 'in_progress' || run.status === 'queued') {
        return {
          handled: true,
          reason: `bot-review ${run.status} for HEAD (${headSha.slice(0, 7)})`,
        };
      }
      if (run.status === 'completed' && run.conclusion === 'success') {
        return {
          handled: true,
          reason: `bot-review completed success for HEAD (${headSha.slice(0, 7)})`,
        };
      }
      // Any other completed conclusion (failure / cancelled / timed_out /
      // action_required / neutral / stale / skipped) — fall through to
      // branch 2: the bot errored or bailed; still verify no Copilot review
      // exists on HEAD before paying for the re-request.
    }

    // Branch 2: Copilot already reviewed the current HEAD SHA.
    // Paginate reviews with early exit on the first match. PRs with >100
    // reviews would otherwise miss a later-page review and reintroduce the
    // redundant re-request noise.
    const PER_PAGE = 100;
    for (let page = 1; ; page++) {
      const reviews = await githubRest<ReviewSummary[]>({
        method: 'GET',
        path: `/repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
        query: { per_page: String(PER_PAGE), page: String(page) },
      });
      const match = reviews.some(
        (r) =>
          r.user != null &&
          COPILOT_RESPONSE_LOGINS.has(r.user.login) &&
          r.commit_id === headSha,
      );
      if (match) {
        return {
          handled: true,
          reason: `Copilot already reviewed HEAD (${headSha.slice(0, 7)})`,
        };
      }
      if (reviews.length < PER_PAGE) break;
    }

    return { handled: false };
  } catch {
    return { handled: false };
  }
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
): Promise<{
  success: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
}> {
  const precheck = await copilotAlreadyHandled(owner, repo, prNumber);
  if (precheck.handled) {
    return { success: true, skipped: true, reason: precheck.reason };
  }

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

/** Request reviewers on one or more PRs. Accepts a single PR number or an array. */
export async function requestReview(
  params: RequestReviewParams,
): Promise<ToolResult> {
  const uniquePrs = [...new Set(params.prs)];
  const wantsCopilot = params.copilot !== false;
  const humanReviewers = [
    ...new Set((params.reviewers ?? []).map((r) => r.trim()).filter(Boolean)),
  ];

  if (!wantsCopilot && humanReviewers.length === 0) {
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

  const perPrResults: Array<{
    prNumber: number;
    reviewers: Array<{
      reviewer: string;
      success: boolean;
      skipped?: boolean;
      reason?: string;
      error?: string;
    }>;
  }> = [];

  try {
    const repo = await getRepoOwnerName();

    // Process PRs in parallel batches of 10
    const BATCH_SIZE = 10;
    for (let i = 0; i < uniquePrs.length; i += BATCH_SIZE) {
      const batch = uniquePrs.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (prNumber) => {
          const reviewerResults: Array<{
            reviewer: string;
            success: boolean;
            skipped?: boolean;
            reason?: string;
            error?: string;
          }> = [];
          const path = `/repos/${repo.owner}/${repo.name}/pulls/${prNumber}/requested_reviewers`;

          // Handle Copilot separately — requires a user OAuth token
          if (wantsCopilot) {
            const copilotResult = await requestCopilotReview(
              repo.owner,
              repo.name,
              prNumber,
            );
            reviewerResults.push({
              reviewer: COPILOT_BOT,
              success: copilotResult.success,
              ...(copilotResult.skipped ? { skipped: true } : {}),
              ...(copilotResult.reason ? { reason: copilotResult.reason } : {}),
              ...(copilotResult.error ? { error: copilotResult.error } : {}),
            });
          }

          // Handle human reviewers via the default token
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
                reviewerResults.push({
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
              // Only fall back to per-reviewer requests for HTTP 422 (validation errors,
              // e.g. a reviewer not having repo access). For auth/rate-limit/5xx errors,
              // record the batch error for all reviewers without amplifying API traffic.
              const isValidationError =
                error instanceof Error && /\(422\)/.test(error.message);
              if (isValidationError) {
                for (const reviewer of humanReviewers) {
                  try {
                    const individualResponse = await githubRest<PullResponse>({
                      method: 'POST',
                      path,
                      body: { reviewers: [reviewer] },
                    });
                    const added = new Set(
                      individualResponse.requested_reviewers?.map(
                        (r) => r.login,
                      ) ?? [],
                    );
                    reviewerResults.push({
                      reviewer,
                      success: added.has(reviewer),
                      ...(!added.has(reviewer)
                        ? {
                            error:
                              'Reviewer was silently dropped by the API. They may not have access to this repository.',
                          }
                        : {}),
                    });
                  } catch (individualError) {
                    reviewerResults.push({
                      reviewer,
                      success: false,
                      error:
                        individualError instanceof Error
                          ? individualError.message
                          : String(individualError),
                    });
                  }
                }
              } else {
                // Non-422 error (rate limit, auth, 5xx) — report for all reviewers
                const errorMsg =
                  error instanceof Error ? error.message : String(error);
                for (const reviewer of humanReviewers) {
                  reviewerResults.push({
                    reviewer,
                    success: false,
                    error: errorMsg,
                  });
                }
              }
            }
          }

          return { prNumber, reviewers: reviewerResults };
        }),
      );
      perPrResults.push(...batchResults);
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

  const allSucceeded = perPrResults.every((pr) =>
    pr.reviewers.every((r) => r.success),
  );

  // For single-PR calls, flatten to match the legacy per-reviewer output shape
  if (uniquePrs.length === 1) {
    return {
      isError: !allSucceeded ? true : undefined,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { prNumber: uniquePrs[0], results: perPrResults[0].reviewers },
            null,
            2,
          ),
        },
      ],
    };
  }

  return {
    isError: !allSucceeded ? true : undefined,
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            total: uniquePrs.length,
            results: perPrResults,
          },
          null,
          2,
        ),
      },
    ],
  };
}
