import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add invite_code to season_draft_games
 *
 * Purpose:
 * - Enable invite-link-based player joining instead of adding by username
 *
 * Changes:
 * - Add invite_code VARCHAR(12) UNIQUE to season_draft_games
 * - Backfill existing rows with random hex codes
 * - Add NOT NULL constraint after backfill
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // 1. Add nullable column first so existing rows don't fail
  await db.execute(`
    ALTER TABLE season_draft_games
      ADD COLUMN IF NOT EXISTS invite_code VARCHAR(12);
  `);

  // 2. Backfill existing rows with unique random codes (uses built-in gen_random_uuid, no pgcrypto needed)
  await db.execute(`
    UPDATE season_draft_games
    SET invite_code = substring(replace(gen_random_uuid()::text, '-', ''), 1, 12)
    WHERE invite_code IS NULL;
  `);

  // 3. Add UNIQUE + NOT NULL constraints now that all rows have values
  await db.execute(`
    ALTER TABLE season_draft_games
      ALTER COLUMN invite_code SET NOT NULL,
      ADD CONSTRAINT season_draft_games_invite_code_unique UNIQUE (invite_code);
  `);

  // 4. Add index for fast lookups by invite code
  await db.execute(`
    CREATE INDEX IF NOT EXISTS season_draft_games_invite_code_idx
      ON season_draft_games(invite_code);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP INDEX IF EXISTS season_draft_games_invite_code_idx;
    ALTER TABLE season_draft_games
      DROP CONSTRAINT IF EXISTS season_draft_games_invite_code_unique,
      DROP COLUMN IF EXISTS invite_code;
  `);
};
