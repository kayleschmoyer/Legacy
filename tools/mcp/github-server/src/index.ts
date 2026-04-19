import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getToken, getRepoOwnerName, tryResolveToken } from './auth.js';
import type { TokenSource } from './auth.js';
import type { ToolResult } from './types.js';
import { closePR } from './tools/close-pr.js';
import { createLabel } from './tools/create-label.js';
import { createPR } from './tools/create-pr.js';
import { getRepoInfo } from './tools/get-repo-info.js';
import { getReviewThreads } from './tools/get-review-threads.js';
import { listPRs } from './tools/list-prs.js';
import { listReviews } from './tools/list-reviews.js';
import { clearCiFailureLabels } from './tools/clear-ci-failure-labels.js';
import { manageLabels } from './tools/manage-labels.js';
import { markPRReady } from './tools/mark-pr-ready.js';
import { mergePR } from './tools/merge-pr.js';
import { prDashboard } from './tools/pr-dashboard.js';
import { prScan } from './tools/pr-scan.js';
import { rebasePR } from './tools/rebase-pr.js';
import { replyToReview } from './tools/reply-to-review.js';
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
import { listPRComments } from './tools/list-pr-comments.js';
import { listPRInlineComments } from './tools/list-pr-inline-comments.js';
import { listReviewComments } from './tools/list-review-comments.js';

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
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                configured: false,
                source: null,
                user: null,
                fallback:
                  'No GitHub token found. Set GH_TOKEN or GITHUB_TOKEN env var, AGENT_AUTHOR_APP_PRIVATE_KEY for GitHub App auth, or run `gh auth login`.',
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

// --- github_create_pr ---
server.tool(
  'github_create_pr',
  'Prefer this over `gh pr create` via shell. Create a pull request. Title should include Jira key.',
  {
    title: z.string().describe('PR title with Jira key'),
    body: z.string().describe('PR body (markdown)'),
    base: z.string().default('main').describe('Base branch (default: main)'),
    draft: coercedBoolean.default(false).describe('Create as draft'),
    head: z
      .string()
      .optional()
      .describe(
        'Remote branch name to use as PR head. If omitted and worktreePath is provided, auto-detected from the local branch name in that worktree (git rev-parse --abbrev-ref HEAD). If omitted and no worktreePath, auto-detected from the upstream tracking ref (git @{upstream}), falling back to the local branch name. Use this when the local branch name differs from the pushed remote branch name.',
      ),
    worktreePath: z
      .string()
      .refine((p) => !p || /^([A-Za-z]:[/\\]|\/)/.test(p), {
        message: 'worktreePath must be an absolute path',
      })
      .optional()
      .describe('Worktree path to run gh from'),
  },
  async (params) => createPR(params),
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
    number: z.coerce.number().int().positive().optional().describe('PR number'),
    prNumber: z.coerce
      .number()
      .int()
      .positive()
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
  'List reviews on a PR. Useful for checking review status (e.g. whether Copilot has reviewed).',
  {
    number: z.coerce.number().int().positive().describe('PR number'),
    author: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        'Filter by reviewer login (e.g. "copilot-pull-request-reviewer[bot]")',
      ),
  },
  async (params) => listReviews(params),
);

// --- github_reply_to_review ---
server.tool(
  'github_reply_to_review',
  'Post a reply to a PR review thread. Provide EITHER threadId (GraphQL node ID) OR both commentId AND number (REST) — not both paths at once.',
  {
    body: z
      .string()
      .trim()
      .min(1, 'Reply body cannot be empty')
      .describe('Markdown body of the reply comment'),
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
        'Numeric REST comment ID (databaseId from github_get_review_threads). Requires "number" param. Use this OR threadId, never both.',
      ),
    number: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe('PR number. Required when using commentId.'),
  },
  async (params) => {
    const hasThreadId = !!params.threadId;
    const hasRestPath =
      params.commentId !== undefined && params.number !== undefined;
    if (
      hasThreadId &&
      (params.commentId !== undefined || params.number !== undefined)
    ) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'Provide EITHER threadId OR (commentId + number) — not both paths at once.',
          },
        ],
      };
    }
    if (!hasThreadId && !hasRestPath) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'Provide either threadId (GraphQL node ID) or both commentId and number (REST path).',
          },
        ],
      };
    }
    return replyToReview(params);
  },
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

// --- github_list_pr_comments ---
server.tool(
  'github_list_pr_comments',
  'Read general (top-level) comments on a PR or issue. Returns author, body, created_at, and updated_at for each comment. Use the optional since parameter (ISO 8601) to filter to comments posted after a given timestamp. Handles pagination automatically. Maps to GET /repos/{owner}/{repo}/issues/{number}/comments.',
  {
    number: z.coerce.number().int().positive().describe('PR or issue number'),
    since: z
      .string()
      .optional()
      .describe(
        'ISO 8601 timestamp — only return comments posted at or after this time',
      ),
  },
  async (params) => listPRComments(params),
);

// --- github_list_pr_inline_comments ---
server.tool(
  'github_list_pr_inline_comments',
  'Read inline code review comments on a PR (PRRC_* objects attached to specific diff lines). Returns id, inReplyToId, author, body, path, line, diffHunk for each comment. Use path to filter to a specific file. Use since (ISO 8601) to filter by timestamp. Handles pagination automatically. Maps to GET /repos/{owner}/{repo}/pulls/{number}/comments. For thread resolution status (resolved/unresolved), use github_get_review_threads instead.',
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

// --- github_list_review_comments ---
server.tool(
  'github_list_review_comments',
  'Read inline code review comments on a PR, with optional filtering by review ID or timestamp. Use reviewId to isolate comments from a specific Copilot or human review submission (avoids mixing new and historical comments). Use since (ISO 8601) to filter by creation time. Returns id, inReplyToId, user, path, line, body, createdAt, reviewId for each comment. Handles pagination automatically. Maps to GET /repos/{owner}/{repo}/pulls/{number}/comments.',
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

// --- github_clear_ci_failure_labels ---
server.tool(
  'github_clear_ci_failure_labels',
  'Remove all ci-failure-* labels from a PR. Use after successfully fixing and pushing a CI fix — the CI system will re-add labels if the fix did not hold. No-ops if no ci-failure-* labels are present.',
  {
    number: z.coerce.number().int().positive().describe('PR number'),
  },
  async (params) => clearCiFailureLabels(params),
);

// --- github_manage_labels ---
server.tool(
  'github_manage_labels',
  'Prefer this over `gh pr edit --add-label` via shell. Add or remove labels on one or more PRs. Pass a single PR number via "prNumber", or one or more PR numbers via "prs". When multiple PRs are given, all get the same label changes.',
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
    add: labelList.optional().describe('Labels to add'),
    remove: labelList.optional().describe('Labels to remove'),
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
    return manageLabels({ prs, add: params.add, remove: params.remove });
  },
);

// --- github_merge_pr ---
server.tool(
  'github_merge_pr',
  'Prefer this over `gh pr merge` via shell. Merge a PR. Default: merge queue (--auto --squash). "direct" uses --admin (requires authorization). Pass the PR number as "number" (preferred) or "prNumber" (alias).',
  {
    number: z.coerce.number().int().positive().optional().describe('PR number'),
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

// --- github_mark_pr_ready ---
server.tool(
  'github_mark_pr_ready',
  'Convert a draft PR to ready for review. Use after validation passes to signal the PR is ready for sweep/review agents.',
  {
    number: z.coerce.number().int().positive().describe('PR number'),
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

// --- github_pr_dashboard ---
server.tool(
  'github_pr_dashboard',
  'Triage dashboard: open PRs with mergeable status, CI state, unresolved threads, labels, and summary counts.',
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

// --- github_rebase_pr ---
server.tool(
  'github_rebase_pr',
  'Rebase a PR branch onto base and force-push. Returns conflict details on failure.',
  {
    number: z.coerce.number().int().positive().describe('PR number'),
  },
  async (params) => rebasePR(params),
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
  'Prefer this over `gh pr view` or `gh pr diff --name-only` via shell. View PR details: title, body, state, checks, reviews, diff stats, and changed files list (path, additions, deletions, status). Pass the PR number as "number" (preferred) or "prNumber" (alias).',
  {
    number: z.coerce.number().int().positive().optional().describe('PR number'),
    prNumber: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe('Alias for "number" — use either, not both'),
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
    return viewPR({ number: resolved });
  },
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
  'Re-request failed status checks on a PR. Eliminates need for empty commits to clear stale failures.',
  {
    number: z.coerce.number().int().positive().describe('PR number'),
    checkName: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Specific check name to re-request (retriggers all matching)'),
    allFailed: coercedBoolean
      .default(false)
      .describe(
        'When true, retrigger all failed checks. When false (default), retrigger only the named check or all failed checks if no checkName given.',
      ),
  },
  async (params) => retriggerCheck(params),
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
  'List GitHub commit statuses (Statuses API) for a PR\'s HEAD commit. These are DISTINCT from Check Runs (Checks API) — bot-review and similar statuses appear here, not in github_retrigger_check. Use this to diagnose "check not found" errors when github_retrigger_check fails.',
  {
    number: z.coerce.number().int().positive().describe('PR number'),
  },
  async (params) => listCommitStatuses(params),
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

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
