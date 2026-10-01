/**
 * In-process retry for transient Postgres failures (LS-10315).
 *
 * The draft-processor's only other recovery path for a failed draft-status
 * write is resetting the league to 'not-started' and reporting a batch-item
 * failure, which waits out the automatic-drafts queue's visibility timeout
 * (minutes) before SQS redelivers. A deadlock or serialization failure almost
 * always succeeds on an immediate retry, so absorb those here instead.
 *
 * Mirrors `withTransientRetry` in lambdas/db (delete-resilience.ts), which this
 * lambda cannot import.
 */

/**
 * SQLSTATEs worth retrying: deadlock detected, serialization failure.
 * Anything else (constraint violations, missing rows, auth) is a real failure
 * and must surface on the first attempt.
 */
export const TRANSIENT_PG_CODES: ReadonlySet<string> = new Set([
  '40P01',
  '40001',
]);

/**
 * Read the SQLSTATE from a (possibly Drizzle-wrapped) error. Drizzle's
 * `DrizzleQueryError` keeps the driver error — which carries `code` — in
 * `cause`; a driver error thrown directly carries `code` itself.
 */
export function getPgErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const cause = (error as { cause?: unknown }).cause;
  const source =
    cause && typeof cause === 'object'
      ? (cause as { code?: unknown })
      : (error as { code?: unknown });
  return typeof source.code === 'string' ? source.code : undefined;
}

export function isTransientPgError(error: unknown): boolean {
  return TRANSIENT_PG_CODES.has(getPgErrorCode(error) ?? '');
}

export interface TransientDbRetryOptions {
  /** Max attempts including the first try. Default 3. */
  maxAttempts?: number;
  /** Called before each retry (not before the first attempt). */
  onRetry?: (attempt: number, error: unknown) => void;
  /** Backoff before retry `n` (1-based). Injectable for tests. */
  delay?: (attempt: number) => Promise<void>;
}

/**
 * 50ms * attempt plus up to 50ms of jitter, so two transactions that just
 * deadlocked each other don't retry in lockstep and collide again.
 */
const jitteredDelay = (attempt: number): Promise<void> =>
  new Promise((resolve) =>
    setTimeout(resolve, 50 * attempt + Math.floor(Math.random() * 50)),
  );

/**
 * Run `op`, retrying only on transient Postgres errors. Non-transient errors
 * and the final attempt's error are rethrown unchanged.
 */
export async function withTransientDbRetry<T>(
  op: () => Promise<T>,
  options: TransientDbRetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const delay = options.delay ?? jitteredDelay;
  for (let attempt = 1; ; attempt++) {
    try {
      return await op();
    } catch (error) {
      if (attempt >= maxAttempts || !isTransientPgError(error)) throw error;
      options.onRetry?.(attempt, error);
      await delay(attempt);
    }
  }
}
