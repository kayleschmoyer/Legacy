import { githubGet } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface WaitForRunParams {
  runId: number;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

interface GitHubWorkflowRun {
  id: number;
  status: string;
  conclusion: string | null;
  name: string;
  head_branch: string;
  html_url: string;
  updated_at: string;
}

/** Returns true for errors that are transient and safe to retry. */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    // AbortError comes from the per-request timeout signal
    if (error.name === 'AbortError') return true;
    // Network-level errors (ECONNRESET, ENOTFOUND, etc.)
    if (
      error.message.includes('fetch failed') ||
      error.message.includes('ECONNRESET') ||
      error.message.includes('ENOTFOUND') ||
      error.message.includes('network')
    ) {
      return true;
    }
  }
  return false;
}

/** Returns true when the error message contains a rate-limit signal. */
function hasRateLimitSignal(message: string): boolean {
  return /rate.?limit/i.test(message);
}

/**
 * Returns true for HTTP status codes that are retryable (429, 5xx).
 * 403 is also retryable when the error message indicates rate limiting
 * (GitHub uses 403 for secondary/API rate limits, not just permission errors).
 */
function isRetryableStatus(status: number, message = ''): boolean {
  if (status === 403 && hasRateLimitSignal(message)) return true;
  return status === 429 || status >= 500;
}

/**
 * Returns true for non-retryable HTTP errors (401, 404).
 * 403 is only non-retryable when the message does NOT indicate rate limiting —
 * a plain 403 Forbidden (auth/permission error) will not resolve with retries.
 */
function isNonRetryableStatus(status: number, message = ''): boolean {
  if (status === 403) return !hasRateLimitSignal(message);
  return status === 401 || status === 404;
}

export async function waitForRun(
  params: WaitForRunParams,
): Promise<ToolResult> {
  const {
    runId,
    timeoutMs = 600_000, // default: 10 minutes (schema enforces min/max)
    pollIntervalMs = 15_000, // default: 15 seconds (schema enforces min/max)
  } = params;

  // Schema already enforces min(30_000)/max(1_800_000) for timeoutMs and
  // min(5_000)/max(120_000) for pollIntervalMs — trust those validated values.
  const effectivePollInterval = pollIntervalMs;
  const effectiveTimeout = timeoutMs;

  const startTime = Date.now();
  let lastStatus = '';
  let pollCount = 0;
  let lastError: string | undefined;

  while (true) {
    const elapsed = Date.now() - startTime;
    if (elapsed >= effectiveTimeout) {
      const timeoutMsg = `Timed out waiting for run ${runId} after ${elapsed}ms. Last status: ${lastStatus}. Poll count: ${pollCount}`;
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: lastError
              ? `${timeoutMsg}. Last error: ${lastError}`
              : timeoutMsg,
          },
        ],
      };
    }

    try {
      const remaining = effectiveTimeout - (Date.now() - startTime);
      const controller = new AbortController();
      const requestTimeoutId = setTimeout(
        () => controller.abort(),
        Math.min(30_000, remaining),
      );
      let run: GitHubWorkflowRun;
      try {
        run = await githubGet<GitHubWorkflowRun>(
          `/actions/runs/${runId}`,
          undefined,
          { signal: controller.signal },
        );
      } finally {
        clearTimeout(requestTimeoutId);
      }
      lastStatus = run.status;
      lastError = undefined;
      pollCount++;

      if (run.status === 'completed') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  ok: true,
                  runId: run.id,
                  status: run.status,
                  conclusion: run.conclusion,
                  name: run.name,
                  branch: run.head_branch,
                  url: run.html_url,
                  elapsed: Date.now() - startTime,
                  pollCount,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // Wait before next poll, capped to remaining timeout.
      const pollRemaining = effectiveTimeout - (Date.now() - startTime);
      const sleepMs = Math.min(
        effectivePollInterval,
        Math.max(0, pollRemaining),
      );
      await new Promise((r) => setTimeout(r, sleepMs));
    } catch (error) {
      // Parse the HTTP status from the error message — githubGet throws a plain Error
      // with a message in the format "GitHub API <status>: ..." (no status property).
      const message = error instanceof Error ? error.message : String(error);
      const httpStatusMatch = message.match(/GitHub API (\d+):/);
      const httpStatus = httpStatusMatch
        ? parseInt(httpStatusMatch[1], 10)
        : undefined;

      const errorMsg = message;

      // Non-retryable HTTP errors (401 Unauthorized, 404 Not Found, and 403 when
      // it is a real permission/forbidden error rather than a rate-limit response):
      // these will not resolve with retries, so fail fast.
      if (
        httpStatus !== undefined &&
        isNonRetryableStatus(httpStatus, errorMsg)
      ) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to poll run ${runId}: ${errorMsg} (HTTP ${httpStatus}). Elapsed: ${Date.now() - startTime}ms, lastStatus: ${lastStatus}`,
            },
          ],
        };
      }

      // Retryable: network errors, AbortError (per-request timeout), 429, 5xx,
      // and 403 when the message signals a rate limit.
      // Record the error and continue polling until the overall timeout.
      if (
        isRetryableError(error) ||
        (httpStatus !== undefined && isRetryableStatus(httpStatus, errorMsg))
      ) {
        lastError = errorMsg;
        const remaining = effectiveTimeout - (Date.now() - startTime);
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.min(effectivePollInterval, Math.max(0, remaining)),
          ),
        );
        continue;
      }

      // Unrecognised HTTP status (not retryable, not non-retryable): fail fast
      // and include the status code so the caller can see what happened.
      if (httpStatus !== undefined) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to poll run ${runId}: ${errorMsg} (HTTP ${httpStatus}). Elapsed: ${Date.now() - startTime}ms, lastStatus: ${lastStatus}`,
            },
          ],
        };
      }

      // Non-retryable errors without an HTTP status (missing GITHUB_TOKEN,
      // auth failure, repo-slug parse error, or other local config/programming
      // errors): fail fast — retrying for up to 10 minutes would just hide the
      // real failure.
      if (!isRetryableError(error)) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to poll run ${runId}: ${errorMsg}. Elapsed: ${Date.now() - startTime}ms, lastStatus: ${lastStatus}`,
            },
          ],
        };
      }

      // Transient network error with no HTTP status — wait and retry.
      lastError = errorMsg;
      const unknownRemaining = effectiveTimeout - (Date.now() - startTime);
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.min(effectivePollInterval, Math.max(0, unknownRemaining)),
        ),
      );
      continue;
    }
  }
}
