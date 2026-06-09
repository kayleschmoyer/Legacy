/**
 * Retry-with-exponential-backoff for live-backend calls (LS-7866).
 *
 * The integration suite hits a real, rate-limited backend (api.legacy-fantasy.com
 * GraphQL + the oauth-proxy auth routes). Under concurrent shard load the live
 * backend returns HTTP 429 ("Too many requests"), which previously surfaced as
 * opaque spec failures ("Failed to fetch", "null teamId"). Prior fixes covered
 * only the auth path (LS-4796/LS-4940) and one Playwright-context helper, leaving
 * the dominant GraphQL surface (`gqlFetch` → raw `fetch`) with no retry at all.
 *
 * This module is the single source of truth for 429 backoff across EVERY live
 * call site:
 *   - `fetchWithBackoff` — drop-in `fetch` wrapper (GraphQL helpers, auth/token
 *     mint, global setup/teardown cleanup, google-oauth smoke tests).
 *   - `retryWithBackoff` — generic core for non-`fetch` responses (Playwright's
 *     `APIRequestContext`, whose `APIResponse` exposes `.status()`/`.headers()`).
 *   - `parseRetryAfterMs` / `computeBackoffMs` — exported pure functions, unit
 *     tested in `src/integration/retry-with-backoff.test.ts`.
 *
 * The backoff honours the server's `Retry-After` header when present (the
 * oauth-proxy rate limiter sets it — see `lambdas/oauth-proxy/src/util/
 * rate-limit.ts`), falling back to exponential backoff with full jitter when it
 * is absent (API Gateway throttling does not always emit it).
 */

export interface BackoffOptions {
  /** Total attempts including the first. Default 6. */
  maxAttempts?: number;
  /** Base delay for the exponential schedule (ms). Default 500. */
  baseDelayMs?: number;
  /** Ceiling for a single exponential backoff wait (ms). Default 32_000. */
  maxDelayMs?: number;
  /**
   * Hard ceiling applied to a server-supplied `Retry-After` (ms). Prevents a
   * pathological lockout response (e.g. the 300 s account-lock window) from
   * blocking a worker past the spec timeout. Default 60_000 — one oauth-proxy
   * rate-limit window.
   */
  maxRetryAfterMs?: number;
  /** Retry when a thrown error looks like a transient network failure. Default true. */
  retryOnNetworkError?: boolean;
  /** Human-readable label for diagnostics. */
  label?: string;
  /** Injectable sleeper (unit tests). Default real `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable jitter source in `[0, 1)` (unit tests). Default `Math.random`. */
  jitter?: () => number;
  /** Injectable `fetch` (unit tests). Default the global `fetch`. */
  fetchImpl?: typeof fetch;
}

/**
 * Status codes that always indicate a transient throttle worth retrying. `5xx`
 * (transient gateway/Lambda errors) are retried in addition to these — see
 * `fetchWithBackoff` — so the list only needs the non-5xx throttle code.
 */
const DEFAULT_RETRY_STATUSES: readonly number[] = [429];

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse an HTTP `Retry-After` header value into milliseconds.
 *
 * Accepts both forms from RFC 9110: delta-seconds (`"60"`) and an HTTP-date
 * (`"Wed, 21 Oct 2026 07:28:00 GMT"`). Returns `undefined` when the value is
 * absent or unparseable, so callers fall through to exponential backoff. A
 * past HTTP-date clamps to `0` (retry immediately).
 */
export function parseRetryAfterMs(
  value: string | null | undefined,
  nowMs: number = Date.now(),
): number | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;

  // delta-seconds form (a bare non-negative integer/decimal).
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Math.round(Number(trimmed) * 1000);
  }

  // HTTP-date form.
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - nowMs);
  }

  return undefined;
}

/**
 * Compute the wait before the next attempt.
 *
 * - When the server supplied a `Retry-After` (`retryAfterMs`), honour it,
 *   clamped to `maxRetryAfterMs`.
 * - Otherwise use exponential backoff (`base * 2^(attempt-1)`) capped at
 *   `maxDelayMs`, with full jitter so concurrent workers de-correlate their
 *   retries instead of stampeding the backend in lockstep.
 *
 * `attempt` is 1-based (the wait computed after attempt N, before attempt N+1).
 */
export function computeBackoffMs(
  attempt: number,
  retryAfterMs: number | undefined,
  options: BackoffOptions = {},
): number {
  const {
    baseDelayMs = 500,
    maxDelayMs = 32_000,
    maxRetryAfterMs = 60_000,
    jitter = Math.random,
  } = options;

  if (retryAfterMs !== undefined && retryAfterMs >= 0) {
    return Math.min(retryAfterMs, maxRetryAfterMs);
  }

  const exponential = baseDelayMs * Math.pow(2, Math.max(0, attempt - 1));
  const capped = Math.min(exponential, maxDelayMs);
  // Full jitter: a uniform random wait in [0, capped]. Averages capped/2 while
  // guaranteeing the cap is never exceeded.
  return Math.round(capped * jitter());
}

export interface RetryDecision {
  /** Should this result be retried? */
  retry: boolean;
  /** `Retry-After` parsed from the result, in ms, if any. */
  retryAfterMs?: number;
}

/**
 * Generic retry-with-backoff core. Runs `perform` up to `maxAttempts` times,
 * consulting `classify` after each success to decide whether to retry, and
 * retrying transient network errors thrown by `perform`. Returns the last
 * result (retried or not); re-throws the last error if every attempt threw.
 */
export async function retryWithBackoff<R>(
  perform: (attempt: number) => Promise<R>,
  classify: (result: R) => RetryDecision,
  options: BackoffOptions = {},
): Promise<R> {
  const {
    maxAttempts = 6,
    retryOnNetworkError = true,
    sleep = defaultSleep,
  } = options;

  let lastResult!: R;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      lastResult = await perform(attempt);
    } catch (err) {
      // An aborted request (caller-supplied AbortSignal hit its budget — e.g.
      // the best-effort autoProcess nudge) must fail fast, never retry.
      const aborted = err instanceof Error && err.name === 'AbortError';
      if (!aborted && retryOnNetworkError && attempt < maxAttempts) {
        await sleep(computeBackoffMs(attempt, undefined, options));
        continue;
      }
      throw err;
    }

    const decision = classify(lastResult);
    if (!decision.retry || attempt === maxAttempts) {
      return lastResult;
    }
    await sleep(computeBackoffMs(attempt, decision.retryAfterMs, options));
  }
  return lastResult;
}

/**
 * `fetch` wrapper that retries on HTTP 429, any 5xx (transient gateway/Lambda
 * errors), and transient network errors, with exponential backoff honouring
 * `Retry-After`. This matches the Playwright `graphql()` helper's retry policy.
 * All other status codes (2xx, 4xx) are returned to the caller unchanged on the
 * first response — this never throws on an HTTP status, only on a network error
 * that survives every retry. Pass `retryStatuses` to override the non-5xx set.
 */
export async function fetchWithBackoff(
  url: string,
  init: RequestInit = {},
  options: BackoffOptions & { retryStatuses?: readonly number[] } = {},
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const retryStatuses = options.retryStatuses ?? DEFAULT_RETRY_STATUSES;

  return retryWithBackoff(
    () => fetchImpl(url, init),
    (res) => ({
      retry: retryStatuses.includes(res.status) || res.status >= 500,
      retryAfterMs: parseRetryAfterMs(res.headers.get('retry-after')),
    }),
    options,
  );
}
