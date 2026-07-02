import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  getToken,
  getRepoOwnerName,
  tryResolveToken,
  isLambda,
  getLastTokenResolutionFailureReason,
} from './auth.js';
import type { TokenSource } from './auth.js';
import type { ToolResult } from './types.js';
import { closePR } from './tools/close-pr.js';
import { createLabel } from './tools/create-label.js';
import { getRepoInfo } from './tools/get-repo-info.js';
import { getReviewThreads } from './tools/get-review-threads.js';
import { listPRs } from './tools/list-prs.js';
import { listReviews } from './tools/list-reviews.js';
import { manageLabels } from './tools/manage-labels.js';
import { markPRReady } from './tools/mark-pr-ready.js';
import { mergePR } from './tools/merge-pr.js';
import { prDashboard } from './tools/pr-dashboard.js';
import { prScan } from './tools/pr-scan.js';
import {
  replyToReview,
  resolveReplyToReviewInput,
} from './tools/reply-to-review.js';
import { commentPR } from './tools/comment-pr.js';
import { editPR } from './tools/edit-pr.js';
import { listCommitStatuses } from './tools/list-commit-statuses.js';
import { retriggerCheck } from './tools/retrigger-check.js';
import { secretDelete } from './tools/secret-delete.js';
import { setCommitStatus } from './tools/set-commit-status.js';
import { secretSet } from './tools/secret-set.js';
import { requestReview } from './tools/request-review.js';
import { resolveThreads } from './tools/resolve-threads.js';
import { secretsCheck } from './tools/secrets-check.js';
import { ensureSweepLabels } from './tools/ensure-sweep-labels.js';
import { sweepStaleClaims } from './tools/sweep-stale-claims.js';
import { viewPR } from './tools/view-pr.js';
import { listLabels } from './tools/list-labels.js';
import { listRunners } from './tools/list-runners.js';
import { webhookList, webhookUpdate, webhookPing } from './tools/webhooks.js';
import { prCommits } from './tools/pr-commits.js';
import { prBatchStatus } from './tools/pr-batch-status.js';
import { prWhyBlocked } from './tools/pr-why-blocked.js';
import { listPRComments } from './tools/list-pr-comments.js';
import { listPRInlineComments } from './tools/list-pr-inline-comments.js';
import { listReviewComments } from './tools/list-review-comments.js';
import { getFileContent } from './tools/get-file-content.js';
import { getBranchProtection } from './tools/get-branch-protection.js';
import {
  resolveActionSha,
  resolveActionShas,
} from './tools/resolve-action-sha.js';
import { enableAutoMerge } from './tools/enable-auto-merge.js';
import { finishFixRound } from './tools/finish-fix-round.js';
import { prDiff } from './tools/pr-diff.js';
import { getCheckRuns } from './tools/get-check-runs.js';
import { bulkMerge } from './tools/bulk-merge.js';
import { bulkRebase } from './tools/bulk-rebase.js';
import { bulkEdit } from './tools/bulk-edit.js';
import { bulkComment } from './tools/bulk-comment.js';
import { bulkReplyToReview } from './tools/bulk-reply-to-review.js';
import { getJobLogs } from './tools/get-job-logs.js';
import { openPR } from './tools/open-pr.js';
import { diagnose } from './tools/diagnose.js';

// Node.js native fetch (undici) does not respect HTTPS_PROXY / GLOBAL_AGENT_HTTPS_PROXY
// by default. In cloud sessions the egress proxy is required; set the global dispatcher
// so all fetch() calls in this process go through the proxy when configured.
const proxyUrl =
  process.env['HTTPS_PROXY'] || process.env['GLOBAL_AGENT_HTTPS_PROXY'];
if (proxyUrl) {
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
}

/**
 * Shared Zod schema for generic string arrays. Accepts a real array OR a
 * JSON-encoded array string (MCP callers sometimes serialise arrays to strings).
 * Falls back to wrapping a bare string in a single-element array.
 * Size constraints (min/max element count) are applied inside the preprocess
 * because ZodPipe does not expose ZodArray chainable methods.
 */
const stringList = (opts: { min?: number; max?: number } = {}) => {
  let inner = z.array(z.string());
  if (opts.min !== undefined) inner = inner.min(opts.min);
  if (opts.max !== undefined) inner = inner.max(opts.max);
  return z.preprocess((val) => {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
      if (val.trimStart().startsWith('[')) {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) return parsed;
        } catch {
          // Not valid JSON — treat as a single element
        }
      }
      return [val];
    }
    return val;
  }, inner);
};

/**
 * Shared Zod schema for label arrays. Accepts a single string or an array of
 * strings (MCP callers sometimes send a bare string instead of a one-element
 * array). Each label must be non-empty after trimming.
 */
const labelList = z.preprocess(
  (val) => {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
      // Handle JSON-encoded array strings (e.g. '["merge-when-ready"]')
      if (val.trimStart().startsWith('[')) {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) return parsed;
        } catch {
          // Not valid JSON — treat as bare label string
        }
      }
      return [val];
    }
    return val;
  },
  z.array(z.string().trim().min(1, 'Label name must be non-empty')),
);

/**
 * Shared Zod schema for PR-number-style integer parameters. Replaces the bare
 * z.coerce.number().int().positive() pattern so that invalid inputs (NaN,
 * objects, non-numeric strings, negatives) produce a single clear, named
 * error instead of Zod's generic "received NaN" / "Too small" messages.
 */
function prNumberField(fieldName: string) {
  const message = `${fieldName} must be a valid positive integer`;
  return z.coerce
    .number({ error: () => message })
    .refine((n) => Number.isInteger(n), { error: () => message })
    .refine((n) => n > 0, { error: () => message });
}

/**
 * Shared Zod schema for boolean parameters. Accepts a real boolean OR a
 * string "true"/"false"/"1"/"0" (MCP callers sometimes serialise booleans to
 * strings). Use in place of z.boolean() for all tool schema parameters.
 */
const coercedBoolean = z.preprocess((val) => {
  if (typeof val === 'string') {
    if (val === 'true' || val === '1') return true;
    if (val === 'false' || val === '0') return false;
  }
  return val;
}, z.boolean());

const GH_AUTH_TOKEN_TIMEOUT_MS = 5_000;

/**
 * Passive auth check — reuses the non-interactive token resolution from auth.ts
 * (env vars → cached file → GitHub App → .netrc → gh CLI). Does NOT trigger
 * interactive OAuth device flow.
 */
async function tryGetGitHubAuth(): Promise<{
  token: string;
  source: TokenSource;
} | null> {
  return tryResolveToken();
}

/** Result of a GitHub user lookup. */
type GitHubUserResult =
  | { status: 'valid'; login: string }
  | { status: 'invalid' }
  | { status: 'unknown'; reason: string };

/**
 * Validate a GitHub token by fetching the authenticated user via direct API.
 * Distinguishes auth failures from transient errors (rate-limit, 5xx, network).
 */
async function getGitHubUser(token: string): Promise<GitHubUserResult> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  try {
    const res = await fetch('https://api.github.com/user', {
      headers,
      signal: AbortSignal.timeout(GH_AUTH_TOKEN_TIMEOUT_MS),
    });

    if (res.ok) {
      const data = (await res.json()) as { login?: string };
      const login = data.login;
      if (login) return { status: 'valid', login };
      return {
        status: 'unknown',
        reason: 'API returned 200 but no login field',
      };
    }

    // 401 — definitively invalid/expired token
    if (res.status === 401) return { status: 'invalid' };

    // Rate limiting (429, or 403 with exhausted rate limit)
    if (
      res.status === 429 ||
      (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0')
    ) {
      return {
        status: 'unknown',
        reason: `GitHub API rate-limited (${res.status}). Token may still be valid.`,
      };
    }

    // Server errors (5xx) — transient, don't treat as invalid
    if (res.status >= 500) {
      return {
        status: 'unknown',
        reason: `GitHub API server error (${res.status}). Token may still be valid.`,
      };
    }

    // 403 without rate-limit: may be a GitHub App installation token (ghs_*).
    // App tokens return 403 for /user because they represent an app, not a user.
    // Fall back to a repo-scoped endpoint that works for both token types.
    if (res.status === 403) {
      try {
        const { owner, name } = await getRepoOwnerName();
        const repoRes = await fetch(
          `https://api.github.com/repos/${owner}/${name}`,
          { headers, signal: AbortSignal.timeout(GH_AUTH_TOKEN_TIMEOUT_MS) },
        );
        if (repoRes.ok) {
          return { status: 'valid', login: `app[bot]` };
        }
        if (repoRes.status === 401) return { status: 'invalid' };
        if (
          repoRes.status === 429 ||
          (repoRes.status === 403 &&
            repoRes.headers.get('x-ratelimit-remaining') === '0')
        ) {
          return {
            status: 'unknown',
            reason: `GitHub API rate-limited (${repoRes.status}). Token may still be valid.`,
          };
        }
        if (repoRes.status >= 500) {
          return {
            status: 'unknown',
            reason: `GitHub API server error (${repoRes.status}). Token may still be valid.`,
          };
        }
        return { status: 'invalid' };
      } catch {
        return {
          status: 'unknown',
          reason:
            'Could not validate app token against repo endpoint. Token may still be valid.',
        };
      }
    }

    // Other 4xx — likely invalid
    return { status: 'invalid' };
  } catch {
    return {
      status: 'unknown',
      reason: 'Network error contacting GitHub API. Token may still be valid.',
    };
  }
}

// Preflight auth — best-effort, non-blocking so server starts even if
// device flow is needed (deferred until first API call).
void getToken().catch((err) => {
  process.stderr.write(
    `Auth preflight failed (will retry on first API call): ${err}\n`,
  );
});

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'legacy-sports-github',
    version: '1.0.0',
  });

  // --- github_auth_status ---
  server.tool(
    'github_auth_status',
    'Check GitHub API authentication status (passive check only — does not trigger interactive auth). Call this first in any GitHub workflow to verify API access is available. Also see ci_auth_status for GitHub rate limit info.',
    {},
    async (): Promise<ToolResult> => {
      const auth = await tryGetGitHubAuth();

      if (!auth) {
        let fallback: string;
        if (isLambda()) {
          const reason = getLastTokenResolutionFailureReason();
          if (reason) {
            fallback =
              `GitHub App token exchange failed: ${reason}. ` +
              'Verify the GITHUB_TOKEN_SECRET_NAME Secrets Manager secret contains valid ' +
              'private_key, app_id, and installation_id fields for an installation that covers this repo. ' +
              'Interactive sources (gh auth login, .netrc, device flow) are not available in Lambda.';
          } else {
            fallback =
              'No GitHub token found in Lambda. AGENT_AUTHOR_APP_PRIVATE_KEY was not set — ' +
              'check that the GITHUB_TOKEN_SECRET_NAME Secrets Manager secret exists and contains ' +
              'a private_key field (plus optional app_id and installation_id). ' +
              'Interactive sources (gh auth login, .netrc, device flow) are not available in Lambda; ' +
              'the remedy is server-side: rotate the secret or reinstall the GitHub App.';
          }
        } else {
          fallback =
            'No GitHub token found. Set GH_TOKEN or GITHUB_TOKEN env var, AGENT_AUTHOR_APP_PRIVATE_KEY for GitHub App auth, or run `gh auth login`.';
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  configured: false,
                  source: null,
                  user: null,
                  fallback,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      const userResult = await getGitHubUser(auth.token);

      if (userResult.status === 'invalid') {
        // GitHub App tokens can be auto-refreshed — regenerate instead of asking the user
        if (auth.source === 'github-app') {
          try {
            const refreshed = await tryResolveToken();
            if (refreshed) {
              const retryUser = await getGitHubUser(refreshed.token);
              if (retryUser.status === 'valid') {
                return {
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify(
                        {
                          configured: true,
                          source: refreshed.source,
                          user: retryUser.login,
                          fallback: null,
                        },
                        null,
                        2,
                      ),
                    },
                  ],
                };
              }
              if (retryUser.status === 'unknown') {
                return {
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify(
                        {
                          configured: 'unknown',
                          source: refreshed.source,
                          user: null,
                          reason: retryUser.reason,
                          fallback:
                            'A GitHub App token was refreshed but could not be validated due to a transient error (rate-limit, 5xx, or network issue). It may still work — proceed and retry if API calls fail.',
                        },
                        null,
                        2,
                      ),
                    },
                  ],
                };
              }
            }
          } catch {
            // Fall through to the error message below
          }
        }

        const fallback =
          auth.source === 'env'
            ? 'A GitHub token was found in the environment, but it appears to be invalid or expired. Double-check GH_TOKEN or GITHUB_TOKEN, or run `gh auth login` to refresh your credentials.'
            : auth.source === 'github-app'
              ? 'A GitHub App token was generated but could not be validated. Check that AGENT_AUTHOR_APP_PRIVATE_KEY is correct and the app installation is active.'
              : `A GitHub token was found via ${auth.source}, but it appears to be invalid or expired. Run \`gh auth login\` to refresh your credentials.`;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  configured: false,
                  source: auth.source,
                  user: null,
                  fallback,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (userResult.status === 'unknown') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  configured: 'unknown',
                  source: auth.source,
                  user: null,
                  reason: userResult.reason,
                  fallback:
                    'A GitHub token was found but could not be validated due to a transient error. It may still work — proceed and retry if API calls fail.',
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                configured: true,
                source: auth.source,
                user: userResult.login,
                fallback: null,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // --- github_close_pr ---
  server.tool(
    'github_close_pr',
    'Close a PR with optional comment.',
    {
      number: z.coerce.number().int().positive().describe('PR number'),
      comment: z.string().trim().min(1).optional().describe('Closing comment'),
    },
    async (params) => closePR(params),
  );

  // --- github_create_label ---
  server.tool(
    'github_create_label',
    'Create a label on the repository. Returns success if label already exists.',
    {
      name: z.string().trim().min(1).describe('Label name'),
      color: z
        .string()
        .regex(
          /^#?[0-9a-fA-F]{6}$/,
          'Must be 6 hex chars, optionally prefixed with #',
        )
        .optional()
        .describe('Hex color code (e.g. "ff0000" or "#ff0000")'),
      description: z.string().optional().describe('Label description'),
    },
    async (params) => createLabel(params),
  );

  // --- github_list_labels ---
  server.tool(
    'github_list_labels',
    'Prefer this over `gh label list` via shell. List all labels defined in the repository. Use before calling github_manage_labels or github_edit_pr to discover available label names.',
    {
      search: z
        .string()
        .optional()
        .describe(
          'Filter labels by name or description (case-insensitive substring match)',
        ),
    },
    async (params) => listLabels(params),
  );

  // --- github_get_repo_info ---
  server.tool(
    'github_get_repo_info',
    'Get repo info: owner, name, default branch, URL.',
    {},
    async () => getRepoInfo(),
  );

  // --- github_get_review_threads ---
  server.tool(
    'github_get_review_threads',
    'Fetch review threads on a PR via GraphQL. By default returns only UNRESOLVED threads (the ones blocking merge). Pass includeResolved: true to include all threads. IMPORTANT: isOutdated threads that are NOT resolved still block the merge queue — "outdated" means the code changed after the comment was posted, not that it was dismissed. Always use this tool first when debugging "A conversation must be resolved before this pull request can be merged" merge-queue errors. Each thread includes: id (PRRT_ node ID for github_resolve_threads), isResolved, isOutdated, isCollapsed, path, line, startLine (all thread-level for quick scanning without reading comments), plus per-comment databaseId, author, body, path, line. Pagination is capped at 100 threads and 50 comments per thread; truncated: true is set when results are paginated. Pass the PR number as "number" (preferred) or "prNumber" (alias).',
    {
      number: prNumberField('number').optional().describe('PR number'),
      prNumber: prNumberField('prNumber')
        .optional()
        .describe('Alias for "number" — use either, not both'),
      includeResolved: coercedBoolean
        .default(false)
        .describe(
          'Include resolved threads in results (default: false — returns only unresolved threads, including outdated-but-unresolved threads that still block merge)',
        ),
    },
    async (params) => {
      const resolved = params.number ?? params.prNumber;
      if (!resolved) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'Missing required parameter: provide "number" (or alias "prNumber") with a positive integer PR number.',
            },
          ],
        };
      }
      return getReviewThreads({
        number: resolved,
        includeResolved: params.includeResolved,
      });
    },
  );

  // --- github_list_prs ---
  server.tool(
    'github_list_prs',
    'Prefer this over `gh pr list` via shell. List PRs with optional filters. Auto-paginates to return all matching PRs (up to limit). Response includes total and hasMore fields.',
    {
      state: z
        .enum(['open', 'closed', 'merged', 'all'])
        .default('open')
        .describe('State filter (default: open)'),
      branch: z.string().optional().describe('Head branch filter'),
      author: z.string().optional().describe('Author filter'),
      label: z.string().optional().describe('Label filter'),
      search: z.string().optional().describe('Search query'),
      limit: z.coerce
        .number()
        .int()
        .positive()
        .max(500)
        .default(500)
        .describe(
          'Max total results across all pages (default: 500, auto-paginates)',
        ),
    },
    async (params) => listPRs(params),
  );

  // --- github_list_reviews ---
  server.tool(
    'github_list_reviews',
    'List reviews on a PR (or many PRs in one batched GraphQL call). Returns reviewer, state, submittedAt, bodyLength, and commentCount per review. Use to check whether Copilot APPROVED or COMMENTED, and whether inline comments exist (Copilot sometimes posts COMMENTED with 0 inline comments — a quirk that causes bot-review FAILURE but leaves no threads to fix). Pass `prs: number[]` (1-50) to fetch reviews for many PRs in one GraphQL round-trip; the response is `{ reviews: { [prNumber]: [...] }, missing: number[], truncated: number[] }`. Batch mode caps reviews at 100 per PR (GraphQL `first` limit); PRs whose totalCount exceeds the cap are listed in `truncated` so callers can fall back to single-PR mode if they need the full history.',
    {
      number: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe('PR number (single-PR mode). Use `prs` for batch mode.'),
      prs: z
        .array(z.coerce.number().int().positive())
        .min(1)
        .max(50)
        .optional()
        .describe(
          'Batch mode: PR numbers (1-50). When provided, reviews for all PRs are fetched in one batched GraphQL call and returned as a map keyed by PR number. Bad PR numbers are reported in `missing` and do not fail the whole call.',
        ),
      reviewer: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
          'Filter by reviewer login (e.g. "copilot-pull-request-reviewer[bot]")',
        ),
      latestOnly: coercedBoolean
        .default(true)
        .describe(
          'When true (default), return only the most recent review per reviewer. Set false to return all reviews.',
        ),
    },
    async (params) => listReviews(params),
  );

  // --- github_reply_to_review / github_reply_to_review_thread ---
  // Both names resolve to the same schema and handler (LS-4233).
  // github_reply_to_review_thread is the canonical search name agents use during bot-review cycles.
  const registerReplyToReview = (toolName: string, toolDescription: string) => {
    server.tool(
      toolName,
      toolDescription,
      {
        body: z
          .string()
          .trim()
          .min(1, 'Reply body cannot be empty')
          .describe(
            'Markdown body of the reply comment (e.g. "FIX: abc1234" or "JUSTIFY: not a bug")',
          ),
        threadId: z
          .string()
          .optional()
          .describe(
            'GraphQL node ID of the review thread (from github_get_review_threads). Use this OR commentId+number, never both.',
          ),
        commentId: z.coerce
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            'Numeric REST comment ID (databaseId from github_get_review_threads). Requires "number" or "prNumber" param. Use this OR threadId, never both.',
          ),
        number: z.coerce
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            'PR number. Required when using commentId. Alias: prNumber.',
          ),
        prNumber: z.coerce
          .number()
          .int()
          .positive()
          .optional()
          .describe('Alias for "number" — use either, not both.'),
      },
      async (params) => {
        const validation = resolveReplyToReviewInput(params);
        if ('error' in validation) {
          return {
            isError: true,
            content: [{ type: 'text', text: validation.error }],
          };
        }
        return replyToReview(validation);
      },
    );
  };

  registerReplyToReview(
    'github_reply_to_review',
    'Post a reply to a PR review thread. Provide EITHER threadId (GraphQL node ID) OR both commentId AND number/prNumber (REST) — not both paths at once.',
  );
  registerReplyToReview(
    'github_reply_to_review_thread',
    'Post a reply to a PR review thread (use for FIX: <sha> or JUSTIFY: <rationale> bot-review replies). Canonical name for ToolSearch. Identical to github_reply_to_review. Provide EITHER threadId (GraphQL node ID) OR both commentId AND number/prNumber (REST) — not both paths at once.',
  );

  // --- github_comment_pr ---
  server.tool(
    'github_comment_pr',
    'Post a general (top-level) comment on a PR. Use for diagnostic notes, blocker explanations, and status updates — distinct from review thread replies (use github_reply_to_review for those). Maps to POST /repos/{owner}/{repo}/issues/{number}/comments.',
    {
      number: z.coerce.number().int().positive().describe('PR number'),
      body: z
        .string()
        .trim()
        .min(1, 'Comment body cannot be empty')
        .describe('Markdown body of the comment'),
    },
    async (params) => commentPR(params),
  );

  // --- github_list_pr_comments (consolidated) ---
  server.tool(
    'github_list_pr_comments',
    'Read comments on a PR. Use type to scope: "all" (default) returns top-level + inline merged; "top-level" returns issue comments; "inline" returns PR review comments tied to diff lines; "review" returns inline comments with reviewId-aware filtering. Optional filters: reviewId (review/all), path (inline/review/all), since (ISO 8601). Handles pagination automatically. Pass the PR number as "prNumber" (preferred) or "number" (alias).',
    {
      prNumber: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe('PR or issue number'),
      number: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe('Alias for "prNumber" — use either, not both'),
      type: z
        .enum(['all', 'top-level', 'inline', 'review'])
        .optional()
        .describe(
          'Scope of comments to return. Default "all" returns merged top-level + inline.',
        ),
      reviewId: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          'Filter inline/review comments to a specific review submission (pull_request_review_id)',
        ),
      path: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
          'Filter inline/review comments to a specific file path (exact match)',
        ),
      since: z
        .string()
        .optional()
        .describe(
          'ISO 8601 timestamp — only return comments posted at or after this time',
        ),
    },
    async (params) => {
      const prNum = params.prNumber ?? params.number;
      if (!prNum) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'Missing required parameter: provide "prNumber" (or alias "number") with a positive integer PR or issue number.',
            },
          ],
        };
      }
      return listPRComments({
        number: prNum,
        type: params.type,
        reviewId: params.reviewId,
        path: params.path,
        since: params.since,
      });
    },
  );

  // --- github_list_pr_inline_comments (DEPRECATED alias) ---
  server.tool(
    'github_list_pr_inline_comments',
    'DEPRECATED: use github_list_pr_comments with type: "inline" instead. Returns inline PR review comments; will be removed in a future release.',
    {
      number: z.coerce.number().int().positive().describe('PR number'),
      path: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe('Filter to a specific file path (exact match)'),
      since: z
        .string()
        .optional()
        .describe(
          'ISO 8601 timestamp — only return comments posted at or after this time',
        ),
    },
    async (params) => listPRInlineComments(params),
  );

  // --- github_list_review_comments (DEPRECATED alias) ---
  server.tool(
    'github_list_review_comments',
    'DEPRECATED: use github_list_pr_comments with type: "review" instead. Returns inline PR review comments with reviewId filtering; will be removed in a future release.',
    {
      number: z.coerce.number().int().positive().describe('PR number'),
      since: z
        .string()
        .optional()
        .describe(
          'ISO 8601 timestamp — only return comments created at or after this time',
        ),
      reviewId: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          'Filter to comments from a specific review submission (pull_request_review_id)',
        ),
    },
    async (params) => listReviewComments(params),
  );

  // --- github_edit_pr ---
  server.tool(
    'github_edit_pr',
    "Update a PR's title and/or body. Use when Copilot or reviewers request description fixes. Maps to PATCH /repos/{owner}/{repo}/pulls/{pull_number}.",
    {
      number: z.coerce.number().int().positive().describe('PR number'),
      title: z.string().trim().min(1).optional().describe('New PR title'),
      body: z.string().optional().describe('New PR body (markdown)'),
    },
    async (params) => editPR(params),
  );

  // --- github_bulk_edit ---
  server.tool(
    'github_bulk_edit',
    'Batch variant of github_edit_pr. Update title and/or body across many PRs in one call (1-50). For label changes across many PRs use github_manage_labels (it already accepts an array of PR numbers). Each item is { number, title?, body? } — at least one of title/body required per item. Returns { success, total, succeeded, failed } per the shared batch-tool convention.',
    {
      items: z
        .array(
          z.object({
            number: prNumberField('items[].number').describe('PR number'),
            title: z.string().trim().min(1).optional().describe('New PR title'),
            body: z.string().optional().describe('New PR body (markdown)'),
          }),
        )
        .min(1)
        .max(50)
        .describe('PR edits (1-50). Each entry needs at least title or body.'),
    },
    async (params) => bulkEdit(params),
  );

  // --- github_bulk_comment ---
  server.tool(
    'github_bulk_comment',
    'Batch variant of github_comment_pr. Post a top-level comment on many PRs in one call (1-50). For sweeping the same body across PRs, the same body can simply be supplied per item. Returns { success, total, succeeded, failed } per the shared batch-tool convention.',
    {
      items: z
        .array(
          z.object({
            number: prNumberField('items[].number').describe('PR number'),
            body: z
              .string()
              .trim()
              .min(1, 'Comment body cannot be empty')
              .describe('Markdown body of the comment'),
          }),
        )
        .min(1)
        .max(50)
        .describe('Comments to post (1-50).'),
    },
    async (params) => bulkComment(params),
  );

  // --- github_bulk_reply_to_review ---
  server.tool(
    'github_bulk_reply_to_review',
    'Batch variant of github_reply_to_review. Post replies on many review threads in one call (1-50). Each reply takes EITHER threadId (GraphQL node ID) OR commentId + number/prNumber (REST) — the same resolution rules as the single-item tool, mixed within one batch. Returns { success, total, succeeded, failed } per the shared batch-tool convention. For the structured Author Agent end-of-round flow (FIX/JUSTIFY/CANNOT-COMPLY with auto-resolve), prefer github_finish_fix_round.',
    {
      replies: z
        .array(
          z.object({
            body: z
              .string()
              .trim()
              .min(1, 'Reply body cannot be empty')
              .describe('Markdown body of the reply'),
            threadId: z
              .string()
              .optional()
              .describe(
                'GraphQL node ID of the review thread (use this OR commentId+number, not both).',
              ),
            commentId: z.coerce
              .number()
              .int()
              .positive()
              .optional()
              .describe(
                'Numeric REST comment databaseId. Requires number/prNumber.',
              ),
            number: z.coerce
              .number()
              .int()
              .positive()
              .optional()
              .describe(
                'PR number — required when using commentId. Alias: prNumber.',
              ),
            prNumber: z.coerce
              .number()
              .int()
              .positive()
              .optional()
              .describe('Alias for "number".'),
          }),
        )
        .min(1)
        .max(50)
        .describe('Replies (1-50).'),
    },
    async (params) => bulkReplyToReview(params),
  );

  // --- github_manage_labels ---
  server.tool(
    'github_manage_labels',
    'Prefer this over `gh pr edit --add-label` via shell. Add or remove labels on one or more PRs. Pass a single PR number via "prNumber", or one or more PR numbers via "prs". When multiple PRs are given, all get the same label changes. Use "clearPattern" (glob, e.g. "ci-failure-*") to remove all labels matching a pattern — composes with "add" and "remove".',
    {
      prs: z
        .preprocess(
          (v) => {
            if (v === undefined || v === null) return undefined;
            if (Array.isArray(v)) return v;
            if (typeof v === 'string' && v.trimStart().startsWith('[')) {
              try {
                const parsed = JSON.parse(v);
                if (Array.isArray(parsed)) return parsed;
              } catch {
                // Not valid JSON — fall through to wrap as single element
              }
            }
            return [v];
          },
          z.array(prNumberField('prs[]')).min(1).max(100).optional(),
        )
        .describe(
          'PR number or array of PR numbers (use "prNumber" for a single PR)',
        ),
      prNumber: prNumberField('prNumber')
        .optional()
        .describe(
          'Single PR number — alias for prs:[n]. Use either "prNumber" or "prs", not both.',
        ),
      add: labelList.optional().describe('Labels to add'),
      remove: labelList.optional().describe('Labels to remove'),
      clearPattern: z
        .string()
        .optional()
        .describe(
          'Glob pattern — labels matching this are removed (e.g. "ci-failure-*"). Composes with "add" and "remove".',
        ),
    },
    async (params) => {
      const prs =
        params.prs ??
        (params.prNumber !== undefined ? [params.prNumber] : undefined);
      if (!prs?.length) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'Missing required parameter: provide "prNumber" (single PR) or "prs" (one or more PR numbers).',
            },
          ],
        };
      }
      return manageLabels({
        prs,
        add: params.add,
        remove: params.remove,
        clearPattern: params.clearPattern,
      });
    },
  );

  // --- github_merge_pr ---
  server.tool(
    'github_merge_pr',
    'Prefer this over `gh pr merge` via shell. Merge a PR. Default: merge queue (strategy: "queue") — enables auto-merge via GraphQL, no local git checkout. "direct" uses --admin (requires authorization). Pass the PR number as "number" (preferred) or "prNumber" (alias). NOTE: PRs that modify .github/workflows/ files require the PAT to have the `workflow` OAuth scope — if the merge returns a 403 mentioning "workflow scope", escalate to the user to merge manually or reconfigure the token. To enable auto-merge with a configurable merge method, use `github_pr_enable_auto_merge` instead.',
    {
      number: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe('PR number'),
      prNumber: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe('Alias for "number" — use either, not both'),
      strategy: z
        .enum(['queue', 'direct'])
        .default('queue')
        .describe(
          '"queue" (default) or "direct" (--admin, requires authorization)',
        ),
    },
    async (params) => {
      const resolved = params.number ?? params.prNumber;
      if (!resolved) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'Missing required parameter: provide "number" (or alias "prNumber") with a positive integer PR number.',
            },
          ],
        };
      }
      return mergePR({ number: resolved, strategy: params.strategy });
    },
  );

  // --- github_bulk_merge ---
  server.tool(
    'github_bulk_merge',
    'Batch variant of github_merge_pr. Merge many PRs in one call (1-50). Each item is { number, strategy? } where strategy defaults to "queue" (auto-merge via GraphQL) and "direct" uses admin REST merge. Returns { success, total, succeeded, failed } per the shared batch-tool convention — one PR\'s failure does not abort the rest.',
    {
      items: z
        .array(
          z.object({
            number: prNumberField('items[].number').describe('PR number'),
            strategy: z
              .enum(['queue', 'direct'])
              .optional()
              .describe(
                '"queue" (default) enables auto-merge; "direct" merges via admin REST.',
              ),
          }),
        )
        .min(1)
        .max(50)
        .describe('PRs to merge (1-50).'),
    },
    async (params) => bulkMerge(params),
  );

  // --- github_pr_enable_auto_merge ---
  server.tool(
    'github_pr_enable_auto_merge',
    'Enable auto-merge on a PR via the GitHub GraphQL API. The PR will merge automatically once all required checks pass. Use this instead of `gh pr merge --auto`, which fails in worktree sessions because it tries to check out the base branch locally. Pass the PR number as "number" (preferred) or "prNumber" (alias).',
    {
      number: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe('PR number'),
      prNumber: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe('Alias for "number" — use either, not both'),
      mergeMethod: z
        .enum(['SQUASH', 'MERGE', 'REBASE'])
        .default('SQUASH')
        .describe('Merge method to use when auto-merging (default: SQUASH)'),
    },
    async (params) => {
      if (params.number !== undefined && params.prNumber !== undefined) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'Ambiguous input: both "number" and "prNumber" were provided. Pass only one.',
            },
          ],
        };
      }
      const resolved = params.number ?? params.prNumber;
      if (!resolved) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'Missing required parameter: provide "number" (or alias "prNumber") with a positive integer PR number.',
            },
          ],
        };
      }
      return enableAutoMerge({
        prNumber: resolved,
        mergeMethod: params.mergeMethod,
      });
    },
  );

  // --- github_mark_pr_ready ---
  server.tool(
    'github_mark_pr_ready',
    'Convert a draft PR to ready for review and apply the bot:ready-for-review label (the Reviewer Bot trigger). Use after validation passes to signal the PR is ready for sweep/review agents. The label is applied last and is idempotent, so fix-push cycles re-trigger review without a separate label call.',
    {
      number: z.coerce.number().int().positive().describe('PR number'),
      applyReadyLabel: coercedBoolean
        .default(true)
        .describe(
          'Apply the bot:ready-for-review label after marking ready (default true). Set false only when the caller manages the label itself (e.g. a remove-then-add re-trigger).',
        ),
    },
    async (params) => markPRReady(params),
  );

  // --- github_pr_batch_status ---
  server.tool(
    'github_pr_batch_status',
    'Detailed status for specific PRs: mergeable, CI jobs, reviews, unresolved threads. Batched GraphQL.',
    {
      numbers: z
        .array(z.coerce.number().int().positive())
        .min(1)
        .max(50)
        .describe('PR numbers'),
      compact: coercedBoolean
        .default(false)
        .describe(
          'Return only essential fields (number, branch, mergeable, ciSummary, failedJobs, unresolvedThreads) to reduce token usage',
        ),
    },
    async (params) => prBatchStatus(params),
  );

  // --- github_pr_why_blocked ---
  server.tool(
    'github_pr_why_blocked',
    'Diagnose why a PR is not moving forward. Returns a structured reason (DRAFT, MERGE_CONFLICT, CI_FAILING, CHANGES_REQUESTED, UNRESOLVED_THREADS, AWAITING_REVIEW, CI_PENDING, IN_MERGE_QUEUE, READY, MERGED, etc.), a one-line summary, relevant details, and a concrete next action. Use this instead of manually cross-referencing github_view_pr + check runs + review state.',
    {
      number: z.coerce
        .number()
        .int()
        .positive()
        .describe('PR number to diagnose'),
    },
    async (params) => prWhyBlocked(params),
  );

  // --- github_pr_dashboard ---
  server.tool(
    'github_pr_dashboard',
    'Triage dashboard: open PRs with mergeable status, CI state, unresolved threads, labels, and summary counts. Default output is a compact markdown table (PR/Title/Branch/CI/Reviews/Threads/Ready) with a Blocked PRs section; pass format:"json" for the full structured payload.',
    {
      state: z
        .enum(['open', 'closed', 'merged', 'all'])
        .default('open')
        .describe('State filter (default: open)'),
      author: z.string().optional().describe('Author filter'),
      label: z.string().optional().describe('Label filter'),
      limit: z.coerce
        .number()
        .int()
        .positive()
        .max(100)
        .default(30)
        .describe('Max results (default: 30)'),
      excludeDrafts: coercedBoolean
        .default(true)
        .describe(
          'Exclude draft PRs from dashboard results (default: true). Draft PRs are being worked on by their creating agent.',
        ),
      format: z
        .enum(['markdown', 'json'])
        .default('markdown')
        .describe(
          'Output format. "markdown" (default) returns a triage table with summary counts and a Blocked PRs section — ~40-60% fewer tokens than JSON. "json" returns the full structured payload (summary, prs[], recommendBatchStatus) for programmatic callers.',
        ),
    },
    async (params) => prDashboard(params),
  );

  // --- github_pr_scan ---
  server.tool(
    'github_pr_scan',
    'Scan open PRs into buckets: conflicting, reviews, ciFailing, ciPending, clean. Syncs CI failure labels by default.',
    {
      limit: z.coerce
        .number()
        .int()
        .positive()
        .max(100)
        .default(100)
        .describe('Max PRs to scan (default: 100, max: 100)'),
      applyLabels: coercedBoolean
        .default(true)
        .describe('Sync CI failure labels (default: true)'),
      compact: coercedBoolean
        .default(false)
        .describe(
          'Return a compact view with essential fields (number, branch, failedChecks, threadCount), plus threadsTruncated for review buckets and labelActions when labels are applied, to reduce token usage',
        ),
      excludeDrafts: coercedBoolean
        .default(true)
        .describe(
          'Exclude draft PRs from scan results (default: true). Draft PRs are being worked on by their creating agent and should not be swept.',
        ),
      excludeLabels: labelList
        .optional()
        .describe(
          'Exclude PRs that have any of these labels. Useful for filtering out sweep-claimed PRs. Default: no exclusions.',
        ),
    },
    async (params) => prScan(params),
  );

  // --- github_bulk_rebase ---
  server.tool(
    'github_bulk_rebase',
    "Batch variant of github_rebase_pr. Rebase many PR branches onto base and force-push (1-50). Runs sequentially because rebase mutates the local checkout. Returns { success, total, succeeded, failed } per the shared batch-tool convention — one PR's rebase conflict does not abort the rest. Conflict details are captured in the per-PR error.",
    {
      numbers: z
        .array(prNumberField('numbers[]'))
        .min(1)
        .max(50)
        .describe('PR numbers to rebase (1-50). Processed in order.'),
    },
    async (params) => bulkRebase(params),
  );

  // --- github_request_review ---
  server.tool(
    'github_request_review',
    'Request reviewers on one or more PRs. Accepts a single PR number or array via "prs", or a single PR number via "prNumber" (alias for prs:[n]). Requests Copilot by default.',
    {
      prs: z
        .preprocess((v) => {
          if (v === undefined || v === null) return undefined;
          if (Array.isArray(v)) return v;
          if (typeof v === 'string' && v.trimStart().startsWith('[')) {
            try {
              const parsed = JSON.parse(v);
              if (Array.isArray(parsed)) return parsed;
            } catch {
              // Not valid JSON — fall through to wrap as single element
            }
          }
          return [v];
        }, z.array(z.coerce.number().int().positive()).min(1).max(100).optional())
        .describe(
          'PR number or array of PR numbers (use "prNumber" for a single PR)',
        ),
      prNumber: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          'Single PR number — alias for prs:[n]. Use either "prNumber" or "prs", not both.',
        ),
      reviewers: z
        .array(z.string())
        .optional()
        .describe('Human reviewer usernames'),
      copilot: coercedBoolean
        .default(true)
        .describe('Request Copilot review (default: true)'),
    },
    async (params) => {
      const prs =
        params.prs ??
        (params.prNumber !== undefined ? [params.prNumber] : undefined);
      if (!prs?.length) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'Missing required parameter: provide "prNumber" (single PR) or "prs" (one or more PR numbers).',
            },
          ],
        };
      }
      return requestReview({ ...params, prs });
    },
  );

  // --- github_finish_fix_round ---
  server.tool(
    'github_finish_fix_round',
    'Semantic one-shot for the Author Agent Contract end-of-round: posts per-thread FIX/JUSTIFY/CANNOT-COMPLY replies, resolves the FIX threads, and applies the bot:ready-for-review label that re-triggers the Reviewer Bot cycle. Validates every reply BEFORE any side effect (FIX requires `sha`, JUSTIFY/CANNOT-COMPLY require `body`) — a single invalid entry rejects the whole call. FIX reply body is emitted as exactly `FIX: <sha>` (no trailing prose — the bot is strict). JUSTIFY/CANNOT-COMPLY bodies are prefixed with the kind token if not already present. Partial failures do not block successful replies: failed replies are surfaced in `errors[]` and their threads are NOT resolved. Only FIX threads are resolved — JUSTIFY and CANNOT-COMPLY remain open for bot/human adjudication in the next cycle. Replaces the three-step github_reply_to_review_thread → github_resolve_threads → github_manage_labels(add: bot:ready-for-review) sequence.',
    {
      prNumber: prNumberField('prNumber').describe('PR number'),
      replies: z
        .array(
          z.object({
            threadId: z
              .string()
              .trim()
              .min(1)
              .describe('GraphQL thread node ID (PRRT_...)'),
            kind: z
              .enum(['FIX', 'JUSTIFY', 'CANNOT-COMPLY'])
              .describe('Reply kind per Author Agent Contract'),
            sha: z
              .string()
              .trim()
              .min(1)
              .optional()
              .describe(
                'Commit SHA the fix is committed at. Required when kind=FIX; ignored otherwise.',
              ),
            body: z
              .string()
              .trim()
              .min(1)
              .optional()
              .describe(
                'Rationale text. Required when kind=JUSTIFY or CANNOT-COMPLY; ignored for FIX.',
              ),
          }),
        )
        .min(1)
        .max(100)
        .describe('One entry per thread to reply to.'),
      readyLabel: z
        .string()
        .trim()
        .min(1)
        .default('bot:ready-for-review')
        .describe(
          'Label to apply after replying + resolving (default: bot:ready-for-review)',
        ),
    },
    async (params) => finishFixRound(params),
  );

  // --- github_resolve_threads ---
  server.tool(
    'github_resolve_threads',
    'Batch-resolve review threads (groups of 50). Accepts PRRT_ thread node IDs (from github_get_review_threads) via threadIds, OR numeric comment databaseIds (from mcp__github__* get_review_comments or github_get_review_threads comment entries) via commentDatabaseIds — the tool maps comment IDs to thread IDs internally. When using commentDatabaseIds, prNumber is required. If prNumber is provided and all threads resolved, triggers bot-review recheck.',
    {
      threadIds: stringList({ min: 1, max: 100 })
        .optional()
        .describe(
          'Thread node IDs (PRRT_...) from github_get_review_threads. Use this OR commentDatabaseIds.',
        ),
      commentDatabaseIds: z
        .preprocess((val) => {
          if (Array.isArray(val)) return val;
          if (typeof val === 'string' && val.trimStart().startsWith('[')) {
            try {
              const parsed = JSON.parse(val);
              if (Array.isArray(parsed)) return parsed;
            } catch {
              // Not valid JSON — fall through
            }
          }
          return val;
        }, z.array(z.coerce.number().int().positive()).min(1).max(100))
        .optional()
        .describe(
          'Numeric comment databaseId values (REST IDs) — alternative to threadIds when you only have comment IDs (e.g. from mcp__github__* get_review_comments). Requires prNumber. The tool fetches thread IDs from the PR and maps each comment ID to its parent thread.',
        ),
      prNumber: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          'PR number — required when using commentDatabaseIds; also triggers Copilot Auto-Approve recheck after resolving threads when all resolutions succeed',
        ),
    },
    async (params) => resolveThreads(params),
  );

  // --- github_secrets_check ---
  server.tool(
    'github_secrets_check',
    'List all repo secret names or check specific secrets exist. Returns names, createdAt, updatedAt (never values). When names are omitted, lists all; when provided, returns per-secret exists status.',
    {
      names: z
        .array(z.string())
        .min(1)
        .optional()
        .describe(
          'Specific secret names to check for existence. If omitted, lists all secret names.',
        ),
    },
    async (params) => secretsCheck(params),
  );

  // --- github_pr_commits ---
  server.tool(
    'github_pr_commits',
    'List commits on a pull request. Returns sha, shortSha, message (first line), author, date, and url for each commit. Useful for correlating pushes with review events or inspecting PR history.',
    {
      number: z.coerce.number().int().positive().describe('PR number'),
      limit: z.coerce
        .number()
        .int()
        .positive()
        .max(100)
        .default(30)
        .describe('Max commits to return (default: 30, max: 100)'),
    },
    async (params) => prCommits(params),
  );

  // --- github_view_pr ---
  server.tool(
    'github_view_pr',
    'Prefer this over `gh pr view` or `gh pr diff --name-only` via shell. By default returns a compact card: number, title, state, isDraft, headRefName, baseRefName, url, labels, reviewDecision, additions, deletions, changedFiles, commits.totalCount, and checksSummary. Pass optional "fields" array to opt-in to heavy fields: "body" (full PR description), "files" (changed-files list), "reviews", "assignees", "milestone". Pass the PR number as "number" (preferred) or "prNumber" (alias).',
    {
      number: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe('PR number'),
      prNumber: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe('Alias for "number" — use either, not both'),
      fields: z
        .array(z.enum(['body', 'files', 'reviews', 'assignees', 'milestone']))
        .optional()
        .describe(
          'Opt-in extra fields beyond the compact default. E.g. ["body","files"] to include the PR description and changed-files list.',
        ),
    },
    async (params) => {
      const resolved = params.number ?? params.prNumber;
      if (!resolved) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'Missing required parameter: provide "number" (or alias "prNumber") with a positive integer PR number.',
            },
          ],
        };
      }
      return viewPR({ number: resolved, fields: params.fields });
    },
  );

  // --- github_pr_diff ---
  server.tool(
    'github_pr_diff',
    'Prefer this over `gh pr diff` via shell. Returns the unified diff for a pull request. Useful for inspecting the exact code changes introduced by a PR, especially dependency PRs that have not yet merged. Pass the PR number as "prNumber". Use maxBytes to cap response size for very large PRs (default: 500 000 bytes).',
    {
      prNumber: z.coerce
        .number()
        .int()
        .positive()
        .describe('PR number to fetch the unified diff for'),
      maxBytes: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          'Maximum bytes of diff to return (default: 500 000). Increase for large PRs.',
        ),
    },
    async (params) => prDiff(params),
  );

  // --- github_secret_delete ---
  server.tool(
    'github_secret_delete',
    'Delete a GitHub Actions secret from the repository.',
    {
      name: z
        .string()
        .trim()
        .regex(
          /^[A-Za-z_][A-Za-z0-9_]*$/,
          'Secret name must start with a letter or underscore and contain only alphanumeric characters and underscores',
        )
        .refine((n) => !n.startsWith('GITHUB_'), {
          message: 'Secret names cannot start with GITHUB_',
        })
        .describe('Secret name to delete'),
    },
    async (params) => secretDelete(params),
  );

  // --- github_secret_set ---
  server.tool(
    'github_secret_set',
    'Set a GitHub Actions secret. Reads value from file to avoid passing secrets through the tool interface.',
    {
      name: z
        .string()
        .trim()
        .min(1)
        .describe('Secret name (e.g. "AGENT_AUTHOR_APP_PRIVATE_KEY")'),
      value: z.string().optional().describe('Secret value (prefer valueFile)'),
      valueFile: z
        .string()
        .optional()
        .describe('Path to file containing secret value'),
    },
    async (params) => secretSet(params),
  );

  // --- github_retrigger_check ---
  server.tool(
    'github_retrigger_check',
    'Re-request failed status checks on a PR. Eliminates need for empty commits to clear stale failures. Pass the PR number via "number" or its alias "prNumber".',
    {
      number: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe('PR number'),
      prNumber: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe('Alias for "number" — use either, not both.'),
      checkName: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
          'Specific check name to re-request (retriggers all matching)',
        ),
      allFailed: coercedBoolean
        .default(false)
        .describe(
          'When true, retrigger all failed checks. When false (default), retrigger only the named check or all failed checks if no checkName given.',
        ),
    },
    async (params) => {
      const resolvedNumber = params.number ?? params.prNumber;
      if (!resolvedNumber) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'Missing required parameter: provide "number" or "prNumber" (PR number).',
            },
          ],
        };
      }
      return retriggerCheck({
        number: resolvedNumber,
        checkName: params.checkName,
        allFailed: params.allFailed,
      });
    },
  );

  // --- github_get_check_runs ---
  server.tool(
    'github_get_check_runs',
    'List check runs for a PR or commit SHA. Returns the latest run per check name — includes name, status, conclusion, output (title + summary), and app slug. Use instead of `gh api repos/.../commits/$SHA/check-runs` to inspect required status checks (bot-review, Quality Gates, Build Validation, etc.). Pass the PR number as "number" (preferred) or "prNumber" (alias). For multi-commit/cross-branch inspection, pass "shas" (1-25) to fetch many commits in one call — returns { checkRuns: { [sha]: [...] }, missing: [{ sha, error }] }. Pass resolveRunId: true to also extract workflowRunId and jobId from each check run\'s details URL — use these directly with ci_get_logs or ci_search_logs without falling back to gh api.',
    {
      number: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe('PR number — auto-resolves to the current HEAD SHA'),
      prNumber: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe('Alias for "number" — use either, not both'),
      sha: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
          'Commit SHA (full or abbreviated). Takes precedence over prNumber/number if both are given.',
        ),
      shas: z
        .array(z.string().trim().min(1))
        .min(1)
        .max(25)
        .optional()
        .describe(
          'Batch mode: 1-25 commit SHAs to fetch in parallel (concurrency capped at 5). Returns { checkRuns: { [sha]: [...] }, missing: [{ sha, error }] }. Takes precedence over sha/prNumber/number.',
        ),
      checkName: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
          'Filter results to a specific check name (e.g. "bot-review")',
        ),
      resolveRunId: z
        .boolean()
        .optional()
        .describe(
          'When true, parse details_url/html_url on each check run to extract workflowRunId and jobId (GitHub Actions run and job IDs). Included in response only when resolvable. Use to feed ci_get_logs / ci_search_logs without a gh api fallback.',
        ),
    },
    async (params) => {
      const prNumber = params.number ?? params.prNumber;
      return getCheckRuns({
        prNumber,
        sha: params.sha,
        shas: params.shas,
        checkName: params.checkName,
        resolveRunId: params.resolveRunId,
      });
    },
  );

  // --- github_set_commit_status ---
  server.tool(
    'github_set_commit_status',
    'Set a commit status on a PR. Auto-resolves head SHA from PR number. Use to update stale bot-review or custom statuses.',
    {
      number: z.coerce.number().int().positive().describe('PR number'),
      context: z
        .string()
        .trim()
        .min(1)
        .describe('Status context name (e.g. "bot-review")'),
      state: z
        .enum(['success', 'failure', 'pending', 'error'])
        .describe('Status state'),
      description: z
        .string()
        .trim()
        .optional()
        .describe('Human-readable description'),
    },
    async (params) => setCommitStatus(params),
  );

  // --- github_list_commit_statuses ---
  server.tool(
    'github_list_commit_statuses',
    'List GitHub commit statuses (Statuses API) for a specific commit SHA or a PR\'s HEAD commit. These are DISTINCT from Check Runs (Checks API) — bot-review and security-scan statuses appear here, not in github_retrigger_check. Use this to diagnose "check not found" errors or confirm whether a bot-review status has updated after threads were resolved. Provide either "sha" (direct SHA), "prNumber", or its alias "number" (both auto-resolve to HEAD SHA). Use "context" to filter to a single status context.',
    {
      sha: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
          'Commit SHA to read statuses for. Use this OR prNumber/number, not both.',
        ),
      prNumber: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          'PR number — auto-resolves to the HEAD commit SHA. Use this OR sha, not both.',
        ),
      number: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe('Alias for "prNumber" — use either, not both.'),
      context: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
          'Filter to a specific status context (e.g. "bot-review", "security-scan"). Omit to return all contexts.',
        ),
    },
    async (params) => {
      const resolvedPrNumber = params.prNumber ?? params.number;
      if (!params.sha && !resolvedPrNumber) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'Missing required parameter: provide "sha" (commit SHA) or "prNumber"/"number" (PR number to auto-resolve HEAD SHA).',
            },
          ],
        };
      }
      return listCommitStatuses({
        sha: params.sha,
        prNumber: resolvedPrNumber,
        context: params.context,
      });
    },
  );

  // --- github_ensure_sweep_labels ---
  server.tool(
    'github_ensure_sweep_labels',
    'Idempotently ensure the sweep coordination labels (sweep-claimed, sweep-stale-claim) exist on the repository. Safe to call at sweep startup every time — creates missing labels and no-ops if they already exist.',
    {},
    async () => ensureSweepLabels(),
  );

  // --- github_sweep_stale_claims ---
  server.tool(
    'github_sweep_stale_claims',
    'Find PRs with a stale sweep-claimed label (agent claimed but did not release). Uses label event timestamps for accuracy — more reliable than PR updatedAt, which reflects the last PR activity rather than when the label was applied.',
    {
      olderThanMinutes: z.coerce
        .number()
        .int()
        .positive()
        .default(30)
        .describe(
          'Minimum age in minutes for a claim to be considered stale (default: 30)',
        ),
    },
    async (params) => sweepStaleClaims(params),
  );

  // --- github_list_runners ---
  server.tool(
    'github_list_runners',
    'List self-hosted GitHub Actions runners for this repository. Returns id, name, OS, status (online/offline), busy flag, and labels.',
    {
      status: z
        .enum(['online', 'offline'])
        .optional()
        .describe(
          'Filter by runner status. Omit to return all runners regardless of status.',
        ),
    },
    async (params) => listRunners(params),
  );

  // --- github_webhook_list ---
  server.tool(
    'github_webhook_list',
    'List all webhooks configured on this repository. Returns id, active status, events, URL, and last response.',
    {},
    async () => webhookList(),
  );

  // --- github_webhook_update ---
  server.tool(
    'github_webhook_update',
    'Update a repository webhook. Can change active status, event subscriptions, delivery URL, or content type.',
    {
      hookId: z.coerce
        .number()
        .int()
        .positive()
        .describe('Webhook ID (from github_webhook_list).'),
      active: coercedBoolean
        .optional()
        .describe('Enable or disable the webhook.'),
      events: stringList()
        .optional()
        .describe(
          'GitHub event names to subscribe to (e.g. ["push", "pull_request"]). Replaces the full event list.',
        ),
      url: z
        .string()
        .url()
        .optional()
        .describe('New delivery URL for the webhook.'),
      contentType: z
        .enum(['json', 'form'])
        .optional()
        .describe('Payload content type (default: json).'),
    },
    async (params) => webhookUpdate(params),
  );

  // --- github_webhook_ping ---
  server.tool(
    'github_webhook_ping',
    'Send a ping event to a repository webhook to verify it is reachable.',
    {
      hookId: z.coerce
        .number()
        .int()
        .positive()
        .describe('Webhook ID (from github_webhook_list).'),
    },
    async (params) => webhookPing(params),
  );

  // --- github_get_file_content ---
  server.tool(
    'github_get_file_content',
    'Read the contents of a file at a specific git ref (branch, tag, or commit SHA) without checking out a worktree. Returns {path, ref, content, sha}. Useful for PR triage and review agents that need to inspect files on remote branches.',
    {
      path: z
        .string()
        .trim()
        .min(1)
        .describe(
          'File path relative to repo root (e.g. "apps/web/src/pages/Login.tsx").',
        ),
      ref: z
        .string()
        .optional()
        .describe('Branch name, tag, or commit SHA (defaults to "main").'),
    },
    async (params) => getFileContent(params),
  );

  // --- github_get_branch_protection ---
  server.tool(
    'github_get_branch_protection',
    'Read branch protection rules and GitHub rulesets for a branch. Returns required status checks (from both classic protection and active rulesets), conversation resolution requirement, required review count, and a summary of all rulesets. Use this to diagnose why a PR is stuck in the merge queue or to understand which checks are truly required vs. informational.',
    {
      branch: z
        .string()
        .trim()
        .min(1)
        .default('main')
        .describe('Branch name to query (default: "main").'),
    },
    async (params) => getBranchProtection(params),
  );

  // --- github_resolve_action_sha ---
  server.tool(
    'github_resolve_action_sha',
    'Resolve a GitHub Actions tag (e.g. "v4") to its immutable commit SHA for supply-chain pinning. Returns the SHA, original tag, and whether the tag was lightweight or annotated. Use this before pinning action references in workflow files. For bulk resolution use github_resolve_action_shas.',
    {
      owner: z
        .string()
        .trim()
        .min(1)
        .describe(
          'GitHub organisation or user that owns the action repo (e.g. "actions").',
        ),
      repo: z
        .string()
        .trim()
        .min(1)
        .describe('Repository name of the action (e.g. "checkout").'),
      tag: z
        .string()
        .trim()
        .min(1)
        .describe('Mutable tag to resolve (e.g. "v4" or "v4.1.0").'),
    },
    async (params) => resolveActionSha(params),
  );

  // --- github_resolve_action_shas ---
  server.tool(
    'github_resolve_action_shas',
    'Resolve multiple GitHub Actions tags to their immutable commit SHAs in a single call. Runs all resolutions in parallel. Each result includes the action, sha, tag, and tagType ("lightweight" | "annotated"). Failed entries include an "error" field instead of "sha". Use this when pinning many actions at once.',
    {
      actions: z
        .preprocess(
          (val) => {
            if (Array.isArray(val)) return val;
            if (typeof val === 'string') {
              try {
                const parsed = JSON.parse(val);
                if (Array.isArray(parsed)) return parsed;
              } catch {
                // Not valid JSON
              }
            }
            return val;
          },
          z
            .array(
              z.object({
                owner: z
                  .string()
                  .trim()
                  .min(1)
                  .describe('GitHub org or user (e.g. "actions").'),
                repo: z
                  .string()
                  .trim()
                  .min(1)
                  .describe('Repository name (e.g. "checkout").'),
                tag: z
                  .string()
                  .trim()
                  .min(1)
                  .describe('Mutable tag to resolve (e.g. "v4").'),
              }),
            )
            .min(1),
        )
        .describe(
          'Array of actions to resolve. Each entry must have owner, repo, and tag.',
        ),
    },
    async (params) => resolveActionShas(params),
  );

  server.tool(
    'get_job_logs',
    'Fetch GitHub Actions job logs with server-side truncation. Returns the last tail_lines lines (default 200) and caps output at max_chars (default 10 000) with a truncation indicator. Use error_summary to extract only error/failure lines for faster CI triage. Provide job_id for a single job or run_id (with optional failed_only) to fetch logs for all jobs in a run.',
    {
      job_id: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe('Specific job ID. Required when run_id is not provided.'),
      run_id: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          'Workflow run ID. Fetches logs for all jobs in the run (filtered by failed_only). Required when job_id is not provided.',
        ),
      failed_only: z
        .boolean()
        .default(true)
        .describe(
          'When using run_id, only fetch logs for failed jobs (default: true).',
        ),
      tail_lines: z.coerce
        .number()
        .int()
        .positive()
        .default(200)
        .describe(
          'Maximum number of lines to return from the end of the log (default: 200). The tool always truncates server-side before returning, so the response is bounded regardless of log size.',
        ),
      max_chars: z.coerce
        .number()
        .int()
        .positive()
        .default(10_000)
        .describe(
          'Hard cap on total output characters (default: 10 000). Truncated output is suffixed with "... [truncated, N total bytes]".',
        ),
      error_summary: z
        .boolean()
        .default(false)
        .describe(
          'When true, extract only lines matching error/failure patterns (error, FAIL, failed, exit code, etc.) plus 2 lines of context. Dramatically reduces token usage for CI-diagnosis tasks.',
        ),
    },
    async (params) =>
      getJobLogs({
        jobId: params.job_id,
        runId: params.run_id,
        failedOnly: params.failed_only,
        tailLines: params.tail_lines,
        maxChars: params.max_chars,
        errorSummary: params.error_summary,
      }),
  );

  // --- github_open_pr ---
  server.tool(
    'github_open_pr',
    'Semantic one-shot for the Ship step: push branch → create PR as draft → mark ready for review → apply bot:ready-for-review label. ' +
      'Replaces the six-step worktree_push → github_create_pr → github_mark_pr_ready → github_manage_labels(add: bot:ready-for-review) sequence. ' +
      'The jira-link marker is auto-inserted when jiraKey is provided. ' +
      'Pass draft: true to leave the PR in draft state (skips mark-ready and label). ' +
      'Pass push: false if the branch is already pushed.',
    {
      title: z.string().trim().min(1).describe('PR title'),
      body: z.string().describe('PR body (markdown)'),
      base: z
        .string()
        .trim()
        .optional()
        .describe('Base branch (default: main)'),
      draft: z
        .boolean()
        .optional()
        .describe(
          'Leave PR in draft (default: false — creates a ready-for-review PR)',
        ),
      head: z
        .string()
        .trim()
        .optional()
        .describe(
          'Remote branch name. Required in Lambda mode; auto-detected from worktreePath otherwise.',
        ),
      worktreePath: z
        .string()
        .trim()
        .optional()
        .describe(
          'Absolute path to the local worktree for branch auto-detection and push',
        ),
      jiraKey: z
        .string()
        .trim()
        .optional()
        .describe(
          'Jira ticket key (e.g. LS-1234). Auto-inserted as the jira-link marker in the PR body.',
        ),
      push: z
        .boolean()
        .optional()
        .describe(
          'Push branch before creating PR (default: true). Pass false if already pushed.',
        ),
    },
    async (params) => openPR(params),
  );

  // --- github_pr_diagnose ---
  server.tool(
    'github_pr_diagnose',
    'Semantic one-shot for CI failure investigation: returns a compact markdown report with PR state, CI summary, failing job list with extracted error context, and a recommended next action. ' +
      'Replaces the 4-5 call chain: github_view_pr → github_get_check_runs → github_pr_why_blocked → ci_find_session → ci_get_logs. ' +
      'For full CI log lines, fetch logs separately via ci_get_logs after using this tool to identify which jobs are failing.',
    {
      prNumber: z.number().int().positive().describe('PR number to diagnose'),
    },
    async (params) => diagnose(params),
  );

  return server;
}

if (!process.env['AWS_LAMBDA_FUNCTION_NAME']) {
  void (async () => {
    const transport = new StdioServerTransport();
    await createServer().connect(transport);
  })();
}
