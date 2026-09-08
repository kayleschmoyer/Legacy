/**
 * Statuses retried with backoff by {@link fetchWithRetry}: the classic
 * transient gateway errors (502/503/504), plus 410 (LS-8435) — GitHub's
 * job-log-download endpoint can return "410 Server Error" for a job that
 * completed successfully moments earlier, before the log archive has
 * finished being written to blob storage. It is not a genuine "logs gone"
 * response (that would be a 404, see isBlobNotFound404 in logs.ts); it
 * clears up within the same short retry window as a 502/503/504.
 */
const RETRIABLE_STATUSES = new Set([410, 502, 503, 504]);
const LOG_BLOB_MAX_ATTEMPTS = 3;

const ALREADY_RUNNING_STATUS = /^GitHub API 403\b/;
const ALREADY_RUNNING_TEXT = /already running|already in progress/i;

/**
 * An HTTP error carrying the response status as a typed property, so callers
 * can branch on `error.status` instead of pattern-matching the message
 * string (LS-8551 review follow-up — a message-format change would silently
 * break a string check).
 */
export class HttpStatusError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpStatusError';
  }
}

/**
 * True when a GitHub API error message is the "workflow is already running"
 * 403 race: the run-level status POST /rerun* gates on lags the per-job
 * status ci_view_run_jobs reports, so a request can be rejected even after
 * all jobs look complete. Other 403s (e.g. permissions) don't match and
 * should fail fast, unchanged.
 */
export function isAlreadyRunningError(message: string): boolean {
  return (
    ALREADY_RUNNING_STATUS.test(message) && ALREADY_RUNNING_TEXT.test(message)
  );
}

/**
 * True when `error` is the DOMException Node's fetch throws when an
 * `AbortSignal.timeout(...)` fires before the request completes (e.g. the
 * per-attempt ceiling `githubPost` applies — LS-8704). Distinguishing this
 * from a generic error lets a caller like `rerun.ts` return an actionable
 * hint ("the request was taking too long, safe to retry") instead of an
 * opaque failure — this client-side timeout is what turns a would-be Lambda
 * SIGKILL (raw, unparseable "Service Unavailable" transport error) into a
 * clean, catchable one.
 */
export function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  );
}

/** Truncate and redact auth tokens from API error response bodies. */
export function sanitizeErrorBody(text: string, maxLen = 500): string {
  let sanitized = text
    .replace(/Bearer\s+[A-Za-z0-9_\-.]+/gi, 'Bearer ***')
    .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, 'Basic ***')
    .replace(/token\s+[A-Za-z0-9_\-.]+/gi, 'token ***')
    .replace(/ghp_[A-Za-z0-9_]+/g, 'ghp_***')
    .replace(/gho_[A-Za-z0-9_]+/g, 'gho_***')
    .replace(/ghs_[A-Za-z0-9_]+/g, 'ghs_***')
    .replace(/ghu_[A-Za-z0-9_]+/g, 'ghu_***')
    .replace(/github_pat_[A-Za-z0-9_]+/g, 'github_pat_***');
  if (sanitized.length > maxLen) {
    const suffix = '... (truncated)';
    sanitized = sanitized.slice(0, maxLen - suffix.length) + suffix;
  }
  return sanitized;
}

/**
 * Format a GitHub REST API error message, appending a Claude Code Remote
 * (CCR) hint on a bare 401 when `CLAUDE_CODE_REMOTE=true` (LS-8740).
 *
 * `ci_retry_runner_flake` (and other tools that call `githubGet`/`githubPost`
 * directly) were observed failing with `GitHub API 401: Bad credentials` in
 * CCR sessions even though `GH_TOKEN`/`GITHUB_TOKEN`/
 * `AGENT_AUTHOR_APP_PRIVATE_KEY` were all present in the environment, while
 * the hosted `legacy-sports-ci` server worked fine for the same repo/PR at
 * the same moment. Root cause: the CCR session's network proxy only injects
 * working GitHub credentials for the pinned `gh` CLI / GitHub-MCP request
 * paths (see AGENTS.md's CCR watch-to-merge guidance and
 * `.agents/skills/cloud-agent-mode/SKILL.md` Quirk 10) — a stdio server's
 * own direct `fetch()` calls to the GitHub REST API fall outside that
 * pinned set, so the credential the environment carries is not honored the
 * same way and GitHub legitimately rejects it. This is a platform/proxy
 * limitation outside this repo's reach; the hint below is a documentation-
 * only mitigation that makes the failure self-diagnosing instead of a bare
 * 401 the caller has to research from scratch.
 *
 * Deliberately scoped to 401 only — other statuses (403 permission errors,
 * 5xx transient errors, etc.) are unrelated to this gap and must not carry
 * the hint, since several callers (`isAlreadyRunningError`,
 * `isTransientServerError`) pattern-match the leading `GitHub API <status>`
 * prefix of this same message and must keep matching unchanged.
 */
export function formatGithubApiError(
  status: number,
  body: string,
  suffix = '',
): string {
  const base = `GitHub API ${status}${suffix}: ${sanitizeErrorBody(body)}`;
  if (status !== 401 || process.env['CLAUDE_CODE_REMOTE'] !== 'true') {
    return base;
  }
  return (
    `${base} — known Claude Code Remote (CCR) gap (LS-8740): the session's network proxy ` +
    'only injects working GitHub credentials for the pinned `gh` CLI / GitHub-MCP request ' +
    "paths; a stdio MCP server's own direct REST calls fall outside that pinned set and can " +
    'be rejected even though GH_TOKEN/GITHUB_TOKEN/AGENT_AUTHOR_APP_PRIVATE_KEY are present. ' +
    'Fall back to the hosted legacy-sports-ci server (e.g. ' +
    'mcp__legacy-sports-ci__ci_retry_failed({ runId })) or a built-in mcp__github__* tool.'
  );
}

/**
 * Fetch a URL with retry-with-backoff on transient gateway errors (502, 503,
 * 504) and on 410 (see RETRIABLE_STATUSES). Up to 3 attempts; honors
 * `retry-after` header; falls back to 2^attempt seconds of exponential
 * backoff.
 *
 * Extracted from github-api.ts so it can be unit-tested without that
 * module's import.meta.url / auth dependencies.
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  logRateLimit: (res: Response, label: string) => void,
  logLabel: string,
): Promise<ArrayBuffer> {
  let lastStatus = 0;
  for (let attempt = 1; attempt <= LOG_BLOB_MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url, options);

    if (res.ok) {
      logRateLimit(res, logLabel);
      return res.arrayBuffer();
    }

    lastStatus = res.status;
    if (
      !RETRIABLE_STATUSES.has(res.status) ||
      attempt === LOG_BLOB_MAX_ATTEMPTS
    ) {
      const body = await res.text();
      const suffix =
        attempt > 1 ? ` (attempt ${attempt}/${LOG_BLOB_MAX_ATTEMPTS})` : '';
      throw new HttpStatusError(
        res.status,
        formatGithubApiError(res.status, body, suffix),
      );
    }

    // Transient error (gateway 5xx, or a not-yet-available log archive on
    // 410) — back off before retrying
    const retryAfter = Number(res.headers.get('retry-after') ?? 0);
    const backoffMs = retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000;
    await new Promise((r) => setTimeout(r, backoffMs));
  }

  // Unreachable but satisfies TypeScript
  throw new HttpStatusError(
    lastStatus,
    `GitHub API ${lastStatus}: log-blob fetch failed after ${LOG_BLOB_MAX_ATTEMPTS} attempts`,
  );
}

const ALREADY_RUNNING_MAX_ATTEMPTS = 2;
const ALREADY_RUNNING_BACKOFF_MS = 8_000;

/**
 * GitHub API error message shape thrown by github-api.ts's githubPost/githubGet
 * (`GitHub API ${status}: ${body}`) for a transient gateway/service error.
 * Mirrors RETRIABLE_STATUSES' 502/503/504 above, scoped to this message
 * format rather than a raw Response so it can be checked from a caught Error.
 */
const TRANSIENT_SERVER_ERROR_STATUS = /^GitHub API (502|503|504)\b/;
const TRANSIENT_SERVER_ERROR_MAX_ATTEMPTS = 3;
const TRANSIENT_SERVER_ERROR_BACKOFF_MS = 2_000;

/**
 * True when a GitHub API error message is a transient gateway/service error
 * (502/503/504) — including the intermittent 503 "Service Unavailable"
 * GitHub Actions' rerun endpoints return on the first 1-3 attempts against
 * some runs, then succeed identically on a bare retry with no changed
 * arguments (LS-9646). Other statuses (4xx, or a message that doesn't match
 * this GitHub API error shape) are not retried here.
 */
export function isTransientServerError(message: string): boolean {
  return TRANSIENT_SERVER_ERROR_STATUS.test(message);
}

/**
 * Runs `attemptFn` (a POST call) with retry-with-backoff when it rejects with
 * either the "already running" 403 race (see isAlreadyRunningError; up to 2
 * attempts, waiting ~8s between them) or a transient 502/503/504 from GitHub
 * (see isTransientServerError; up to 3 attempts, waiting 2s/4s between them,
 * ~6s total, LS-9646). Any other error — including non-matching 403s and
 * non-transient statuses — rethrows immediately, unchanged, on the first
 * attempt.
 *
 * Both budgets are deliberately short: this server runs on a Lambda with a
 * 30s hard timeout (terraform/main/lambda-mcp-ci.tf -> var.lambda_timeout —
 * see the identical constraint documented in wait-run.ts), so a call could
 * otherwise be silently SIGKILLed mid-retry rather than returning a clean
 * response. The already-running race is a run-level status lag behind the
 * per-job status a caller already checked (LS-9647) — when the run is stuck
 * behind slow trailing jobs (cleanup/summarize steps that can take minutes to
 * be scheduled), no in-Lambda retry budget can wait it out; once that short
 * budget is exhausted, the caller (rerun.ts) hands off to the transport-safe
 * bounded-wait pattern (`ci_wait_run`) instead of retrying blindly
 * in-process. The transient-5xx budget is unrelated — it targets GitHub
 * itself returning a "Service Unavailable"-class error on the rerun
 * endpoint, which clears up on a bare retry rather than needing a wait.
 *
 * Takes the attempt as a callback rather than a URL/path so it can wrap
 * github-api.ts's githubPost (which has import.meta.url / auth dependencies
 * that keep github-api.ts itself out of this spec suite) while still being
 * directly unit-testable here with a plain jest.fn().
 */
export async function withRetryOnAlreadyRunning<T>(
  attemptFn: () => Promise<T>,
): Promise<T> {
  const maxAttempts = Math.max(
    ALREADY_RUNNING_MAX_ATTEMPTS,
    TRANSIENT_SERVER_ERROR_MAX_ATTEMPTS,
  );
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await attemptFn();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const alreadyRunning = isAlreadyRunningError(message);
      const transientServerError =
        !alreadyRunning && isTransientServerError(message);
      if (!alreadyRunning && !transientServerError) {
        throw error;
      }

      const limit = alreadyRunning
        ? ALREADY_RUNNING_MAX_ATTEMPTS
        : TRANSIENT_SERVER_ERROR_MAX_ATTEMPTS;
      if (attempt >= limit) {
        throw new Error(
          `${message} (gave up after ${attempt} attempts waiting for ` +
            `${alreadyRunning ? 'the run to settle' : 'GitHub to recover'})`,
        );
      }

      const backoffMs = alreadyRunning
        ? ALREADY_RUNNING_BACKOFF_MS * attempt
        : TRANSIENT_SERVER_ERROR_BACKOFF_MS * attempt;
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  // Unreachable but satisfies TypeScript
  throw new Error(
    `retry loop exited without returning after ${maxAttempts} attempts`,
  );
}
