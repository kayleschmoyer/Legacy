const TRANSIENT_5XX = new Set([502, 503, 504]);
const LOG_BLOB_MAX_ATTEMPTS = 3;

const ALREADY_RUNNING_STATUS = /^GitHub API 403\b/;
const ALREADY_RUNNING_TEXT = /already running|already in progress/i;

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
 * Fetch a URL with retry-with-backoff on transient 5xx gateway errors
 * (502, 503, 504). Up to 3 attempts; honors `retry-after` header; falls
 * back to 2^attempt seconds of exponential backoff.
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
    if (!TRANSIENT_5XX.has(res.status) || attempt === LOG_BLOB_MAX_ATTEMPTS) {
      const body = await res.text();
      const suffix =
        attempt > 1 ? ` (attempt ${attempt}/${LOG_BLOB_MAX_ATTEMPTS})` : '';
      throw new Error(
        `GitHub API ${res.status}${suffix}: ${sanitizeErrorBody(body)}`,
      );
    }

    // Transient gateway error — back off before retrying
    const retryAfter = Number(res.headers.get('retry-after') ?? 0);
    const backoffMs = retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000;
    await new Promise((r) => setTimeout(r, backoffMs));
  }

  // Unreachable but satisfies TypeScript
  throw new Error(
    `GitHub API ${lastStatus}: log-blob fetch failed after ${LOG_BLOB_MAX_ATTEMPTS} attempts`,
  );
}

const ALREADY_RUNNING_MAX_ATTEMPTS = 3;
const ALREADY_RUNNING_BACKOFF_MS = 10_000;

/**
 * Runs `attemptFn` (a POST call) with retry-with-backoff when it rejects with
 * the "already running" 403 race (see isAlreadyRunningError). Up to 3
 * attempts, waiting 10s/20s between them (~30s total). Any other error —
 * including non-matching 403s — rethrows immediately, unchanged.
 *
 * Takes the attempt as a callback rather than a URL/path so it can wrap
 * github-api.ts's githubPost (which has import.meta.url / auth dependencies
 * that keep github-api.ts itself out of this spec suite) while still being
 * directly unit-testable here with a plain jest.fn().
 */
export async function withRetryOnAlreadyRunning<T>(
  attemptFn: () => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= ALREADY_RUNNING_MAX_ATTEMPTS; attempt++) {
    try {
      return await attemptFn();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!isAlreadyRunningError(message)) {
        throw error;
      }
      if (attempt === ALREADY_RUNNING_MAX_ATTEMPTS) {
        throw new Error(
          `${message} (gave up after ${attempt} attempts waiting for the run to settle)`,
        );
      }
      await new Promise((r) =>
        setTimeout(r, ALREADY_RUNNING_BACKOFF_MS * attempt),
      );
    }
  }

  // Unreachable but satisfies TypeScript
  throw new Error(
    `already-running retry loop exited without returning after ${ALREADY_RUNNING_MAX_ATTEMPTS} attempts`,
  );
}
