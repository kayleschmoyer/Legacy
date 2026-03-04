import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add is_mock_draft column to leagues
 *
 * Purpose:
 * - Supports the new "Mock Draft" feature (LS-470) which lets users practice
 *   drafting against AI auto-pick teams without persisting rosters to a real league.
 * - A mock draft creates a temporary ephemeral league tagged with isMockDraft=true.
 *   Draft picks are recorded but teamMembers inserts and matchup creation are skipped.
 *
 * Changes:
 * - Adds `is_mock_draft BOOLEAN NOT NULL DEFAULT FALSE` to the leagues table.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE leagues
      ADD COLUMN IF NOT EXISTS is_mock_draft BOOLEAN NOT NULL DEFAULT FALSE;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE leagues
      DROP COLUMN IF EXISTS is_mock_draft;
  `);
};
