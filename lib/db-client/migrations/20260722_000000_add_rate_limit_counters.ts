/**
 * Migration: Add public.rate_limit_counters table (LS-8587 / BTD-003 follow-up)
 *
 * inviteAssistantManager had no volume-based rate limit on invite attempts.
 * LS-6026 unified the per-failure-mode error messages so a probe can no
 * longer enumerate usernames by comparing response text, but did nothing to
 * stop enumeration by sheer volume of attempts. The only rate limiter in the
 * repo, lambdas/oauth-proxy/src/util/rate-limit.ts, is an in-memory
 * per-Lambda-instance bucket that resets on cold start and does not share
 * state across concurrent instances — not sufficient for a per-user limit
 * that must hold across the whole fleet.
 *
 * This table backs a generic, persisted, fixed-window per-(bucket, user)
 * counter so future rate-limited mutations can reuse it without another
 * migration. See lambdas/db/src/schema/rate-limit.ts for the atomic
 * check-and-increment helper — a single UPSERT is sufficient for
 * concurrency-correctness here because Postgres takes a row lock on the
 * conflicting (bucket, user_id) key for the duration of the UPDATE, so two
 * concurrent invocations for the same user serialize instead of racing.
 *
 * Uses raw postgres.js tagged-template sql from MigrationContext (no
 * drizzle-orm import) so this migration runs correctly in both the local
 * runner and the hosted db-admin Lambda sandbox.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- MigrationContext's sql tag is untyped across runner/lambda sandbox boundaries
export const up = async ({ sql }: { sql: any }): Promise<void> => {
  await sql`
    CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
      id             SERIAL PRIMARY KEY,
      bucket         VARCHAR(100) NOT NULL,
      user_id        INTEGER NOT NULL,
      window_start   TIMESTAMPTZ NOT NULL DEFAULT now(),
      attempt_count  INTEGER NOT NULL DEFAULT 1,

      CONSTRAINT rate_limit_counters_bucket_user_id_uk UNIQUE (bucket, user_id)
    )
  `;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- MigrationContext's sql tag is untyped across runner/lambda sandbox boundaries
export const down = async ({ sql }: { sql: any }): Promise<void> => {
  await sql`
    DROP TABLE IF EXISTS public.rate_limit_counters
  `;
};
