const OAUTH_TIMEOUT_MS = 10_000;
const OAUTH_MAX_RETRIES = 2;

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  const msg = error.message;
  return (
    msg === 'Failed to fetch' ||
    msg === 'NetworkError when attempting to fetch resource.' ||
    msg === 'Network request failed' ||
    msg.startsWith('fetch failed')
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface FetchRetryOptions {
  timeoutMs?: number;
  maxRetries?: number;
  /** Back-off base in ms. Exposed for testing (pass 0 to make retries instant). */
  retryBaseMs?: number;
}

/**
 * Wraps `fetch` with per-attempt timeout and retry logic.
 *
 * Retries on network errors (TypeError) and on timeouts; propagates
 * immediately on caller-side AbortSignal cancellation or any other error.
 * 4xx / 5xx HTTP responses are returned as-is — response-level error
 * classification stays with the caller.
 *
 * Defaults: 10 s timeout, 2 retries (3 total attempts), 500 ms / 1 000 ms
 * back-off between retries.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retryOptions: FetchRetryOptions = {},
): Promise<Response> {
  const {
    timeoutMs = OAUTH_TIMEOUT_MS,
    maxRetries = OAUTH_MAX_RETRIES,
    retryBaseMs = 500,
  } = retryOptions;

  const callerSignal = init.signal;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (callerSignal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const onCallerAbort = (): void => controller.abort();
    callerSignal?.addEventListener('abort', onCallerAbort, { once: true });

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      return response;
    } catch (error) {
      if (callerSignal?.aborted) throw error;

      const isRetriable =
        isNetworkError(error) ||
        (error instanceof DOMException && error.name === 'AbortError');

      if (isRetriable && attempt < maxRetries) {
        lastError = error;
        await sleep(retryBaseMs * Math.pow(2, attempt));
        continue;
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    }
  }

  throw lastError;
}
