import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Drop career_football_defense_idp so 100301 can recreate it (LS-255)
 *
 * The dev DB has 100300 already applied, which created this view with ::smallint
 * casts (SMALLINT columns). 100301 uses CREATE OR REPLACE VIEW without casts
 * (BIGINT columns), but PostgreSQL rejects changing column types via that
 * statement. Dropping first lets 100301 create the view from scratch with the
 * correct BIGINT columns.
 *
 * On fresh DBs, 100250 creates the view with BIGINT then this migration drops
 * it; 100300 is pre-skipped by 100250; 100301 recreates it correctly.
 * On the dev DB, 100300 is already applied with SMALLINT; this migration drops
 * that view; 100301 then creates it fresh with BIGINT.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(
    `DROP VIEW IF EXISTS "public"."career_football_defense_idp";`,
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  // No-op: 100301 owns the view; rolling back this migration alone is safe.
};
