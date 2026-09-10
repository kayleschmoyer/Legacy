import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { minifiedJson } from '@legacy-sports/mcp-format';
import { z } from 'zod';
import { auditSessionBash } from './tools/audit-session-bash.js';
import { autoFix } from './tools/auto-fix.js';
import { ciCancelRun } from './tools/ci-cancel-run.js';
import { ciRerun } from './tools/ci-rerun.js';
import { ciViewRun } from './tools/ci-view-run.js';
import { dispatchWorkflow } from './tools/dispatch-workflow.js';
import { downloadArtifact } from './tools/download-artifact.js';
import { findSession } from './tools/find-session.js';
import { getLogs } from './tools/get-logs.js';
import { getPlaywrightReport } from './tools/get-playwright-report.js';
import { getPlaywrightTestResult } from './tools/get-playwright-test-result.js';
import { listRuns } from './tools/list-runs.js';
import { retryRunnerFlake } from './tools/retry-runner-flake.js';
import { searchLogs } from './tools/search-logs.js';
import { sessionStats } from './tools/session-stats.js';
import { unwedgeOrchestrator } from './tools/unwedge-orchestrator.js';
import { waitRun } from './tools/wait-run.js';
import { viewRunJobs } from './tools/view-run-jobs.js';
import { workflowInfo } from './tools/workflow-info.js';
import { workflowSetState } from './tools/workflow-state.js';
import {
  buildHeaders,
  formatGithubApiError,
  getDeploysTokenDiagnostics,
  getInstallationRateLimit,
  getToken,
} from './github-api.js';

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

export function createServer(): McpServer {
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
    'Prefer this over `gh run view --log-failed` via shell. Fetch CI logs for a run or job, failed steps ' +
      'only by default. Response is a minified-JSON metadata line followed by raw log text with real ' +
      'newlines, so grep and chunked Read work directly against it when the response is persisted to a file.',
    {
      runId: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe('Run ID (required when jobId and runIds are not provided)'),
      runIds: z
        .array(z.coerce.number().int().positive())
        .min(1)
        .max(10)
        .optional()
        .describe(
          'Batch mode: up to 10 runs in one call, each returned as a "=== run <id> ===" section. Runs whose ' +
            'log archive is gone (expired) are isolated to missing[] rather than failing the call. Not with jobId.',
        ),
      jobId: z.coerce.number().int().positive().optional().describe('Job ID'),
      jobName: z
        .string()
        .optional()
        .describe(
          'Job name — exact match preferred, else substring; errors listing candidates if ambiguous.',
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
          'Max lines returned (cap 5000). Default 500, or up to 10000 when errorSummary is set.',
        ),
      maxChars: z.coerce
        .number()
        .int()
        .positive()
        .max(200_000)
        .optional()
        .describe(
          'Hard cap on total characters (default 50000), applied regardless of maxLines.',
        ),
      truncateLineLength: z.coerce
        .number()
        .int()
        .positive()
        .max(10_000)
        .optional()
        .describe(
          'Truncate individual lines past this length; truncated lines are suffixed ...[line truncated].',
        ),
      errorSummary: coercedBoolean
        .default(false)
        .describe(
          'Extract only error/failure lines with context (~200 lines max).',
        ),
      offset: z.coerce
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe(
          'Skip this many lines from the start of the fetched window before applying maxChars, like Read offset. Pages a log across calls; response meta returns hint/linesRemainingInWindow with the next offset.',
        ),
      grep: z
        .string()
        .optional()
        .describe(
          'Regex filter over the full log, e.g. "foo|bar" (not just the maxLines tail). Overrides errorSummary. Case-insensitive unless caseSensitive. Capped at 300 matches.',
        ),
      caseSensitive: coercedBoolean
        .default(false)
        .describe('Case-sensitive grep (default false).'),
    },
    async (params) => getLogs(params),
  );

  server.tool(
    'ci_download_artifact',
    'Prefer this over `gh run download` via shell. Download a named GitHub Actions artifact ' +
      '(uploaded via actions/upload-artifact) from a workflow run. Without outDir, file contents ' +
      'are returned inline in the response (UTF-8 text where safe, base64 for binary, capped at ' +
      '~200KB total across all files — the only option in hosted sessions with no shared filesystem). ' +
      'With outDir, every file is extracted to that local directory instead and only their paths are returned.',
    {
      runId: z.coerce
        .number()
        .int()
        .positive()
        .describe('Workflow run ID that produced the artifact'),
      artifactName: z
        .string()
        .min(1)
        .describe(
          'Exact artifact name as uploaded via actions/upload-artifact (falls back to a case-insensitive match if no exact match is found)',
        ),
      outDir: z
        .string()
        .optional()
        .describe(
          'Local directory to extract the artifact into. Omit to get file contents back inline instead.',
        ),
    },
    async (params) => downloadArtifact(params),
  );

  server.tool(
    'ci_list_runs',
    'Prefer this over `gh run list` via shell. List recent CI runs with optional filters.',
    {
      branch: z.string().optional().describe('Branch name filter'),
      workflow: z
        .union([z.string(), z.number().transform(String)])
        .optional()
        .describe('Workflow filename, display name, or numeric ID'),
      status: z.string().optional().describe('Run status or conclusion'),
      event: z.string().optional().describe('Trigger event name'),
      commit: z.string().optional().describe('Commit SHA filter'),
      user: z.string().optional().describe('GitHub username filter'),
      limit: z.coerce
        .number()
        .int()
        .positive()
        .max(100)
        .default(10)
        .describe('Max results (default: 10, max: 100)'),
    },
    async (params) => listRuns(params),
  );

  server.tool(
    'ci_rerun',
    'Prefer this over `gh run rerun` via shell. Rerun failed jobs, a specific job, the whole run, or up to 50 runs in one batch call. ' +
      'scope: "failed" (default) reruns only failed jobs, auto-escalating to a full run rerun when a job was left `cancelled` by an ' +
      "upstream dependency failure — GitHub's rerun-failed-jobs endpoint never reschedules those (LS-9212); check the response " +
      '`scope`/`message` for `"run (escalated from failed-jobs)"`. scope: "job" reruns a single job via jobId or jobName ' +
      '(single-run only; see jobName param). scope: "all" reruns the entire run. Pass runIds (1-50) instead of runId to rerun ' +
      'several runs independently in one call — scope "job" and withDiagnostics are single-run only; batch results use the ' +
      'standard partial-failure shape { success, total, succeeded, failed }. withDiagnostics: true (single-run, scope "failed" ' +
      'only) is the triage-then-rerun one-shot: fetches a short failure-log snippet and richer per-job payload before rerunning, ' +
      'and errors clearly (never a silent no-op) when there are no failed jobs to rerun.',
    {
      runId: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          'Run ID (single-run mode). Exactly one of runId/runIds is required.',
        ),
      runIds: z
        .array(z.coerce.number().int().positive())
        .min(1)
        .max(50)
        .optional()
        .describe(
          'Run IDs to rerun independently (1-50, batch mode). Not with runId, scope="job", or withDiagnostics.',
        ),
      scope: z
        .enum(['failed', 'job', 'all'])
        .default('failed')
        .describe(
          'What to rerun: "failed" (default), "job" (needs jobId/jobName, single-run only), or "all".',
        ),
      jobId: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe('Job ID to rerun; scope="job", single-run only.'),
      jobName: z
        .string()
        .optional()
        .describe(
          'jobId alternative for scope="job": case-insensitive substring match against the run\'s job list; errors ' +
            'on zero or multiple matches.',
        ),
      withDiagnostics: coercedBoolean
        .default(false)
        .describe(
          'Single-run, scope="failed" only. Fetch a failure-log snippet and richer per-job payload before rerunning.',
        ),
      withFreshLogs: coercedBoolean
        .default(false)
        .describe(
          'withDiagnostics only. Include a follow-up hint pointing at the ci_get_logs call for fresh failure logs once the new attempt completes.',
        ),
      debug: coercedBoolean
        .default(false)
        .describe('Enable debug logging (ignored for scope="job")'),
    },
    async (params) => ciRerun(params),
  );

  server.tool(
    'ci_cancel_run',
    'Prefer this over `gh run cancel` via shell. Cancel a single in-flight run via runId — e.g. killing a stale-SHA dispatch after ' +
      'pushing a follow-up commit — or every in-flight (queued/in_progress) run of a workflow on a branch via workflow+branch ' +
      '(e.g. serializing expensive live-backend integration runs so a fresh dispatch never races a stale one, LS-7878); pass one ' +
      'mode, not both. Single-run mode re-fetches the run after cancelling since GitHub does not transition synchronously (it ' +
      'passes through `cancel_in_progress` first); cancelling an already-completed run returns a clear error rather than throwing. ' +
      'Bulk mode resolves `workflow` the same way ci_list_runs does and returns the standard partial-failure shape ' +
      '{ success, total, succeeded, failed }, with total: 0 when nothing is in flight.',
    {
      runId: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          'Run ID to cancel (single-run mode). Use the "id" field from ci_list_runs output ("databaseId" is an alias).',
        ),
      workflow: z
        .union([z.string(), z.number().int()])
        .transform(String)
        .optional()
        .describe(
          'Workflow filename, display name, or numeric ID (bulk mode, with branch).',
        ),
      branch: z
        .string()
        .min(1)
        .optional()
        .describe(
          'Branch to scope bulk cancellation to (bulk mode, with workflow).',
        ),
    },
    async (params) => ciCancelRun(params),
  );

  server.tool(
    'ci_view_run',
    'Prefer this over `gh run view` via shell. View a CI run summary with jobs and conclusions. Pass runIds (1-50) instead of ' +
      'runId to inspect several runs independently in one call (e.g. checking CI across multiple PRs before merging) — attempt ' +
      'and format are single-run only; batch results use the standard partial-failure shape { success, total, succeeded, failed }.',
    {
      runId: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          'Run ID (single-run mode). Exactly one of runId/runIds is required.',
        ),
      runIds: z
        .array(z.coerce.number().int().positive())
        .min(1)
        .max(50)
        .optional()
        .describe(
          'Run IDs to inspect independently (1-50, batch mode). Not with runId or attempt.',
        ),
      attempt: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe('Attempt number (single-run only).'),
      includeJobs: coercedBoolean
        .default(true)
        .describe('Include jobs (default: true)'),
      format: z
        .enum(['markdown', 'json'])
        .default('markdown')
        .describe(
          'Output format for single-run mode. "markdown" (default) returns a compact summary with a job table and a Failed Jobs section. "json" returns the full structured payload. Batch mode always returns structured JSON per run.',
        ),
    },
    async (params) => ciViewRun(params),
  );

  server.tool(
    'ci_retry_runner_flake',
    'Single-call detect-and-retry for the recurring self-hosted-runner-shutdown flake: given a PR number, ' +
      'checks whether the repo\'s own "CI: Runner Flake" label and "runner shutdown" bot comment are present ' +
      '(applied by ci-orchestrator.yml when a self-hosted runner shuts down mid-run), and if so, extracts the ' +
      'run ID and reruns the affected failed job(s) via the same path as ci_rerun({ withDiagnostics: true }) ' +
      '— without the caller first grepping logs to confirm the failure signature. When both are absent, ' +
      "falls back (LS-9334) to scanning the most recent run's failed/cancelled job logs for the shutdown " +
      'signature first. Returns a clear, non-error result (never a false positive on a genuine ' +
      'failure) when no signal is found, pointing at ci_rerun({ runId, withDiagnostics: true }) as the manual ' +
      'fallback. Kept separate from ci_rerun: its prNumber input and shutdown-detection precondition give ' +
      'it a materially different schema — the documented escape hatch in the consolidation standard.',
    {
      prNumber: z.coerce
        .number()
        .int()
        .positive()
        .describe(
          'PR number to check for the runner-shutdown flake signal and retry if detected.',
        ),
    },
    async (params) => retryRunnerFlake(params),
  );

  server.tool(
    'ci_unwedge_orchestrator',
    'Prefer this over the raw `gh run list`/`gh api .../jobs`/`gh run view` cancel+ci:run-label sequence. Detects and recovers a ' +
      'wedged ci-orchestrator.yml run: stuck `pending` with 0 jobs, holding the `orchestrator-<PR#>` concurrency group so CI Gate ' +
      "never posts (LS-7752). Finds the PR's stalest pending 0-job run older than staleAfterSeconds (default 300s), cancels it, " +
      'polls for confirmed cancellation, then applies the "ci:run" label to redispatch via workflow_dispatch. Bounded ~12s per call ' +
      '— an unconfirmed cancellation returns { status: "cancelling", runId, hint } (never an error); re-invoke with that runId to ' +
      'resume without re-discovering/re-cancelling. Other outcomes: "clean" (no wedge found), "unnecessary" (run finished on its ' +
      'own, not wedged), "redispatched" (recovered).',
    {
      prNumber: z.coerce
        .number()
        .int()
        .positive()
        .describe('PR number whose ci-orchestrator.yml run may be wedged.'),
      runId: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          'Resume mode: runId from a prior { status: "cancelling" } response. Skips discovery/re-cancellation.',
        ),
      staleAfterSeconds: z.coerce
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe(
          'Min age (s) before a pending 0-job run counts as wedged. Default 300.',
        ),
      maxWaitSeconds: z.coerce
        .number()
        .int()
        .positive()
        .max(12)
        .optional()
        .describe(
          'Max wait for cancellation confirmation per call (default/cap: 12s).',
        ),
    },
    async (params) => unwedgeOrchestrator(params),
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
      pattern: z
        .string()
        .min(1)
        .describe(
          'Search string or regex pattern. Note: `|` alone does NOT enable ' +
            'alternation (a|b|c) — it is matched as a literal pipe character ' +
            'unless isRegex is also set to true.',
        ),
      jobId: z.coerce.number().int().positive().optional().describe('Job ID'),
      failedOnly: coercedBoolean
        .default(true)
        .describe(
          'Failed steps only (default: true). WARNING: when the job whose ' +
            'logs contain the searched-for text actually succeeded, this can ' +
            'silently exclude it from the search entirely — the response will ' +
            'still return totalMatches: 0, but with a scopeNote explaining 0 ' +
            'jobs were searched. Set false to search all jobs regardless of ' +
            'conclusion.',
        ),
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
      truncateLineLength: z.coerce
        .number()
        .int()
        .positive()
        .max(10_000)
        .optional()
        .describe(
          'Truncate every line (the matched line and every before/after context line) longer than this many characters. Defaults to 500 for the matched line and 200 for context lines when omitted.',
        ),
      maxChars: z.coerce
        .number()
        .int()
        .positive()
        .max(200_000)
        .optional()
        .describe(
          'Hard cap on total output characters (default: 50000). Prevents context overflow when limitMatches and context lines together still produce a large response — trailing matches are dropped until the response fits.',
        ),
    },
    async (params) => searchLogs(params),
  );

  server.tool(
    'ci_view_run_jobs',
    'Prefer this over `gh run view --json jobs` via shell. List per-job name, status, and conclusion for a specific CI run. ' +
      'Use this to confirm all jobs passed before merging a PR. ' +
      'Returns a summary (total, passed, failed, skipped, inProgress, allPassed) plus per-job details. ' +
      'Use filter to narrow to a specific conclusion (e.g. "failure" to see only failed jobs). ' +
      'This is complementary to ci_view_run (run-level summary) and ci_get_logs (log output for failed jobs).',
    {
      runId: z.coerce.number().int().positive().describe('Run ID'),
      attempt: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe('Attempt number'),
      filter: z
        .enum(['failure', 'success', 'skipped', 'cancelled', 'in_progress'])
        .optional()
        .describe(
          'Filter jobs by conclusion (or "in_progress" for currently running jobs). Omit to return all jobs.',
        ),
      includeSteps: coercedBoolean
        .default(false)
        .describe('Include per-step breakdown for each job (default: false)'),
    },
    async (params) => viewRunJobs(params),
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
        .describe(
          'Include GitHub App installation permissions (default: false)',
        ),
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
    'Trigger a GitHub Actions workflow_dispatch event. Accepts a workflow file name (e.g. "deploy.yml"), numeric ID, or display name (e.g. "Legacy Sports CI Orchestrator") — resolved the same way as ci_list_runs, plus optional ref and input parameters. ' +
      "Set waitForCompletion: true to wait for the run (bounded at ~20s per call to stay under this Lambda-hosted server's own 30s execution timeout): fast runs return the final conclusion in one call; " +
      'longer runs return { status: "in_progress", runId } — continue with ci_wait_run({ runId }), never by re-dispatching. ' +
      'This is the MCP-native alternative to `gh run watch` for non-PR dispatched runs — avoids the shell fallback and session-resume watcher-death problem. ' +
      'When waitForCompletion is false (default), the tool returns immediately and the agent must use ci_list_runs then ci_view_run to track the run. ' +
      'Note: PR-associated runs notify natively via push events; use waitForCompletion only for workflow_dispatch runs that have no associated PR.',
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
      waitForCompletion: coercedBoolean
        .default(false)
        .describe(
          'When true, polls the triggered run for up to ~20s and returns ' +
            '{ status: "completed", conclusion, ... } if it finishes, or ' +
            '{ status: "in_progress", runId, hint } if not — continue waiting with ci_wait_run({ runId }). ' +
            'Use this instead of `gh run watch` for non-PR workflow_dispatch runs. Default: false.',
        ),
      timeoutSeconds: z.coerce
        .number()
        .int()
        .positive()
        .max(3600)
        .default(600)
        .describe(
          'Deprecated — the per-call wait is always clamped to ~20s (this Lambda-hosted ' +
            "server's own execution timeout, not the MCP transport deadline). Kept for " +
            'backward compatibility; longer waits are re-armed via ci_wait_run.',
        ),
    },
    async (params) => dispatchWorkflow(params),
  );

  server.tool(
    'ci_wait_run',
    'Wait for a workflow run to complete, bounded at 20s per call (stays under this ' +
      'Lambda-hosted server\'s own 30s execution timeout). Returns { status: "completed", ' +
      'conclusion } when the run finishes, or a { status: "in_progress", hint } snapshot ' +
      '(never an error) if it has not — re-invoke to continue waiting. Use after ' +
      'ci_dispatch_workflow returns in_progress, or after a session resume to re-attach to a ' +
      'run without re-dispatching.',
    {
      runId: z.coerce.number().int().positive().describe('Run ID'),
      maxWaitSeconds: z.coerce
        .number()
        .int()
        .positive()
        .max(20)
        .optional()
        .describe('Max wait per call in seconds (default and cap: 20)'),
    },
    async (params) => waitRun(params),
  );

  server.tool(
    'ci_get_playwright_report',
    'Read a Playwright E2E test report deployed to legacy-sports-deploys. ' +
      'Returns overall stats (total/passed/failed/skipped/flaky), per-file breakdowns, ' +
      'lists of failed/flaky test titles, and a skippedTests array with { name, file, reason } ' +
      'for every skipped test (reason comes from the test annotation description). ' +
      'Pass prNumber to auto-resolve the report for a PR (e.g. { prNumber: 5271 }). ' +
      'Pass runId to auto-resolve by GitHub Actions run ID (auto-expanded to nightly-/manual- fallbacks). ' +
      'Pass reportName when you already know the exact deployed name (e.g. "pr-2173", "manual-146"). ' +
      'At least one of prNumber, runId, or reportName is required. If multiple are provided, prNumber takes precedence, then runId, then reportName. ' +
      'Examples: ci_get_playwright_report({ prNumber: 5271 }) · ci_get_playwright_report({ runId: 12345678 }) · ci_get_playwright_report({ reportName: "pr-2173" })',
    {
      reportName: z
        .string()
        .regex(
          /^[\w.-]+$/,
          'reportName must contain only alphanumeric characters, hyphens, underscores, and dots — no path separators or special characters allowed',
        )
        .optional()
        .describe(
          'Exact report name as deployed: "pr-{number}" for PRs (e.g. "pr-2173"), "manual-{number}" for manually-triggered runs (e.g. "manual-146"), "nightly-{run_id}" for nightly runs, or a bare numeric GitHub run ID (auto-expanded to nightly-/manual- fallbacks). Omit when using prNumber or runId.',
        ),
      prNumber: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          'GitHub PR number. Auto-resolves to the report deployed under "pr-{prNumber}". Use this when triaging CI failures on a specific PR.',
        ),
      runId: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          'GitHub Actions workflow run ID. Auto-expanded to nightly-{id} or manual-{id} fallbacks when not found directly.',
        ),
    },
    async (params) => {
      if (
        params.prNumber === undefined &&
        params.runId === undefined &&
        params.reportName === undefined
      ) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: 'One of prNumber, runId, or reportName is required.',
            },
          ],
        };
      }
      return getPlaywrightReport(params);
    },
  );

  server.registerTool(
    'ci_get_playwright_test_result',
    {
      description:
        'Read a SINGLE test result from a Playwright report, or list S3 blob artifacts for a CI run. ' +
        'Prefer this over ci_get_playwright_report when you already know which test failed and want only ' +
        'its error, snippet, stdout/stderr, and attachments — it keeps the full report out of context. ' +
        'Identify the report with reportName or runId, and the test with testTitle and/or fileName/testFile; ' +
        'an ambiguous match returns a candidates list. Report naming, S3 blob handling, and the ' +
        'runId+testFile webhook lookup: .agents/skills/read-playwright-report/SKILL.md.',
      inputSchema: z
        .object({
          reportName: z
            .string()
            .regex(
              /^[\w.-]+$/,
              'reportName must contain only alphanumeric characters, hyphens, underscores, and dots — no path separators or special characters allowed',
            )
            .optional()
            .describe(
              'Deployed report name (pr-N, manual-N, nightly-<runId>) or a bare numeric run ID. Alternative to runId; one is required.',
            ),
          runId: z
            .union([z.string(), z.number()])
            .optional()
            .describe(
              'GitHub Actions run ID (e.g. from the <integration-results> webhook). Alternative to reportName; one is required.',
            ),
          testTitle: z
            .string()
            .min(1)
            .optional()
            .describe(
              'Case-insensitive substring of the full title (describe path joined by " > "). Optional when fileName/testFile is given.',
            ),
          fileName: z
            .string()
            .optional()
            .describe(
              'Case-insensitive spec-filename substring, to disambiguate identical titles (gh-pages mode). Alias: testFile.',
            ),
          testFile: z
            .string()
            .optional()
            .describe(
              'Alias for fileName, matching the <integration-results> webhook field. One of testTitle or fileName/testFile is required.',
            ),
          source: z
            .enum(['gh-pages', 's3'])
            .optional()
            .describe(
              '"gh-pages" (default) or "s3" (presigned blob-archive URLs) — use s3 when the GH Pages report is absent.',
            ),
          artifactType: z
            .enum(['blobs', 'coverage', 'output'])
            .optional()
            .describe('s3 mode only: artifact prefix. Default "blobs".'),
          maxChars: z.coerce
            .number()
            .int()
            .positive()
            .max(100_000)
            .optional()
            .describe(
              'Reserved for future use. gh-pages mode applies a fixed 4000-char per-field cap; s3 presigned URLs are never truncated.',
            ),
        })
        .superRefine((val, ctx) => {
          if (val.reportName == null && val.runId == null) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'One of reportName or runId is required.',
              path: ['reportName'],
            });
          }
          if (
            val.testTitle == null &&
            val.fileName == null &&
            val.testFile == null
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'One of testTitle or fileName/testFile is required.',
              path: ['testTitle'],
            });
          }
        }),
    },
    async (params) => getPlaywrightTestResult(params),
  );

  server.tool(
    'ci_audit_session_bash',
    'Extract Bash tool_use calls (and optionally MCP overflows/failures) from the current Claude Code session ' +
      'transcript, including subagent transcripts, so the inventory survives context compaction. ' +
      'Auto-detects the current session and project, worktree sessions included. Output modes: default ' +
      'structured JSON; gapsOnly for a compact frequency table; auditMode for a pre-classified gap report ' +
      'with confidence scores and draft ticket summaries. ' +
      'Drives the MCP gap audit — see .agents/skills/mcp-first/references/audit-workflow.md.',
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
      projectsDir: z
        .string()
        .optional()
        .describe(
          'Base directory holding project session folders. Overrides auto-detection — needed when the ' +
            "server process's home does not match the session location (some CCR topologies).",
        ),
      transcriptContent: z
        .string()
        .optional()
        .describe(
          'Raw transcript JSONL; bypasses path resolution (no shared filesystem case, LS-9362).',
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
          'Compact output: one line per unique command pattern (<5 KB), gaps separated from covered commands.',
        ),
      scanScratch: coercedBoolean
        .default(false)
        .describe(
          'Also scan scratch/*.py for subprocess shell patterns; reported under "scratch_subprocess_calls".',
        ),
      auditMode: coercedBoolean
        .default(false)
        .describe(
          'Full audit report: pre-classified gaps with confidence scores, draft ticket summaries, noise ' +
            'filtering, and overflow/failure triage. Implies includeMcp. Review and approve rather than ' +
            'classify from scratch.',
        ),
      sessionToolNames: z
        .array(z.string())
        .optional()
        .describe(
          'Your current tool names — reclassifies `gh pr *`/`gh run *` as a real gap when the ' +
            'covering MCP server is absent from this list, instead of always "covered" (LS-9749).',
        ),
    },
    (params) => auditSessionBash(params),
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
    'Check if the CI server is authenticated with GitHub. Returns token source (GH_TOKEN, GITHUB_TOKEN, github-app, or gh-cli), authenticated user login, and rate limit info for whichever token that source resolved to. Call this first to verify credentials are working before using other ci_* tools. Also see github_auth_status for basic GitHub auth status without rate limit info. ' +
      'NOTE: rateLimit here is not guaranteed to be the installation bucket (GH_TOKEN/GITHUB_TOKEN take precedence when set) — use ci_installation_rate_limit for that specifically.',
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
                  hint:
                    'Set AGENT_AUTHOR_APP_PRIVATE_KEY or GH_TOKEN in cloud env settings. ' +
                    'Fallback: use mcp__github__actions_list with per_page ≤ 5 — ' +
                    'it returns large payloads (~65 KB at per_page=3), so save to a file and extract fields with python3 or jq.',
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
                    error: formatGithubApiError(userRes.status, body),
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
                        resetsAt: new Date(
                          rateLimit.reset * 1000,
                        ).toISOString(),
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

  server.tool(
    'ci_installation_rate_limit',
    "Report the GitHub App installation token's core rate limit (remaining/limit/reset) — the SAME budget " +
      'secrets.GITHUB_TOKEN draws from in workflows. Always mints a fresh installation token via ' +
      'AGENT_AUTHOR_APP_PRIVATE_KEY and queries GET /rate_limit directly, bypassing GH_TOKEN/GITHUB_TOKEN env ' +
      "precedence, so it's always the installation bucket — unlike ci_auth_status's rateLimit field. " +
      "`gh api rate_limit` reports a DIFFERENT bucket (the CLI's own user/PAT token) and does not answer " +
      '"is CI rate limited?" (LS-9570). Call this when a CI step failed with "API rate limit exceeded for ' +
      'installation", or silently withheld a status/verdict it otherwise computed correctly (a rate-limit ' +
      'signature, not a real verdict). Remedy: wait until resetsAt, then re-run — not an immediate retry.',
    {},
    async () => {
      try {
        const rateLimit = await getInstallationRateLimit();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  configured: true,
                  source: 'github-app-installation',
                  rateLimit,
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
                  error: err instanceof Error ? err.message : String(err),
                  hint:
                    'Set AGENT_AUTHOR_APP_PRIVATE_KEY in cloud env settings to enable installation-bucket ' +
                    'rate-limit checks. Do not fall back to `gh api rate_limit` — it reports a different ' +
                    "bucket (the CLI's own user/PAT token), not the installation budget workflows draw from.",
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

  server.tool(
    'ci_deploys_repo_auth_status',
    'Diagnose why ci_get_playwright_report/ci_get_playwright_test_result might 404 on the private ' +
      'bkrupa/legacy-sports-deploys repo (LS-8788) — WITHOUT triggering a real report fetch. Explicitly ' +
      'exercises each credential tier getDeploysToken() tries, in order: (1) PREVIEW_APP_PRIVATE_KEY + ' +
      "PREVIEW_APP_ID (dedicated deploy App), (2) the agent-author App's own installation on the deploys " +
      'repo. Reports which tier is configured, which succeeded/failed and why, and which source ' +
      '`resolvedSource` a real ci_get_playwright_report call would actually use right now. ' +
      '`resolvedSource: "fallback"` means both tiers are unavailable and reads will 404 with the ' +
      '"broad fallback token" credentials-gap message — see .agents/skills/read-playwright-report/SKILL.md ' +
      'for the two known remedies (both require one-time human action outside this repo). Call this to ' +
      'verify a credentials fix actually landed instead of re-triggering a report fetch and re-deriving ' +
      'the same diagnosis from a 404.',
    {},
    async () => {
      const diagnostics = await getDeploysTokenDiagnostics();
      return {
        content: [{ type: 'text', text: minifiedJson(diagnostics) }],
      };
    },
  );

  return server;
}

if (!process.env['AWS_LAMBDA_FUNCTION_NAME']) {
  void (async () => {
    const transport = new StdioServerTransport();
    await createServer().connect(transport);
  })();
}
