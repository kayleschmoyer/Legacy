import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add award voting system tables
 *
 * Purpose:
 * - Enables league-wide voting for season awards (LS-3126)
 * - Commissioners open voting periods selecting which award types to include
 * - League members cast anonymous votes (one per award type per season)
 * - When voting closes, winners are tallied and stored in league_season_awards
 *
 * Changes:
 * - Creates league_award_voting_periods (tracks open/closed voting per season)
 * - Creates league_season_award_votes (individual anonymous votes)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    -- Voting periods: one per league per season
    CREATE TABLE league_award_voting_periods (
      id           SERIAL PRIMARY KEY,
      league_id    INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      season       INTEGER NOT NULL,
      status       VARCHAR(20) NOT NULL DEFAULT 'open',
      award_types  JSONB NOT NULL DEFAULT '[]'::jsonb,
      opened_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at    TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX league_award_voting_periods_uk
      ON league_award_voting_periods (league_id, season);

    -- Individual votes: one per user per award type per season
    CREATE TABLE league_season_award_votes (
      id              SERIAL PRIMARY KEY,
      league_id       INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      season          INTEGER NOT NULL,
      award_type      VARCHAR(50) NOT NULL,
      voter_user_id   INTEGER NOT NULL,
      player_id       INTEGER NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX league_season_award_votes_uk
      ON league_season_award_votes (league_id, season, award_type, voter_user_id);

    CREATE INDEX league_season_award_votes_league_season_idx
      ON league_season_award_votes (league_id, season);

    -- Supports vote-aggregation queries that group/filter by award_type
    CREATE INDEX league_season_award_votes_league_season_type_idx
      ON league_season_award_votes (league_id, season, award_type);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP TABLE IF EXISTS league_season_award_votes;
    DROP TABLE IF EXISTS league_award_voting_periods;
  `);
};
