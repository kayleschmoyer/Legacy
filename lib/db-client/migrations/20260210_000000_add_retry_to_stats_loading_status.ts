import type { PgDatabase } from 'drizzle-orm/pg-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up({ db }: { db: PgDatabase<any> }) {
  await db.execute(
    `ALTER TYPE "public"."stats_loading_status" ADD VALUE IF NOT EXISTS 'retry'`,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
export function down(_context: { db: PgDatabase<any> }) {
  // Cannot remove enum values in PostgreSQL without recreating the type
  // This would require dropping and recreating the column, which is too risky
  throw new Error(
    'Cannot rollback: PostgreSQL does not support removing enum values',
  );
}
