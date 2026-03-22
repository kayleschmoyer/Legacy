import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { autoFix } from './tools/auto-fix.js';
import { getLogs } from './tools/get-logs.js';
import { listRuns } from './tools/list-runs.js';
import { rerun } from './tools/rerun.js';
import { searchLogs } from './tools/search-logs.js';
import { viewRun } from './tools/view-run.js';
import { workflowInfo } from './tools/workflow-info.js';

const server = new McpServer({
  name: 'legacy-sports-ci',
  version: '1.0.0',
});

server.tool(
  'ci_auto_fix',
  'Analyze CI failure logs and classify the failure type. Returns the failure category ' +
    '(formatting, stale_branch, codegen, type_error, test_failure, lint, flaky, infrastructure, unknown), ' +
    'confidence level, evidence lines, and a structured recommendation for how to fix it. ' +
    'Use this before manual debugging to attempt automated triage.',
  {
    runId: z.coerce
      .number()
      .int()
      .positive()
      .describe('GitHub Actions run database ID to analyze'),
    jobId: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe('Optional job database ID to analyze instead of the whole run'),
    attempt: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe('Specific attempt number for the run'),
  },
  async (params) => autoFix(params),
);

server.tool(
  'ci_get_logs',
  'Fetch GitHub Actions logs for a run or specific job. Defaults to failed-step logs for faster CI triage.',
  {
    runId: z.coerce
      .number()
      .int()
      .positive()
      .describe('GitHub Actions run database ID'),
    jobId: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe('Optional job database ID within the run'),
    failedOnly: z
      .boolean()
      .default(true)
      .describe('Return only failed-step logs when true (default: true)'),
    attempt: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe('Specific attempt number for the run'),
    maxLines: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe('If provided, returns only the last N lines of log output'),
    errorSummary: z
      .boolean()
      .default(false)
      .describe(
        'When true, returns only error/failure lines with surrounding context instead of full logs. ' +
          'Extracts TS errors, FAIL lines, Nx "Failed tasks" sections, and other error indicators. ' +
          'Keeps output under ~200 lines for agent consumption.',
      ),
  },
  async (params) => getLogs(params),
);

server.tool(
  'ci_list_runs',
  'List recent GitHub Actions workflow runs with optional filters for branch, workflow, status, event, commit, and user.',
  {
    branch: z
      .string()
      .optional()
      .describe(
        'Branch name to filter by, e.g. LS-1255/ci-server-for-ci-failure-triage',
      ),
    workflow: z
      .string()
      .optional()
      .describe('Workflow file or name, e.g. ci-orchestrator.yml'),
    status: z
      .string()
      .optional()
      .describe(
        'Workflow run status or conclusion, e.g. failure, in_progress, success',
      ),
    event: z
      .string()
      .optional()
      .describe('GitHub event name, e.g. pull_request or push'),
    commit: z.string().optional().describe('Commit SHA to filter by'),
    user: z
      .string()
      .optional()
      .describe('GitHub username that triggered the run'),
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(25)
      .default(10)
      .describe('Maximum number of runs to return (default: 10, max: 25)'),
  },
  async (params) => listRuns(params),
);

server.tool(
  'ci_rerun',
  'Rerun failed jobs, a specific job, or an entire GitHub Actions workflow run.',
  {
    runId: z.coerce
      .number()
      .int()
      .positive()
      .describe('GitHub Actions run database ID'),
    failedOnly: z
      .boolean()
      .default(true)
      .describe(
        'When true, rerun only failed jobs unless jobId is provided (default: true)',
      ),
    jobId: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe('Optional job database ID to rerun instead of the whole run'),
    debug: z
      .boolean()
      .default(false)
      .describe('Enable debug logging for the rerun request'),
  },
  async (params) => rerun(params),
);

server.tool(
  'ci_search_logs',
  'Search GitHub Actions logs for error evidence with optional regex matching and surrounding context lines.',
  {
    runId: z.coerce
      .number()
      .int()
      .positive()
      .describe('GitHub Actions run database ID'),
    pattern: z
      .string()
      .describe('String or regex pattern to search for in the logs'),
    jobId: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe('Optional job database ID within the run'),
    failedOnly: z
      .boolean()
      .default(true)
      .describe('Search only failed-step logs when true (default: true)'),
    attempt: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe('Specific attempt number for the run'),
    isRegex: z
      .boolean()
      .default(false)
      .describe('Interpret pattern as a regular expression'),
    caseSensitive: z
      .boolean()
      .default(false)
      .describe('Use case-sensitive matching'),
    contextBefore: z.coerce
      .number()
      .int()
      .min(0)
      .max(20)
      .default(3)
      .describe('Number of lines of context before each match'),
    contextAfter: z.coerce
      .number()
      .int()
      .min(0)
      .max(20)
      .default(3)
      .describe('Number of lines of context after each match'),
    limitMatches: z.coerce
      .number()
      .int()
      .positive()
      .max(100)
      .default(20)
      .describe('Maximum matches to return'),
  },
  async (params) => searchLogs(params),
);

server.tool(
  'ci_view_run',
  'View a GitHub Actions workflow run summary, including jobs and conclusions for triage.',
  {
    runId: z.coerce
      .number()
      .int()
      .positive()
      .describe('GitHub Actions run database ID'),
    attempt: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe('Specific attempt number for the run'),
    includeJobs: z
      .boolean()
      .default(true)
      .describe('Include job details in the response (default: true)'),
  },
  async (params) => viewRun(params),
);

server.tool(
  'ci_workflow_info',
  'Query GitHub Actions workflow definitions. Lists all workflows or returns details for a specific workflow by filename or ID. Optionally includes GitHub App installation permissions.',
  {
    workflow: z
      .union([z.string(), z.number().int()])
      .transform(String)
      .optional()
      .describe(
        'Workflow filename (e.g. "copilot-auto-approve.yml") or numeric ID. If omitted, lists all workflows.',
      ),
    includePermissions: z
      .boolean()
      .default(false)
      .describe(
        'When true, also fetches GitHub App installation permissions for the repository (default: false)',
      ),
  },
  async (params) => workflowInfo(params),
);

const transport = new StdioServerTransport();
await server.connect(transport);
