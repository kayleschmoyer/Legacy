/**
 * Retry an async function with sequential delays between attempts.
 *
 * The function is called up to delays.length + 1 times. Between each failed
 * attempt, execution pauses for the corresponding delay in milliseconds.
 * If all attempts fail, the last error is re-thrown.
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
      if (attempt < delays.length) {
        const wait = delays[attempt];
        process.stderr.write(
          `[reviewer] LLM attempt ${attempt + 1} failed (${err instanceof Error ? err.message : String(err)}), retrying in ${wait / 1000}s\n`,
        );
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    }
  }
  throw lastErr;
}
