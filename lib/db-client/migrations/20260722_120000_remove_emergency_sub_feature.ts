import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Remove the emergency-substitution feature (LS-8609, epic LS-8604)
 *
 * Purpose:
 * - Emergency substitutions exist in live fantasy sports because players become
 *   unavailable mid-week through injury or rest. Legacy Sports is a
 *   historical-data platform where that can never happen, so the entire
 *   mechanism is injury-derived and is being removed (epic LS-8604).
 * - roster_lock_rules has zero rows and the only code consumers
 *   (canMakeRosterMove / upsertRosterLockRules) have no callers, so no data
 *   remap is needed.
 * - The one non-injury enum value ('commissioner_approval') duplicated the
 *   commissioner_can_override column on the same table.
 *
 * Changes:
 * - DROP COLUMN roster_lock_rules.allow_emergency_subs
 * - DROP COLUMN roster_lock_rules.emergency_sub_rule
 * - DROP TYPE emergency_sub_rule
 *
 * Each statement is metadata-only on an empty table and individually
 * re-runnable (the runner is autocommit, LS-8254).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- MigrationContext's db handle is untyped across runner/lambda sandbox boundaries
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  console.log('🗑️  Removing emergency-substitution columns and enum...');
  await db.execute(`
    ALTER TABLE roster_lock_rules DROP COLUMN IF EXISTS allow_emergency_subs;
  `);
  await db.execute(`
    ALTER TABLE roster_lock_rules DROP COLUMN IF EXISTS emergency_sub_rule;
  `);
  await db.execute(`
    DROP TYPE IF EXISTS emergency_sub_rule;
  `);
  console.log('✅ emergency-substitution feature removed');
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- MigrationContext's db handle is untyped across runner/lambda sandbox boundaries
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  console.log('📊 Restoring emergency-substitution columns and enum...');
  await db.execute(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'emergency_sub_rule') THEN
        CREATE TYPE emergency_sub_rule AS ENUM (
          'none',
          'injury_only',
          'injury_or_rest',
          'commissioner_approval'
        );
      END IF;
    END
    $$;
  `);
  await db.execute(`
    ALTER TABLE roster_lock_rules
      ADD COLUMN IF NOT EXISTS allow_emergency_subs BOOLEAN NOT NULL DEFAULT false;
  `);
  await db.execute(`
    ALTER TABLE roster_lock_rules
      ADD COLUMN IF NOT EXISTS emergency_sub_rule emergency_sub_rule NOT NULL DEFAULT 'none';
  `);
  console.log('✅ emergency-substitution feature restored');
};
