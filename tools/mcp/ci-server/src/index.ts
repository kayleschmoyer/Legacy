import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { auditSessionBash } from './tools/audit-session-bash.js';
import { autoFix } from './tools/auto-fix.js';
import { cancelRun } from './tools/cancel-run.js';
import { cancelRuns } from './tools/cancel-runs.js';
import { dispatchWorkflow } from './tools/dispatch-workflow.js';
import { findSession } from './tools/find-session.js';
import { getLogs } from './tools/get-logs.js';
import { getPlaywrightReport } from './tools/get-playwright-report.js';
import { getPlaywrightTestResult } from './tools/get-playwright-test-result.js';
import { listRuns } from './tools/list-runs.js';
import { rerun } from './tools/rerun.js';
import { rerunBatch } from './tools/rerun-batch.js';
import { retryFailed } from './tools/retry-failed.js';
import { retryRunnerFlake } from './tools/retry-runner-flake.js';
import { searchLogs } from './tools/search-logs.js';
import { sessionStats } from './tools/session-stats.js';
import { viewRun } from './tools/view-run.js';
import { waitRun } from './tools/wait-run.js';
import { viewRunBatch } from './tools/view-run-batch.js';
import { viewRunJobs } from './tools/view-run-jobs.js';
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
    'Prefer this over `gh run view --log-failed` via shell. Fetch CI logs for a run or job. Defaults to failed-step logs only. Use jobName to filter logs to a specific job by name (case-insensitive substring match) without needing its numeric ID. Response is a minified-JSON metadata line followed by the raw log text with real newlines (not a JSON string field) — if this response is large enough to be persisted to a tool-results/*.txt file, grep and offset/limit-chunked Read both work directly against the log content.',
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
          'Batch mode: fetch logs for up to 10 runs in one call (concurrency capped at 3). Response is a minified-JSON header line ({ runIds, missing: [{ runId, reason }] }) followed by one "=== run <id> ===" section per successful run, each with its own metadata line + raw log text — runs whose log archives are missing (e.g. BlobNotFound 404 after GitHub log expiry) are isolated to missing[] instead of failing the whole call. Cannot be combined with jobId.',
        ),
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
      maxChars: z.coerce
        .number()
        .int()
        .positive()
        .max(200_000)
        .optional()
        .describe(
          'Hard cap on total output characters (default: 50000). Prevents context overflow when individual log lines are very long (e.g. JSON blobs). Output is truncated at this limit regardless of maxLines.',
        ),
      truncateLineLength: z.coerce
        .number()
        .int()
        .positive()
        .max(10_000)
        .optional()
        .describe(
          'Truncate individual lines longer than this many characters (e.g. 500). Useful when logs contain very long JSON or minified output. Truncated lines are suffixed with ...[line truncated].',
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
    'Prefer this over `gh run rerun` or `gh run rerun --failed` via shell. Rerun failed jobs, a specific job, or an entire CI run. Defaults to failed-only (equivalent to `gh run rerun --failed`). Use ci_rerun_failed_jobs when you want a dedicated name that mirrors the shell command and makes the intent explicit.',
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
    'ci_rerun_failed_jobs',
    'Prefer this over `gh run rerun --failed` via shell. Re-run only the failed jobs of a GitHub Actions run. ' +
      'Equivalent to ci_rerun({ runId, failedOnly: true }) but with a dedicated name for discoverability. ' +
      'Use when a transient CI failure (flaky test, runner timeout, network hiccup) needs a re-run without touching the full workflow.',
    {
      runId: z.coerce
        .number()
        .int()
        .positive()
        .describe(
          'Run ID. Use the "id" field from ci_list_runs output ("databaseId" is an alias for the same value).',
        ),
      debug: coercedBoolean.default(false).describe('Enable debug logging'),
    },
    async (params) => rerun({ ...params, failedOnly: true }),
  );

  server.tool(
    'ci_rerun_batch',
    'Batch variant of ci_rerun: rerun several runs in one call (e.g. re-validating multiple PRs after a shared root-cause fix). ' +
      'Accepts an array of run IDs (max 50); each run is rerun independently so one run erroring does not fail the whole call. ' +
      'Returns the standard partial-failure shape { success, total, succeeded: [...], failed: [{ index, runId, error }] }. ' +
      'Keep ci_rerun for single-run use.',
    {
      runIds: z
        .array(z.coerce.number().int().positive())
        .min(1)
        .max(50)
        .describe(
          'Run IDs to rerun (1-50). Use the "id" field from ci_list_runs output ("databaseId" is an alias).',
        ),
      failedOnly: coercedBoolean
        .default(true)
        .describe(
          'Rerun only failed jobs of each run (default: true). Set false to rerun the entire run.',
        ),
      debug: coercedBoolean.default(false).describe('Enable debug logging'),
    },
    async (params) => rerunBatch(params),
  );

  server.tool(
    'ci_cancel_run',
    'Prefer this over `gh run cancel` via shell. Cancel a single in-flight GitHub Actions run — e.g. killing a stale-SHA dispatch after pushing a follow-up commit, or stopping an expensive live-backend integration run that is no longer needed. ' +
      'GitHub does not transition the run to `cancelled` synchronously (it passes through `cancel_in_progress` first), so the response reflects the actual post-cancel status from a follow-up fetch, not an assumed value. ' +
      'Cancelling a run that has already completed returns a clear error rather than throwing. Use ci_cancel_runs to cancel every in-flight run of a workflow on a branch in one call.',
    {
      runId: z.coerce
        .number()
        .int()
        .positive()
        .describe(
          'Run ID. Use the "id" field from ci_list_runs output ("databaseId" is an alias for the same value).',
        ),
    },
    async (params) => cancelRun(params),
  );

  server.tool(
    'ci_cancel_runs',
    'Bulk variant of ci_cancel_run: cancel every non-completed (queued/in_progress) run of a workflow on a branch in one call — ' +
      'e.g. serializing expensive live-backend integration runs so a fresh dispatch never races a stale one on the same branch (LS-7878). ' +
      'Resolves `workflow` the same way ci_list_runs does (display name, filename, or numeric ID). ' +
      'Returns the standard partial-failure shape { success, total, succeeded, failed } so one run failing to cancel does not fail the whole call; ' +
      'returns total: 0 when no in-flight runs are found.',
    {
      workflow: z
        .union([z.string(), z.number().int()])
        .transform(String)
        .describe('Workflow filename, display name, or numeric ID'),
      branch: z
        .string()
        .min(1)
        .describe('Branch name to scope the cancellation to'),
    },
    async (params) => cancelRuns(params),
  );

  server.tool(
    'ci_retry_failed',
    'Semantic one-shot for the triage-then-rerun loop: identifies failed jobs in a run, ' +
      'fetches a short error snippet from the original logs, and triggers a rerun of just ' +
      'the failed jobs. Returns { originalRunId, originalAttempt, newRunId, newAttempt, ' +
      'failedJobsRerun, originalLogSnippet, url }. Errors clearly when there are no failed ' +
      'jobs to rerun (so it never silently no-ops). Replaces the manual chain ' +
      'ci_view_run → ci_view_run_jobs → ci_get_logs → ci_rerun_failed_jobs.',
    {
      runId: z.coerce
        .number()
        .int()
        .positive()
        .describe(
          'Run ID. Use the "id" field from ci_list_runs output ("databaseId" is an alias for the same value).',
        ),
      withFreshLogs: coercedBoolean
        .default(false)
        .describe(
          'Include a follow-up hint in the response pointing at the ci_get_logs call ' +
            'that will fetch fresh failure logs once the new attempt completes.',
        ),
    },
    async (params) => retryFailed(params),
  );

  server.tool(
    'ci_retry_runner_flake',
    'Single-call detect-and-retry for the recurring self-hosted-runner-shutdown flake: given a PR number, ' +
      'checks whether the repo\'s own "CI: Runner Flake" label and "runner shutdown" bot comment are present ' +
      '(applied by ci-orchestrator.yml when a self-hosted runner shuts down mid-run), and if so, extracts the ' +
      'run ID from the comment and reruns the affected failed job(s) via the same path as ci_retry_failed — ' +
      'without the caller first fetching or grepping logs to confirm the failure signature. ' +
      'Returns a clear, non-error informational result (never a silent no-op) when the label or comment is ' +
      'absent, pointing at ci_retry_failed({ runId }) as the manual fallback. Additive only — does not change ' +
      'ci_retry_failed or ci_rerun_failed_jobs behavior.',
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
      format: z
        .enum(['markdown', 'json'])
        .default('markdown')
        .describe(
          'Output format. "markdown" (default) returns a compact summary with a job table and a Failed Jobs section. "json" returns the full structured payload.',
        ),
    },
    async (params) => viewRun(params),
  );

  server.tool(
    'ci_view_run_batch',
    'Batch variant of ci_view_run: inspect several runs in one call (e.g. checking CI status across multiple PRs before merging). ' +
      'Accepts an array of run IDs (max 50); each run is fetched independently so one run erroring does not fail the whole call. ' +
      'Returns the standard partial-failure shape { success, total, succeeded: [...], failed: [{ index, runId, error }] }. ' +
      'Use ci_view_run for a single run or when targeting a specific attempt (attempt is not supported here).',
    {
      runIds: z
        .array(z.coerce.number().int().positive())
        .min(1)
        .max(50)
        .describe(
          'Run IDs to inspect (1-50). Use the "id" field from ci_list_runs output ("databaseId" is an alias).',
        ),
      includeJobs: coercedBoolean
        .default(true)
        .describe('Include jobs for each run (default: true)'),
    },
    async (params) => viewRunBatch(params),
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
    'Trigger a GitHub Actions workflow_dispatch event. Accepts workflow file name (e.g. "deploy.yml") or numeric ID, plus optional ref and input parameters. ' +
      'Set waitForCompletion: true to wait for the run (bounded at ~55s per call to stay under the MCP transport timeout): fast runs return the final conclusion in one call; ' +
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
          'When true, polls the triggered run for up to ~55s and returns ' +
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
          'Deprecated — the per-call wait is always clamped to ~55s (the MCP transport ' +
            'deadline). Kept for backward compatibility; longer waits are re-armed via ci_wait_run.',
        ),
    },
    async (params) => dispatchWorkflow(params),
  );

  server.tool(
    'ci_wait_run',
    'Wait for a workflow run to complete, bounded at 55s per call (stays under the MCP ' +
      'transport timeout). Returns { status: "completed", conclusion } when the run finishes, ' +
      'or a { status: "in_progress", hint } snapshot (never an error) if it has not — ' +
      're-invoke to continue waiting. Use after ci_dispatch_workflow returns in_progress, ' +
      'or after a session resume to re-attach to a run without re-dispatching.',
    {
      runId: z.coerce.number().int().positive().describe('Run ID'),
      maxWaitSeconds: z.coerce
        .number()
        .int()
        .positive()
        .max(55)
        .optional()
        .describe('Max wait per call in seconds (default and cap: 55)'),
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

  server.tool(
    'ci_get_playwright_test_result',
    'Read a SINGLE test result out of a Playwright report (GH Pages) or list S3 blob artifacts for a CI run. ' +
      'Use this (not ci_get_playwright_report) when you already know which test is failing and just need ' +
      'its error, snippet, stdout/stderr, and attachment list — it keeps the full report out of context. ' +
      "Matches testTitle as a case-insensitive substring against each test's full title " +
      '(describe path joined with " > "). If multiple tests match, returns a candidates list instead ' +
      'of a single result; pass fileName to disambiguate. String fields are truncated to ~4000 chars ' +
      'so a chatty test cannot overflow the response.\n\n' +
      'GH Pages mode (source="gh-pages", default): fetches from the legacy-sports-deploys gh-pages branch. ' +
      'When reportName is a bare numeric run ID, automatically tries nightly-{id} and manual-{id} as fallbacks ' +
      'so you do not need to know the exact deployed name.\n\n' +
      'S3 mode (source="s3"): for integration nightly runs whose GH Pages report is absent or when you need ' +
      'the raw Playwright blob artifacts. Resolves the run ID to a HEAD SHA via the GitHub API, lists all ' +
      'blob zip files under s3://legacy-sports-dev-ci-artifacts/ci-artifacts/{sha}/playwright-blobs/, and ' +
      'returns 1-hour presigned GET URLs. Objects expire after 3 days — older runs return empty:true. ' +
      'Each blob zip is a Playwright blob-reporter archive; use playwright merge-reports or unzip to extract ' +
      'individual test-results (error-context.md, trace.zip).',
    {
      reportName: z
        .string()
        .regex(
          /^[\w.-]+$/,
          'reportName must contain only alphanumeric characters, hyphens, underscores, and dots — no path separators or special characters allowed',
        )
        .describe(
          'Report name as deployed: "pr-{number}" for PRs (e.g. "pr-2173"), "manual-{number}" for manually-triggered runs (e.g. "manual-146"), "nightly-{run_id}" for nightly runs, or a bare numeric GitHub run ID (auto-expanded to nightly-/manual- fallbacks in gh-pages mode, or used directly in s3 mode).',
        ),
      testTitle: z
        .string()
        .min(1)
        .describe(
          'Substring of the test\'s full title (case-insensitive). Full title is the describe path joined by " > ", ending with the test name. Used as a filter hint in s3 mode (not parsed from blobs).',
        ),
      fileName: z
        .string()
        .optional()
        .describe(
          'Optional substring filter on the spec file name (case-insensitive) to disambiguate identical titles across files (gh-pages mode only).',
        ),
      source: z
        .enum(['gh-pages', 's3'])
        .optional()
        .describe(
          'Artifact source. "gh-pages" (default): fetch from legacy-sports-deploys GitHub Pages. "s3": resolve HEAD SHA from run ID and return presigned S3 URLs for Playwright blob archives — use when the GH Pages report is absent or for raw integration CI artifacts.',
        ),
      maxChars: z.coerce
        .number()
        .int()
        .positive()
        .max(100_000)
        .optional()
        .describe(
          'Reserved for future use (default: 10000). Presigned URLs cannot be truncated (they would become invalid), so s3 mode always returns full artifact fields. In gh-pages mode a fixed 4000-char per-field cap (MAX_FIELD_CHARS) is applied instead.',
        ),
    },
    async (params) => getPlaywrightTestResult(params),
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

  return server;
}

if (!process.env['AWS_LAMBDA_FUNCTION_NAME']) {
  void (async () => {
    const transport = new StdioServerTransport();
    await createServer().connect(transport);
  })();
}
