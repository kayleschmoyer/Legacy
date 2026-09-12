import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Create nfl_team_kickoff_times table (LS-9687)
 *
 * Per-team real-world NFL kickoff instant. One row per franchise
 * (`nfl_teams.abbreviation`), overwritten in place as each new kickoff is
 * announced/confirmed — never keyed by league or fantasy week. This is the
 * data source `checkPlayersNotLocked` and the roster-position mutations use
 * to reject a move the moment a specific player's own NFL team has kicked
 * off, independent of any single league's `matchups.status` (which only
 * flips via the once-nightly `autoSelectGames` cron and so cannot close the
 * bootstrap-timing race on its own — see LS-9687 / follow-up to LS-6428 /
 * LS-6031).
 *
 * `kickoff_time` is nullable: no row, or a null `kickoff_time`, means "no
 * known kickoff for this team right now" (bye week, or not yet populated) —
 * callers must treat that as "not locked by this check", never as
 * "started". A postponed/rescheduled game is just an upsert of a corrected
 * `kickoff_time` — no separate code path.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration runner passes an untyped PgDatabase; matches the project's other migration files
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."nfl_team_kickoff_times" (
      "team_abbreviation" VARCHAR(10) PRIMARY KEY
        REFERENCES "public"."nfl_teams" ("abbreviation"),
      "kickoff_time"      TIMESTAMPTZ,
      "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration runner passes an untyped PgDatabase; matches the project's other migration files
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    DROP TABLE IF EXISTS "public"."nfl_team_kickoff_times";
  `);
};
