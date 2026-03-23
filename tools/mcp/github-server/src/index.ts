import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getToken, tryResolveToken } from './auth.js';
import type { TokenSource } from './auth.js';
import type { ToolResult } from './types.js';
import { closePR } from './tools/close-pr.js';
import { createPR } from './tools/create-pr.js';
import { getRepoInfo } from './tools/get-repo-info.js';
import { getReviewThreads } from './tools/get-review-threads.js';
import { listPRs } from './tools/list-prs.js';
import { manageLabels } from './tools/manage-labels.js';
import { manageLabelsBatch } from './tools/manage-labels-batch.js';
import { mergePR } from './tools/merge-pr.js';
import { prBatchStatus } from './tools/pr-batch-status.js';
import { prDashboard } from './tools/pr-dashboard.js';
import { prScan } from './tools/pr-scan.js';
import { rebasePR } from './tools/rebase-pr.js';
import { replyToThread } from './tools/reply-to-thread.js';
import { secretList } from './tools/secret-list.js';
import { secretSet } from './tools/secret-set.js';
import { requestReview } from './tools/request-review.js';
import { resolveThread } from './tools/resolve-thread.js';
import { resolveThreads } from './tools/resolve-threads.js';
import { viewPR } from './tools/view-pr.js';

/**
 * Shared Zod schema for label arrays. Accepts a single string or an array of
 * strings (MCP callers sometimes send a bare string instead of a one-element
 * array). Each label must be non-empty after trimming.
 */
const labelList = z.preprocess(
  (val) => (typeof val === 'string' ? [val] : val),
  z.array(z.string().trim().min(1, 'Label name must be non-empty')),
);

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
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
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
  'Check GitHub API authentication status (passive check only — does not trigger interactive auth). Call this first in any GitHub workflow to verify API access is available.',
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
      const fallback =
        auth.source === 'env'
          ? 'A GitHub token was found in the environment, but it appears to be invalid or expired. Double-check GH_TOKEN or GITHUB_TOKEN, or run `gh auth login` to refresh your credentials.'
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

// --- github_create_pr ---
server.tool(
  'github_create_pr',
  'Create a pull request. Title should include Jira key.',
  {
    title: z.string().describe('PR title with Jira key'),
    body: z.string().describe('PR body (markdown)'),
    base: z.string().default('main').describe('Base branch (default: main)'),
    draft: z.boolean().default(false).describe('Create as draft'),
    worktreePath: z
      .string()
      .refine((p) => !p || /^([A-Za-z]:\\|\/)/.test(p), {
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
  'Fetch review threads on a PR via GraphQL.',
  {
    number: z.coerce.number().int().positive().describe('PR number'),
    unresolvedOnly: z
      .boolean()
      .default(false)
      .describe('Only unresolved threads'),
  },
  async (params) => getReviewThreads(params),
);

// --- github_list_prs ---
server.tool(
  'github_list_prs',
  'List PRs with optional filters.',
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
      .max(100)
      .default(20)
      .describe('Max results (default: 20)'),
  },
  async (params) => listPRs(params),
);

// --- github_reply_to_thread ---
server.tool(
  'github_reply_to_thread',
  'Post a reply comment on a PR review thread via GraphQL mutation. Use after reviewing feedback to respond before resolving. Get thread IDs from github_get_review_threads.',
  {
    threadId: z
      .string()
      .describe(
        'GraphQL node ID of the review thread to reply to (from github_get_review_threads)',
      ),
    body: z
      .string()
      .trim()
      .min(1, 'Reply body cannot be empty')
      .describe('Markdown body of the reply comment'),
  },
  async (params) => replyToThread(params),
);

// --- github_manage_labels ---
server.tool(
  'github_manage_labels',
  'Add or remove labels on a PR.',
  {
    number: z.coerce.number().int().positive().describe('PR number'),
    add: labelList.optional().describe('Labels to add'),
    remove: labelList.optional().describe('Labels to remove'),
  },
  async (params) => manageLabels(params),
);

// --- github_manage_labels_batch ---
server.tool(
  'github_manage_labels_batch',
  'Add or remove labels on multiple PRs in one call.',
  {
    prs: z
      .array(z.coerce.number().int().positive())
      .min(1)
      .max(100)
      .describe('PR numbers'),
    add: labelList.optional().describe('Labels to add'),
    remove: labelList.optional().describe('Labels to remove'),
  },
  async (params) => manageLabelsBatch(params),
);

// --- github_merge_pr ---
server.tool(
  'github_merge_pr',
  'Merge a PR. Default: merge queue (--auto --squash). "direct" uses --admin (requires authorization).',
  {
    number: z.coerce.number().int().positive().describe('PR number'),
    strategy: z
      .enum(['queue', 'direct'])
      .default('queue')
      .describe(
        '"queue" (default) or "direct" (--admin, requires authorization)',
      ),
  },
  async (params) => mergePR(params),
);

// --- github_pr_batch_status ---
server.tool(
  'github_pr_batch_status',
  'Detailed status for specific PRs: mergeable, CI jobs, reviews, unresolved threads. Batched GraphQL.',
  {
    prNumbers: z
      .array(z.coerce.number().int().positive())
      .min(1)
      .max(50)
      .describe('PR numbers'),
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
      .max(200)
      .default(200)
      .describe('Max PRs to scan (default: 200)'),
    applyLabels: z
      .boolean()
      .default(true)
      .describe('Sync CI failure labels (default: true)'),
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
  'Request reviewers on a PR. Requests Copilot by default.',
  {
    number: z.coerce.number().int().positive().describe('PR number'),
    reviewers: z
      .array(z.string())
      .optional()
      .describe('Human reviewer usernames'),
    copilot: z
      .boolean()
      .default(true)
      .describe('Request Copilot review (default: true)'),
  },
  async (params) => requestReview(params),
);

// --- github_resolve_thread ---
server.tool(
  'github_resolve_thread',
  'Resolve a single review thread via GraphQL.',
  {
    threadId: z
      .string()
      .describe('Thread node ID from github_get_review_threads'),
  },
  async (params) => resolveThread(params),
);

// --- github_resolve_threads ---
server.tool(
  'github_resolve_threads',
  'Batch-resolve review threads (groups of 50).',
  {
    threadIds: z
      .array(z.string())
      .min(1)
      .max(100)
      .describe('Thread node IDs from github_get_review_threads'),
  },
  async (params) => resolveThreads(params),
);

// --- github_view_pr ---
server.tool(
  'github_view_pr',
  'View PR details: title, body, state, checks, reviews, diff stats.',
  {
    number: z.coerce.number().int().positive().describe('PR number'),
  },
  async (params) => viewPR(params),
);

// --- github_secret_list ---
server.tool(
  'github_secret_list',
  'List GitHub Actions secret names (not values) for the repository.',
  {},
  async () => secretList(),
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

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
