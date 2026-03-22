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
  'Classify a CI failure into a category (formatting, stale_branch, codegen, type_error, test_failure, lint, flaky, infrastructure, unknown) with confidence, evidence, and fix recommendation.',
  {
    runId: z.coerce.number().int().positive().describe('Run ID to analyze'),
    jobId: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe('Job ID to analyze'),
    attempt: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe('Attempt number'),
  },
  async (params) => autoFix(params),
);

server.tool(
  'ci_get_logs',
  'Fetch CI logs for a run or job. Defaults to failed-step logs only.',
  {
    runId: z.coerce.number().int().positive().describe('Run ID'),
    jobId: z.coerce.number().int().positive().optional().describe('Job ID'),
    failedOnly: z
      .boolean()
      .default(true)
      .describe('Failed steps only (default: true)'),
    attempt: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe('Attempt number'),
    maxLines: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe('Return only last N lines'),
    errorSummary: z
      .boolean()
      .default(false)
      .describe(
        'Extract only error/failure lines with context (~200 lines max).',
      ),
  },
  async (params) => getLogs(params),
);

server.tool(
  'ci_list_runs',
  'List recent CI runs with optional filters.',
  {
    branch: z.string().optional().describe('Branch name filter'),
    workflow: z.string().optional().describe('Workflow file or name'),
    status: z.string().optional().describe('Run status or conclusion'),
    event: z.string().optional().describe('Trigger event name'),
    commit: z.string().optional().describe('Commit SHA filter'),
    user: z.string().optional().describe('GitHub username filter'),
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(25)
      .default(10)
      .describe('Max results (default: 10, max: 25)'),
  },
  async (params) => listRuns(params),
);

server.tool(
  'ci_rerun',
  'Rerun failed jobs, a specific job, or an entire CI run.',
  {
    runId: z.coerce.number().int().positive().describe('Run ID'),
    failedOnly: z
      .boolean()
      .default(true)
      .describe('Rerun only failed jobs unless jobId set (default: true)'),
    jobId: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe('Specific job ID to rerun'),
    debug: z.boolean().default(false).describe('Enable debug logging'),
  },
  async (params) => rerun(params),
);

server.tool(
  'ci_search_logs',
  'Search CI logs by pattern with optional regex and context lines.',
  {
    runId: z.coerce.number().int().positive().describe('Run ID'),
    pattern: z.string().describe('Search string or regex pattern'),
    jobId: z.coerce.number().int().positive().optional().describe('Job ID'),
    failedOnly: z
      .boolean()
      .default(true)
      .describe('Failed steps only (default: true)'),
    attempt: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe('Attempt number'),
    isRegex: z.boolean().default(false).describe('Treat pattern as regex'),
    caseSensitive: z.boolean().default(false).describe('Case-sensitive match'),
    contextBefore: z.coerce
      .number()
      .int()
      .min(0)
      .max(20)
      .default(3)
      .describe('Lines before each match'),
    contextAfter: z.coerce
      .number()
      .int()
      .min(0)
      .max(20)
      .default(3)
      .describe('Lines after each match'),
    limitMatches: z.coerce
      .number()
      .int()
      .positive()
      .max(30)
      .default(10)
      .describe('Max matches to return'),
  },
  async (params) => searchLogs(params),
);

server.tool(
  'ci_view_run',
  'View a CI run summary with jobs and conclusions.',
  {
    runId: z.coerce.number().int().positive().describe('Run ID'),
    attempt: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe('Attempt number'),
    includeJobs: z
      .boolean()
      .default(true)
      .describe('Include jobs (default: true)'),
  },
  async (params) => viewRun(params),
);

server.tool(
  'ci_workflow_info',
  'List workflows or get details for a specific workflow. Optionally includes App installation permissions.',
  {
    workflow: z
      .union([z.string(), z.number().int()])
      .transform(String)
      .optional()
      .describe('Workflow filename or numeric ID; omit to list all'),
    includePermissions: z
      .boolean()
      .default(false)
      .describe('Include GitHub App installation permissions (default: false)'),
  },
  async (params) => workflowInfo(params),
);

const transport = new StdioServerTransport();
await server.connect(transport);
