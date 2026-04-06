import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { auditSessionBash } from './tools/audit-session-bash.js';
import { autoFix } from './tools/auto-fix.js';
import { dispatchWorkflow } from './tools/dispatch-workflow.js';
import { getLogs } from './tools/get-logs.js';
import { getPlaywrightReport } from './tools/get-playwright-report.js';
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
    runId: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe('Run ID (required when jobId is not provided)'),
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
      .max(5000)
      .optional()
      .describe(
        'Maximum lines of log output to return (max: 5000). Defaults to 500 when errorSummary is false. When errorSummary is true, fetches up to 10000 lines for broader error extraction.',
      ),
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
    runId: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe('Run ID (required when jobId is not provided)'),
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

server.tool(
  'ci_dispatch_workflow',
  'Trigger a GitHub Actions workflow_dispatch event. Accepts workflow file name (e.g. "deploy.yml") or numeric ID, plus optional ref and input parameters.',
  {
    workflow: z
      .union([z.string(), z.number().int()])
      .transform(String)
      .describe('Workflow filename (e.g. "deploy.yml") or numeric ID'),
    ref: z
      .string()
      .default('main')
      .describe('Git ref (branch/tag) to run against (default: "main")'),
    inputs: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        'Key-value map of workflow input parameters (all values must be strings)',
      ),
  },
  async (params) => dispatchWorkflow(params),
);

server.tool(
  'ci_get_playwright_report',
  'Read a Playwright E2E test report deployed to legacy-sports-deploys. ' +
    'Returns overall stats (total/passed/failed/skipped/flaky), per-file breakdowns, ' +
    'and lists of failed/flaky test titles. ' +
    'Report names follow the pattern "pr-{number}" (for PRs) or "{run_id}" (for push/nightly runs). ' +
    'Example: ci_get_playwright_report({ reportName: "pr-2173" })',
  {
    reportName: z
      .string()
      .describe(
        'Report name as deployed (e.g. "pr-2173" for PR #2173, or the GitHub run ID for push/nightly)',
      ),
  },
  async (params) => getPlaywrightReport(params),
);

server.tool(
  'ci_audit_session_bash',
  'Extract Bash tool_use calls (and optionally MCP overflows/failures) from the current Claude Code session transcript. ' +
    'Reads JSONL session files from ~/.claude/projects/ and returns a structured JSON report with every Bash command executed ' +
    'during the session — including subagent transcripts. Designed for the MCP gap audit (Phase 1) to produce a complete ' +
    'Bash command inventory that survives context-window compaction. ' +
    'Auto-detects the current session and project when no parameters are provided. ' +
    'Default output: structured JSON report with full command details. ' +
    'Pass gapsOnly:true for a compact plain-text frequency-table summary that separates potential MCP gaps from already-covered commands.',
  {
    sessionId: z
      .string()
      .optional()
      .describe(
        'Session UUID. Defaults to the most recently modified JSONL in the project directory.',
      ),
    project: z
      .string()
      .optional()
      .describe(
        'Project slug (e.g. "D--code-legacy-sports"). Auto-detected from CWD if omitted.',
      ),
    includeMcp: z
      .boolean()
      .default(false)
      .describe(
        'Include MCP tool overflows and failures in the report (default: false).',
      ),
    pid: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe('Process ID to look up session ID from ~/.claude/sessions/.'),
    gapsOnly: z
      .boolean()
      .default(false)
      .describe(
        'Compact gap-focused output: one line per unique command pattern, <5 KB. ' +
          'Separates potential MCP gaps from already-covered commands. ' +
          'Use this instead of the default JSON output when running the MCP gap audit inline.',
      ),
  },
  async (params) => auditSessionBash(params),
);

const transport = new StdioServerTransport();
await server.connect(transport);
