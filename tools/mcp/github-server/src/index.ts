import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { listPRs } from './tools/list-prs.js';
import { viewPR } from './tools/view-pr.js';
import { createPR } from './tools/create-pr.js';
import { requestReview } from './tools/request-review.js';
import { getReviewThreads } from './tools/get-review-threads.js';
import { resolveThread } from './tools/resolve-thread.js';
import { manageLabels } from './tools/manage-labels.js';
import { getRepoInfo } from './tools/get-repo-info.js';

const server = new McpServer({
  name: 'legacy-sports-github',
  version: '1.0.0',
});

// --- github_list_prs ---
server.tool(
  'github_list_prs',
  'List pull requests with optional filters for state, branch, author, label, and search query.',
  {
    state: z
      .enum(['open', 'closed', 'merged', 'all'])
      .default('open')
      .describe('PR state filter (default: open)'),
    branch: z
      .string()
      .optional()
      .describe('Filter by head branch name, e.g. LS-1254/my-feature'),
    author: z.string().optional().describe('Filter by PR author username'),
    label: z
      .string()
      .optional()
      .describe('Filter by label, e.g. merge-when-ready'),
    search: z.string().optional().describe('GitHub search query to filter PRs'),
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(100)
      .default(20)
      .describe('Maximum number of PRs to return (default: 20)'),
  },
  async (params) => listPRs(params),
);

// --- github_view_pr ---
server.tool(
  'github_view_pr',
  'View detailed information about a specific pull request including title, body, state, checks, reviews, and diff stats.',
  {
    number: z.coerce.number().int().positive().describe('PR number to view'),
  },
  async (params) => viewPR(params),
);

// --- github_create_pr ---
server.tool(
  'github_create_pr',
  'Create a new pull request. Writes the body to a temp file to avoid PowerShell encoding issues. Title should include the Jira ticket key (e.g. "LS-1254 feat(scope): description").',
  {
    title: z
      .string()
      .describe(
        'PR title, should include Jira key, e.g. "LS-1254 feat(mcp): github server"',
      ),
    body: z.string().describe('PR body in markdown format'),
    base: z
      .string()
      .default('main')
      .describe('Base branch for the PR (default: main)'),
    draft: z
      .boolean()
      .default(false)
      .describe('Create as draft PR (default: false)'),
  },
  async (params) => createPR(params),
);

// --- github_request_review ---
server.tool(
  'github_request_review',
  'Request reviewers on a PR. Always requests Copilot bot review by default (uses the special copilot-pull-request-reviewer[bot] account). Optionally add human reviewers.',
  {
    number: z.coerce
      .number()
      .int()
      .positive()
      .describe('PR number to request review on'),
    reviewers: z
      .array(z.string())
      .optional()
      .describe('GitHub usernames of human reviewers to add'),
    copilot: z
      .boolean()
      .default(true)
      .describe(
        'Request Copilot bot review (default: true). Uses copilot-pull-request-reviewer[bot].',
      ),
  },
  async (params) => requestReview(params),
);

// --- github_get_review_threads ---
server.tool(
  'github_get_review_threads',
  'Fetch review threads on a PR via GraphQL. Returns thread ID, resolution status, outdated flag, and all comments with author, body, file path, and line number. Use for processing Copilot review feedback.',
  {
    number: z.coerce
      .number()
      .int()
      .positive()
      .describe('PR number to fetch review threads for'),
    unresolvedOnly: z
      .boolean()
      .default(false)
      .describe('Return only unresolved threads (default: false, returns all)'),
  },
  async (params) => getReviewThreads(params),
);

// --- github_resolve_thread ---
server.tool(
  'github_resolve_thread',
  'Resolve a review thread via GraphQL mutation. Use after addressing review feedback and pushing the fix. Get thread IDs from github_get_review_threads.',
  {
    threadId: z
      .string()
      .describe(
        'GraphQL node ID of the review thread to resolve (from github_get_review_threads)',
      ),
  },
  async (params) => resolveThread(params),
);

// --- github_manage_labels ---
server.tool(
  'github_manage_labels',
  'Add or remove labels on a pull request. Common labels: merge-when-ready, do-not-merge.',
  {
    number: z.coerce
      .number()
      .int()
      .positive()
      .describe('PR number to update labels on'),
    add: z.array(z.string()).optional().describe('Labels to add to the PR'),
    remove: z
      .array(z.string())
      .optional()
      .describe('Labels to remove from the PR'),
  },
  async (params) => manageLabels(params),
);

// --- github_get_repo_info ---
server.tool(
  'github_get_repo_info',
  'Get repository information (owner, name, default branch, URL). Useful for constructing GraphQL queries or API calls.',
  {},
  async () => getRepoInfo(),
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
