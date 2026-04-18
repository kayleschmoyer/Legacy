import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { auditSessionBash } from './tools/audit-session-bash.js';
import { autoFix } from './tools/auto-fix.js';
import { dispatchWorkflow } from './tools/dispatch-workflow.js';
import { findSession } from './tools/find-session.js';
import { getLogs } from './tools/get-logs.js';
import { getPlaywrightReport } from './tools/get-playwright-report.js';
import { listRuns } from './tools/list-runs.js';
import { rerun } from './tools/rerun.js';
import { searchLogs } from './tools/search-logs.js';
import { sessionStats } from './tools/session-stats.js';
import { viewRun } from './tools/view-run.js';
import { workflowInfo } from './tools/workflow-info.js';
import { workflowSetState } from './tools/workflow-state.js';
import { getToken, buildHeaders, sanitizeErrorBody } from './github-api.js';

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
  'Prefer this over `gh run view --log-failed` via shell. Fetch CI logs for a run or job. Defaults to failed-step logs only. Use jobName to filter logs to a specific job by name (case-insensitive substring match) without needing its numeric ID.',
  {
    runId: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe('Run ID (required when jobId is not provided)'),
    jobId: z.coerce.number().int().positive().optional().describe('Job ID'),
    jobName: z
      .string()
      .optional()
      .describe(
        'Filter logs to jobs whose name contains this string (case-insensitive substring match). Useful when you know the job name from ci_view_run but not its numeric ID.',
      ),
    failedOnly: coercedBoolean
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
    errorSummary: coercedBoolean
      .default(false)
      .describe(
        'Extract only error/failure lines with context (~200 lines max).',
      ),
  },
  async (params) => getLogs(params),
);

server.tool(
  'ci_list_runs',
  'Prefer this over `gh run list` via shell. List recent CI runs with optional filters.',
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
  'Prefer this over `gh run rerun` via shell. Rerun failed jobs, a specific job, or an entire CI run.',
  {
    runId: z.coerce.number().int().positive().describe('Run ID'),
    failedOnly: coercedBoolean
      .default(true)
      .describe('Rerun only failed jobs unless jobId set (default: true)'),
    jobId: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe('Specific job ID to rerun'),
    debug: coercedBoolean.default(false).describe('Enable debug logging'),
  },
  async (params) => rerun(params),
);

server.tool(
  'ci_search_logs',
  'Prefer this over `gh run view --log | grep` via shell. Search CI logs by pattern with optional regex and context lines.',
  {
    runId: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe('Run ID (required when jobId is not provided)'),
    pattern: z.string().min(1).describe('Search string or regex pattern'),
    jobId: z.coerce.number().int().positive().optional().describe('Job ID'),
    failedOnly: coercedBoolean
      .default(true)
      .describe('Failed steps only (default: true)'),
    attempt: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe('Attempt number'),
    isRegex: coercedBoolean.default(false).describe('Treat pattern as regex'),
    caseSensitive: coercedBoolean
      .default(false)
      .describe('Case-sensitive match'),
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
  'Prefer this over `gh run view` via shell. View a CI run summary with jobs and conclusions.',
  {
    runId: z.coerce.number().int().positive().describe('Run ID'),
    attempt: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe('Attempt number'),
    includeJobs: coercedBoolean
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
    includePermissions: coercedBoolean
      .default(false)
      .describe('Include GitHub App installation permissions (default: false)'),
  },
  async (params) => workflowInfo(params),
);

server.tool(
  'ci_workflow_set_state',
  'Enable or disable a GitHub Actions workflow. Wraps `gh workflow enable/disable <workflow>` via the REST API. Returns the workflow state after the change. Use "enable" to restore a disabled workflow, "disable" to halt automatic runs (e.g. during incident recovery). To read state without modifying it, use ci_workflow_info with a specific workflow.',
  {
    workflow: z
      .union([z.string(), z.number().int()])
      .transform(String)
      .describe('Workflow filename (e.g. "deploy.yml") or numeric ID'),
    action: z
      .enum(['enable', 'disable'])
      .describe(
        '"enable" restores a disabled workflow; "disable" halts automatic runs',
      ),
  },
  async (params) => workflowSetState(params),
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
      .preprocess(
        (val) => {
          if (typeof val === 'string' && val.trim().startsWith('{')) {
            try {
              return JSON.parse(val) as unknown;
            } catch {
              return val;
            }
          }
          return val;
        },
        z.record(z.string(), z.string()),
      )
      .optional()
      .describe(
        'Key-value map of workflow input parameters (all values must be strings). ' +
          'Accepts either a plain object or a JSON string.',
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
    'Auto-detects the current session and project when no parameters are provided, including worktree sessions started ' +
    'with the Claude Code launcher worktree checkbox (e.g. ~/.claude/projects/D--code-legacy-sports--claude-worktrees-<name>/). ' +
    'Default output: structured JSON report with full command details. ' +
    'Pass gapsOnly:true for a compact plain-text frequency-table summary that separates potential MCP gaps from already-covered commands. ' +
    'Pass auditMode:true for a structured JSON audit report with pre-classified gaps, confidence scores, draft ticket summaries, and noise filtering — minimizes LLM reasoning by pre-doing the classification. ' +
    'Pass scanScratch:true to also scan scratch/*.py files for subprocess shell patterns (subprocess.run, Popen, os.system, etc.).',
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
        'Project slug (e.g. "D--code-legacy-sports" for the main repo, ' +
          '"D--code-legacy-sports--claude-worktrees-<name>" for a launcher worktree session). ' +
          'Auto-detected from CWD if omitted — worktree sessions are detected automatically.',
      ),
    includeMcp: coercedBoolean
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
    gapsOnly: coercedBoolean
      .default(false)
      .describe(
        'Compact gap-focused output: one line per unique command pattern, <5 KB. ' +
          'Separates potential MCP gaps from already-covered commands. ' +
          'Use this instead of the default JSON output when running the MCP gap audit inline.',
      ),
    scanScratch: coercedBoolean
      .default(false)
      .describe(
        'Also scan scratch/*.py files for subprocess shell patterns ' +
          '(subprocess.run, Popen, call, check_output, check_call, os.system). ' +
          'Results appear under "scratch_subprocess_calls" in JSON output, or as a ' +
          '"=== scratch/*.py subprocess calls ===" section in text/gaps-only output. ' +
          'Default: false.',
      ),
    auditMode: coercedBoolean
      .default(false)
      .describe(
        'Structured audit mode: returns a JSON report with pre-classified gaps, ' +
          'confidence scores (high/medium/low), draft Jira ticket summaries, ' +
          'noise filtering, and overflow/failure triage. Designed to minimize LLM ' +
          'reasoning — review and approve rather than classify from scratch. ' +
          'Implies includeMcp:true. Use this instead of gapsOnly for the full audit workflow.',
      ),
  },
  async (params) => auditSessionBash(params),
);

server.tool(
  'ci_find_session',
  'Find Claude Code session JSONL files containing a substring (e.g. a Jira key, branch name, or commit SHA). ' +
    'Scans every JSONL under ~/.claude/projects/<slug>/ — including subagent transcripts — and returns matches sorted by ' +
    'last-modified descending. Use this to locate "where did I work on LS-#### earlier today?" without manually grepping ' +
    'session files. Empty matches array if nothing found.',
  {
    query: z
      .string()
      .min(1)
      .describe(
        'Substring to search for in session JSONLs (e.g. "LS-2366", "fix-nightly-playwright", a git SHA).',
      ),
    project: z
      .string()
      .optional()
      .describe(
        'Project slug (e.g. "D--code-legacy-sports"). Auto-detected from CWD if omitted.',
      ),
    includeSubagents: coercedBoolean
      .default(true)
      .describe(
        'Also scan subagent JSONLs under <sessionId>/subagents/ (default: true).',
      ),
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(500)
      .default(50)
      .describe(
        'Maximum number of matches to return (default: 50, max: 500). Older matches are dropped first.',
      ),
  },
  async (params) => findSession(params),
);

server.tool(
  'ci_session_stats',
  'Summarise tool-use counts and message metrics for a Claude Code session transcript. ' +
    'Returns total messages, first/last timestamp, per-tool call counts, and bashFallbackRatio ' +
    '(Bash count / total tool uses) — a quick "how MCP-first was this session?" heuristic. ' +
    'Optionally aggregates subagent transcripts into the totals and breaks them out per-subagent. ' +
    'Defaults to the most recently modified parent JSONL when sessionId is omitted.',
  {
    sessionId: z
      .string()
      .optional()
      .describe(
        'Parent session UUID. Defaults to the most recently modified parent JSONL.',
      ),
    project: z
      .string()
      .optional()
      .describe(
        'Project slug (e.g. "D--code-legacy-sports"). Auto-detected from CWD if omitted.',
      ),
    lineRange: z
      .tuple([z.coerce.number().int().min(1), z.coerce.number().int().min(1)])
      .refine(([start, end]) => end >= start, {
        message: 'lineRange must satisfy end >= start',
      })
      .optional()
      .describe(
        'Only count messages in this 1-based [start, end] line range — useful for analysing a specific phase of a long session.',
      ),
    includeSubagents: coercedBoolean
      .default(false)
      .describe(
        'Aggregate subagent stats into the parent totals and return per-subagent breakdowns (default: false).',
      ),
  },
  async (params) => sessionStats(params),
);

server.tool(
  'ci_auth_status',
  'Check if the CI server is authenticated with GitHub. Returns token source (GH_TOKEN, GITHUB_TOKEN, github-app, or gh-cli), authenticated user login, and rate limit info. Call this first to verify credentials are working before using other ci_* tools. Also see github_auth_status for basic GitHub auth status without rate limit info.',
  {},
  async () => {
    const GITHUB_API = 'https://api.github.com';

    // Detect which source the *resolved* token actually came from.
    // Comparing the token value to env vars is more reliable than checking
    // which env vars are set — getToken() can fall back (e.g. if App key is
    // set but JWT signing fails it falls back to gh-cli).
    const detectSource = (
      resolvedToken: string,
    ): 'GH_TOKEN' | 'GITHUB_TOKEN' | 'github-app' | 'gh-cli' => {
      const ghToken = process.env['GH_TOKEN']?.trim();
      if (ghToken && resolvedToken === ghToken) return 'GH_TOKEN';
      const githubToken = process.env['GITHUB_TOKEN']?.trim();
      if (githubToken && resolvedToken === githubToken) return 'GITHUB_TOKEN';
      // GitHub App installation tokens start with ghs_
      if (resolvedToken.startsWith('ghs_')) return 'github-app';
      return 'gh-cli';
    };

    let token: string;
    let source: 'GH_TOKEN' | 'GITHUB_TOKEN' | 'github-app' | 'gh-cli' =
      'gh-cli';
    try {
      token = await getToken();
      source = detectSource(token);
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                configured: false,
                source,
                error: err instanceof Error ? err.message : String(err),
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    try {
      // Use allSettled so a rate_limit timeout/failure doesn't mask auth status.
      const [userSettled, rlSettled] = await Promise.allSettled([
        fetch(`${GITHUB_API}/user`, {
          headers: buildHeaders(token),
          signal: AbortSignal.timeout(10_000),
        }),
        fetch(`${GITHUB_API}/rate_limit`, {
          headers: buildHeaders(token),
          signal: AbortSignal.timeout(10_000),
        }),
      ]);

      if (userSettled.status === 'rejected') {
        throw userSettled.reason;
      }
      const userRes = userSettled.value;
      const rlRes =
        rlSettled.status === 'fulfilled' ? rlSettled.value : undefined;
      const rateLimitError =
        rlSettled.status === 'rejected'
          ? rlSettled.reason instanceof Error
            ? rlSettled.reason.message
            : String(rlSettled.reason)
          : undefined;

      if (!userRes.ok) {
        // GitHub App installation tokens are app-scoped and return 403 for /user
        // — this is expected and does NOT mean the token is invalid.
        if (userRes.status === 403 && source === 'github-app') {
          const rlData = rlRes?.ok
            ? ((await rlRes.json()) as {
                rate?: { limit: number; remaining: number; reset: number };
              })
            : undefined;
          const rateLimit = rlData?.rate;
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    configured: true,
                    source,
                    login: null,
                    note: 'GitHub App installation token — no user identity available',
                    rateLimit: rateLimit
                      ? {
                          limit: rateLimit.limit,
                          remaining: rateLimit.remaining,
                          resetsAt: new Date(
                            rateLimit.reset * 1000,
                          ).toISOString(),
                        }
                      : undefined,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }
        const body = await userRes.text();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  configured: false,
                  source,
                  error: `GitHub API ${userRes.status}: ${sanitizeErrorBody(body)}`,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      const user = (await userRes.json()) as {
        login?: string;
        id?: number;
      };
      const rlData = rlRes?.ok
        ? ((await rlRes.json()) as {
            rate?: { limit: number; remaining: number; reset: number };
          })
        : undefined;
      const rateLimit = rlData?.rate;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                configured: true,
                source,
                login: user.login,
                userId: user.id,
                rateLimit: rateLimit
                  ? {
                      limit: rateLimit.limit,
                      remaining: rateLimit.remaining,
                      resetsAt: new Date(rateLimit.reset * 1000).toISOString(),
                    }
                  : undefined,
                ...(rateLimitError ? { rateLimitError } : {}),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                configured: false,
                source,
                error: err instanceof Error ? err.message : String(err),
              },
              null,
              2,
            ),
          },
        ],
      };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
