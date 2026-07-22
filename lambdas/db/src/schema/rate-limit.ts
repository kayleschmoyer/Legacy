/**
 * Reusable per-user, per-action rate limiter backed by a persisted Postgres
 * counter (`public.rate_limit_counters`).
 *
 * Unlike `lambdas/oauth-proxy/src/util/rate-limit.ts` — an in-memory,
 * per-Lambda-instance bucket that resets on cold start and does not share
 * state across concurrent instances — this counter is correct across the
 * whole fleet: the check-and-increment is a single UPSERT, and Postgres
 * takes a row lock on the conflicting `(bucket, user_id)` key for the
 * duration of the `UPDATE`, so two concurrent invocations for the same user
 * serialize instead of racing (LS-8587 / BTD-003 follow-up).
 */
import { type PublicDb, PublicSchema } from '@legacy-sports/db-client';
import { sql } from 'drizzle-orm';

export interface RateLimitOptions {
  /** Names the rate-limited action, e.g. "invite_assistant_manager". */
  bucket: string;
  /** The user whose attempts are being counted. */
  userId: number;
  /** Maximum attempts allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/**
 * Atomically records one attempt for `(bucket, userId)` and reports whether
 * the caller is within the allowed limit for the current fixed window.
 *
 * Always increments, even when the result is `allowed: false` — callers
 * should treat that as "reject this request", not "retry the check". A
 * fixed window (rather than a sliding one) is intentional: it is simpler to
 * reason about atomically and sufficient for a coarse abuse-prevention
 * control like this one.
 */
export async function checkAndIncrementRateLimit(
  db: PublicDb,
  options: RateLimitOptions,
): Promise<{ allowed: boolean }> {
  const { bucket, userId, limit, windowMs } = options;
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const { rateLimitCounters } = PublicSchema;

  const [row] = await db
    .insert(rateLimitCounters)
    .values({ bucket, userId, attemptCount: 1 })
    .onConflictDoUpdate({
      target: [rateLimitCounters.bucket, rateLimitCounters.userId],
      set: {
        attemptCount: sql`CASE
          WHEN now() - ${rateLimitCounters.windowStart} >= (${windowSeconds} * interval '1 second')
          THEN 1
          ELSE ${rateLimitCounters.attemptCount} + 1
        END`,
        windowStart: sql`CASE
          WHEN now() - ${rateLimitCounters.windowStart} >= (${windowSeconds} * interval '1 second')
          THEN now()
          ELSE ${rateLimitCounters.windowStart}
        END`,
      },
    })
    .returning({ attemptCount: rateLimitCounters.attemptCount });

  return { allowed: row.attemptCount <= limit };
}
