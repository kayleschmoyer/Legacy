/**
 * Check if an error is a retryable Baseball-Reference error (timeout, rate limit,
 * overload, or any 5xx server error). 5xx responses (500, 502, 503, 504, 524, 529,
 * etc.) indicate an upstream failure on Baseball-Reference's end, not a problem with
 * the request itself, so they should always be retried rather than immediately
 * marking the player's stats load as permanently failed.
 */
export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const errorMessage = error.message.toLowerCase();

  // Check for any HTTP 5xx server error (500-599), including 429/529 (rate limit /
  // overload) which are handled explicitly below, and 500/502/503/504/524 (server
  // errors / gateway timeouts).
  const isRateLimited =
    errorMessage.includes('status code 429') ||
    errorMessage.includes('status code 529');

  const isServerError = /status code 5\d\d/.test(errorMessage);

  // Also check for generic timeout messages
  const isTimeoutMessage =
    errorMessage.includes('timeout') || errorMessage.includes('timed out');

  return isRateLimited || isServerError || isTimeoutMessage;
}

/**
 * Check if an error is specifically a rate limit or overload error (429/529).
 * Used to abort remaining players in a batch early (no point hitting an overloaded service).
 */
export function isRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return msg.includes('status code 429') || msg.includes('status code 529');
}
