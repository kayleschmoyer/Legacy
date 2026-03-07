import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add league_season_awards table
 *
 * Purpose:
 * - Enables commissioners to assign season-long fantasy awards to players
 *   (e.g. League MVP, Cy Young, Gold Glove) on a per-league, per-season basis.
 * - Awards are fantasy-league-specific (not real MLB awards) and are manually
 *   assigned by the commissioner.
 *
 * Changes:
 * - Creates league_season_awards table with league_id, season, player_id, award_type
 * - Unique constraint ensures one winner per award type per season per league
 * - Index on (league_id, season) for efficient league-season lookups
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE TABLE league_season_awards (
      id           SERIAL PRIMARY KEY,
      league_id    INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      season       INTEGER NOT NULL,
      player_id    INTEGER NOT NULL,
      award_type   VARCHAR(50) NOT NULL,
      notes        TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX league_season_awards_uk
      ON league_season_awards (league_id, season, award_type);

    CREATE INDEX league_season_awards_league_season_idx
      ON league_season_awards (league_id, season);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP TABLE IF EXISTS league_season_awards;
  `);
};
