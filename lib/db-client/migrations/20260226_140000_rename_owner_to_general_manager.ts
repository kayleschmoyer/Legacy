import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Rename 'owner' permission level to 'general_manager', add 'assistant_manager'
 *
 * Purpose:
 * - Move away from "Owner" verbiage toward "General Manager" / "Assistant Manager"
 *   for the role previously called "owner" in league_permission_level.
 * - Preserves all existing data: every row that had permission_level = 'owner'
 *   will now have permission_level = 'general_manager'.
 *
 * Changes:
 * - Renames enum value 'owner' → 'general_manager' in league_permission_level
 * - Adds new enum value 'assistant_manager' to league_permission_level
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // Rename the existing 'owner' enum value to 'general_manager'
  await db.execute(`
    ALTER TYPE "public"."league_permission_level" RENAME VALUE 'owner' TO 'general_manager';
  `);

  // Add the new 'assistant_manager' enum value
  await db.execute(`
    ALTER TYPE "public"."league_permission_level" ADD VALUE IF NOT EXISTS 'assistant_manager';
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  // Note: PostgreSQL does not support removing enum values, so we can only
  // rename 'general_manager' back to 'owner'. 'assistant_manager' cannot be removed.
  await db.execute(`
    ALTER TYPE "public"."league_permission_level" RENAME VALUE 'general_manager' TO 'owner';
  `);
};
