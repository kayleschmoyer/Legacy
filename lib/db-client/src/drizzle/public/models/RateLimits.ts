import {
  integer,
  pgTable,
  serial,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * rate_limit_counters — generic per-user, per-action fixed-window rate limiter.
 *
 * Backs server-side rate limits that must stay correct across concurrent
 * Lambda instances. An in-memory counter (e.g.
 * lambdas/oauth-proxy/src/util/rate-limit.ts) resets per cold start / per
 * instance and cannot enforce a shared per-user budget — this table can.
 *
 * One row per (bucket, user_id); `bucket` names the action being limited
 * (e.g. "invite_assistant_manager") so future rate-limited mutations can
 * reuse this table without another migration. See
 * lambdas/db/src/schema/rate-limit.ts for the atomic check-and-increment
 * helper that reads/writes this table.
 */
export const rateLimitCounters = pgTable(
  'rate_limit_counters',
  {
    id: serial('id').primaryKey().notNull(),
    /** Identifies the rate-limited action, e.g. "invite_assistant_manager" */
    bucket: varchar('bucket', { length: 100 }).notNull(),
    /** The user whose attempts are being counted */
    userId: integer('user_id').notNull(),
    /** Start of the current fixed window */
    windowStart: timestamp('window_start', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Attempts recorded within the current window */
    attemptCount: integer('attempt_count').notNull().default(1),
  },
  (table) => ({
    bucketUserUk: unique('rate_limit_counters_bucket_user_id_uk').on(
      table.bucket,
      table.userId,
    ),
  }),
);
