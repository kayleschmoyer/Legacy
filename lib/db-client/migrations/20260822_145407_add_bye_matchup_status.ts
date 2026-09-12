import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add 'bye' to the matchup_status enum (LS-6366)
 *
 * A team on bye has no opposing team, so the matchup is conceptually
 * "no game" rather than a normal scheduled -> in_progress -> completed
 * head-to-head. Without a dedicated status, bye matchups were created as
 * 'scheduled' and never advanced, leaving the bye team's score at 0 and the
 * UI showing a misleading LIVE/VS badge with 0.00 vs 0.00.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase generic is untyped across the runner/lambda sandbox boundary
export async function up({ db }: { db: PgDatabase<any> }) {
  await db.execute(
    `ALTER TYPE "public"."matchup_status" ADD VALUE IF NOT EXISTS 'bye'`,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars -- PgDatabase generic is untyped across the runner/lambda sandbox boundary; context is unused because this migration cannot be rolled back
export function down(_context: { db: PgDatabase<any> }) {
  // Cannot remove enum values in PostgreSQL without recreating the type
  // This would require dropping and recreating the column, which is too risky
  throw new Error(
    'Cannot rollback: PostgreSQL does not support removing enum values',
  );
}
