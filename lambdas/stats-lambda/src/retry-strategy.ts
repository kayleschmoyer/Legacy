/**
 * Check if an error is a retryable Baseball-Reference error (timeout, rate limit, or overload).
 * Rate limit (429) and overload (529) errors should be retried after SQS visibility timeout delay.
 */
export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const errorMessage = error.message.toLowerCase();

  // Check for HTTP 429 (Too Many Requests) or 529 (Site Overloaded)
  const isRateLimited =
    errorMessage.includes('status code 429') ||
    errorMessage.includes('status code 529');

  // Check for HTTP 504 (Gateway Timeout) or 524 (Cloudflare timeout)
  const isTimeoutStatus =
    errorMessage.includes('status code 504') ||
    errorMessage.includes('status code 524');

  // Also check for generic timeout messages
  const isTimeoutMessage =
    errorMessage.includes('timeout') || errorMessage.includes('timed out');

  return isRateLimited || isTimeoutStatus || isTimeoutMessage;
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
