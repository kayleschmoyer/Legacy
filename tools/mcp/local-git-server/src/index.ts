import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createPR } from '../../github-server/src/tools/create-pr.js';
import { rebasePR } from '../../github-server/src/tools/rebase-pr.js';
import {
  jobList,
  jobStatus,
  jobWait,
} from '../../github-server/src/tools/job-tools.js';
import { MAX_WAIT_MS } from '../../github-server/src/jobs.js';

// Node.js native fetch (undici) does not respect HTTPS_PROXY /
// GLOBAL_AGENT_HTTPS_PROXY by default. In cloud sessions the egress proxy is
// required; set the global dispatcher so all fetch() calls in this process go
// through the proxy when configured.
const proxyUrl =
  process.env['HTTPS_PROXY'] || process.env['GLOBAL_AGENT_HTTPS_PROXY'];
if (proxyUrl) {
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
}

/**
 * Shared Zod schema for boolean parameters. Accepts a real boolean OR a
 * string "true"/"false"/"1"/"0" (MCP callers sometimes serialise booleans to
 * strings).
 */
const coercedBoolean = z.preprocess((val) => {
  if (typeof val === 'string') {
    if (val === 'true' || val === '1') return true;
    if (val === 'false' || val === '0') return false;
  }
  return val;
}, z.boolean());

const server = new McpServer({
  name: 'legacy-sports-local-git',
  version: '1.0.0',
});

// --- github_create_pr ---
server.tool(
  'github_create_pr',
  'Prefer this over `gh pr create` via shell. Create a pull request. Title should include Jira key. Automatically prepends the structured jira-link marker (the source of truth for ticket linkage) to the body: primary key from jiraPrimary, else the first LS-#### in the title, else "none".',
  {
    title: z.string().describe('PR title with Jira key'),
    body: z.string().describe('PR body (markdown)'),
    jiraPrimary: z
      .string()
      .regex(
        /^(LS-\d+|none)$/,
        'Must be a single LS-#### key or the literal "none"',
      )
      .optional()
      .describe(
        'Primary Jira key for the jira-link marker (exactly one, the ticket this PR works on), or "none" for bot/dependabot PRs. Defaults to the first LS-#### key found in the title, falling back to "none".',
      ),
    jiraRelated: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe(
        'Optional related Jira keys (array or comma/space-separated string). Informational only — never auto-transitioned by jira-branch-sync.',
      ),
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

// --- github_rebase_pr ---
server.tool(
  'github_rebase_pr',
  'Rebase a PR branch onto base and force-push. Returns conflict details on failure. Budgeted to ~45s of synchronous work: a slow rebase returns { jobId, status: "running" } — poll with github_job_wait until it returns the final result. Do NOT re-run the command while the job is in progress.',
  {
    number: z.coerce.number().int().positive().describe('PR number'),
  },
  async (params) => rebasePR(params),
);

// Job polling tools for the budgeted git-heavy tools above. JobIds are
// per-process: a jobId returned by this server must be polled on this server.

// --- github_job_status ---
server.tool(
  'github_job_status',
  'Non-blocking snapshot of a background job started by github_rebase_pr on this server. Returns the originating tool\'s final result once done, or { status: "running", logTail } while in progress.',
  {
    jobId: z
      .string()
      .describe('Job id from a { status: "running" } tool result'),
  },
  async (params) => jobStatus(params),
);

// --- github_job_wait ---
server.tool(
  'github_job_wait',
  `Wait (bounded, ≤${MAX_WAIT_MS / 1000}s per call) for a background job started by github_rebase_pr on this server. Returns the originating tool's final result once done; returns { status: "running" } with a log tail if the budget expires first — re-call until terminal. Never re-run the originating command while its job is running.`,
  {
    jobId: z
      .string()
      .describe('Job id from a { status: "running" } tool result'),
    maxWaitMs: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(`Max wait in ms (default and cap: ${MAX_WAIT_MS})`),
  },
  async (params) => jobWait(params),
);

// --- github_job_list ---
server.tool(
  'github_job_list',
  'List recent background jobs on this server (newest first). In-memory only — jobs do not survive an MCP server restart.',
  {},
  async () => jobList(),
);

const transport = new StdioServerTransport();
await server.connect(transport);
