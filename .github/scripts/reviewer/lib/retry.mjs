// Upper bound on the random jitter added on top of each base wait, as a
// fraction of that wait (e.g. 0.3 → wait is stretched by up to +30%). Jitter
// is what stops a fleet of concurrent runs that all hit the per-minute quota
// in the same second from re-colliding on their retries (LS-9568).
const JITTER_FACTOR = 0.3;

/**
 * Default ladder for every failure kind except `rate-limit`. Unchanged from
 * the original behaviour: three retries totalling 6.5 minutes of base wait.
 */
export const DEFAULT_DELAYS = Object.freeze([30_000, 90_000, 270_000]);

/**
 * Ladder used when the provider error is a per-minute throttle
 * (`kind === 'rate-limit'`). LS-9983: under repo-wide saturation the default
 * 6.5-minute ladder is far too short — 20 concurrent PRs × 4 multi-pass
 * requests against a 10 RPM quota needs on the order of 8 minutes of pure
 * quota time before contention even begins to clear, so every run burned its
 * three retries and failed terminally, handing the retry job to an Author
 * Agent whose label re-apply then consumed quota the other PRs needed.
 *
 * Seven retries, ~20.5 minutes of base wait. The reviewer never actually
 * sleeps the full ladder unless the job's retry budget allows it — see the
 * `deadlineMs` option on `withRetry`, which stops the ladder early so the run
 * always has time left to write a terminal `bot-review` status (the LS-8299 /
 * LS-9209 invariant) instead of being killed by the workflow timeout.
 */
export const RATE_LIMIT_DELAYS = Object.freeze([
  30_000, 60_000, 120_000, 180_000, 240_000, 300_000, 300_000,
]);

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
 * Spread a rate-limit wait uniformly across [0.5×, 1.5×) of its base rather
 * than only stretching it upward (LS-9983).
 *
 * One-sided +0..30% jitter keeps a saturated fleet bunched: every run that
 * collided in the same second still retries inside the same narrow window and
 * re-collides. Centring the jitter on the base wait de-correlates the fleet
 * across a window as wide as the wait itself while leaving the *mean* wait
 * unchanged, so the ladder's total budget is not inflated.
 *
 * @param {number} ms
 * @returns {number}
 */
function addFullJitter(ms) {
  if (ms <= 0) return ms;
  return Math.floor(ms * (0.5 + Math.random()));
}

/**
 * Pick the retry ladder for a given error. Only per-minute throttles get the
 * extended ladder; everything else keeps the caller-supplied default so an
 * unrelated transient failure can't hold a runner for 20 minutes.
 *
 * @param {unknown} err
 * @param {readonly number[]} defaultDelays
 * @param {readonly number[]} rateLimitDelays
 * @returns {readonly number[]}
 */
function delaysForError(err, defaultDelays, rateLimitDelays) {
  return err && err.kind === 'rate-limit' ? rateLimitDelays : defaultDelays;
}

/**
 * Retry an async function with sequential delays between attempts.
 *
 * The ladder is selected per-error: `rate-limit` errors use
 * `RATE_LIMIT_DELAYS`, everything else uses `delays`. Between each failed
 * attempt execution pauses for the corresponding delay in milliseconds, plus
 * jitter (see `addJitter` / `addFullJitter`). If all attempts fail, the last
 * error is re-thrown.
 *
 * Errors with `retryable === false` short-circuit the loop and re-throw
 * immediately — used by typed provider errors (auth, daily quota, billing,
 * invalid request) where retrying can never recover.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @param {readonly number[]} [delays]  Millisecond pauses between attempts for
 *   non-rate-limit errors (default: 30s, 90s, 270s)
 * @param {object} [opts]
 * @param {readonly number[]} [opts.rateLimitDelays]  Ladder used for
 *   `kind === 'rate-limit'` errors (default: `RATE_LIMIT_DELAYS`). Overridable
 *   so tests can exercise the extended ladder without sleeping for real.
 * @param {number} [opts.deadlineMs]  Epoch-ms wall-clock deadline. A retry is
 *   skipped — and the last error re-thrown with `budgetExhausted = true` — when
 *   the wait would run past it. Guarantees the caller keeps enough of the job's
 *   timeout to write a terminal status.
 * @param {(info: { attempt: number, maxAttempts: number, waitMs: number, kind: string|null, err: unknown }) => void} [opts.onWait]
 *   Called immediately before each sleep. Errors thrown by the callback are
 *   swallowed — publishing progress must never break the retry ladder.
 * @param {(ms: number) => Promise<void>} [opts.sleep]  Sleep implementation.
 *   Test seam so the ladder's real arithmetic can be exercised against a
 *   virtual clock instead of real timers; defaults to `setTimeout`.
 * @returns {Promise<T>}
 */
export async function withRetry(fn, delays = DEFAULT_DELAYS, opts = {}) {
  const {
    deadlineMs,
    onWait,
    rateLimitDelays = RATE_LIMIT_DELAYS,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = opts;
  let lastErr;
  // The loop's real exits are: success, a non-retryable error, a ladder run to
  // its end, or the deadline. MAX_ATTEMPTS is a backstop so a caller-supplied
  // `rateLimitDelays` can never turn this into an unbounded loop in CI.
  const maxAttempts = Math.max(delays.length, rateLimitDelays.length) + 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
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
      const activeDelays = delaysForError(err, delays, rateLimitDelays);
      if (attempt >= activeDelays.length) break;

      const isRateLimit = Boolean(err && err.kind === 'rate-limit');
      const retryAfterMs =
        err && typeof err.retryAfterSeconds === 'number'
          ? Math.ceil(err.retryAfterSeconds * 1000)
          : 0;
      const base = Math.max(activeDelays[attempt], retryAfterMs);
      const wait = isRateLimit ? addFullJitter(base) : addJitter(base);

      if (typeof deadlineMs === 'number' && Date.now() + wait > deadlineMs) {
        const remainingSec = Math.max(
          0,
          Math.round((deadlineMs - Date.now()) / 1000),
        );
        process.stderr.write(
          `[reviewer] LLM attempt ${attempt + 1} failed (${err instanceof Error ? err.message : String(err)}); next wait of ${Math.round(wait / 1000)}s exceeds the remaining ${remainingSec}s retry budget — stopping so a terminal status can be written\n`,
        );
        if (lastErr && typeof lastErr === 'object') {
          // Best-effort marker for the caller; a frozen/sealed provider error
          // must not turn a throttle into a crash.
          try {
            lastErr.budgetExhausted = true;
          } catch {
            process.stderr.write(
              '[reviewer] Could not mark the error as budgetExhausted (non-writable)\n',
            );
          }
        }
        break;
      }

      if (onWait) {
        try {
          onWait({
            attempt: attempt + 1,
            maxAttempts: activeDelays.length + 1,
            waitMs: wait,
            kind: err && typeof err.kind === 'string' ? err.kind : null,
            err,
          });
        } catch (cbErr) {
          process.stderr.write(
            `[reviewer] onWait callback failed (non-fatal): ${cbErr instanceof Error ? cbErr.message : String(cbErr)}\n`,
          );
        }
      }

      process.stderr.write(
        `[reviewer] LLM attempt ${attempt + 1} failed (${err instanceof Error ? err.message : String(err)}), retrying in ${wait / 1000}s\n`,
      );
      await sleep(wait);
    }
  }
  throw lastErr;
}
