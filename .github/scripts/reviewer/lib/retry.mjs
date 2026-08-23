// Upper bound on the random jitter added on top of each base wait, as a
// fraction of that wait (e.g. 0.3 → wait is stretched by up to +30%). Jitter
// is what stops a fleet of concurrent runs that all hit the per-minute quota
// in the same second from re-colliding on their retries (LS-9568).
const JITTER_FACTOR = 0.3;

/**
 * Add a random amount of jitter (0 to `JITTER_FACTOR` × ms) on top of a base
 * wait so concurrent callers don't retry in lockstep.
 *
 * @param {number} ms
 * @returns {number}
 */
function addJitter(ms) {
  if (ms <= 0) return ms;
  return ms + Math.floor(Math.random() * ms * JITTER_FACTOR);
}

/**
 * Retry an async function with sequential delays between attempts.
 *
 * The function is called up to delays.length + 1 times. Between each failed
 * attempt, execution pauses for the corresponding delay in milliseconds, plus
 * jitter (see `addJitter`). If all attempts fail, the last error is re-thrown.
 *
 * Errors with `retryable === false` short-circuit the loop and re-throw
 * immediately — used by typed provider errors (auth, daily quota, invalid
 * request) where retrying can never recover.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @param {number[]} [delays]  Millisecond pauses between attempts (default: 30s, 90s, 270s)
 * @returns {Promise<T>}
 */
export async function withRetry(fn, delays = [30_000, 90_000, 270_000]) {
  let lastErr;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (err && err.retryable === false) {
        process.stderr.write(
          `[reviewer] LLM attempt ${attempt + 1} failed with non-retryable error (${err instanceof Error ? err.message : String(err)}); skipping retries\n`,
        );
        throw err;
      }
      if (attempt < delays.length) {
        const retryAfterMs =
          err && typeof err.retryAfterSeconds === 'number'
            ? Math.ceil(err.retryAfterSeconds * 1000)
            : 0;
        const wait = addJitter(Math.max(delays[attempt], retryAfterMs));
        process.stderr.write(
          `[reviewer] LLM attempt ${attempt + 1} failed (${err instanceof Error ? err.message : String(err)}), retrying in ${wait / 1000}s\n`,
        );
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    }
  }
  throw lastErr;
}
