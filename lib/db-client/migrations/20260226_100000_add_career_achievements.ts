import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add career achievements columns to players and league achievement restrictions
 *
 * Purpose:
 * - Store per-achievement integer counts (All-Star selections, Gold Gloves, etc.)
 *   and boolean flags (Hall of Fame, Rookie of the Year) directly on the player
 *   record so they can be used as roster filters without re-scanning season tables.
 * - Allow commissioners to configure per-league roster restrictions based on
 *   career achievements (e.g., max 2 Hall-of-Famers, at least 1 player with
 *   3+ All-Star selections, max 10 total All-Star selections across the roster).
 *
 * Achievement columns on players:
 *   Repeatable (count):  all_star_selections, gold_gloves, silver_sluggers,
 *                        mvp_awards, cy_young_awards, world_series_rings
 *   One-time (boolean):  hall_of_fame, rookie_of_the_year
 *
 * New table: league_achievement_restrictions
 *   Rows are keyed (league_id, achievement_type).  The restriction engine
 *   enforces:
 *     - player_min_count   — player must have at least this many of the award
 *     - roster_min / roster_max — min/max players with ≥1 of the award per roster
 *     - repeatable_roster_max — max total count of the award across the whole roster
 *       (only meaningful when is_repeatable=true, e.g. cap total All-Star picks)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // 1. Add typed achievement columns to players
  await db.execute(`
    ALTER TABLE players
      ADD COLUMN IF NOT EXISTS all_star_selections  INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS gold_gloves          INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS silver_sluggers      INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS mvp_awards           INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS cy_young_awards      INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS world_series_rings   INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS hall_of_fame         BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS rookie_of_the_year   BOOLEAN NOT NULL DEFAULT false;
  `);

  // 2. Create league_achievement_restrictions table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS league_achievement_restrictions (
      id                   SERIAL PRIMARY KEY,
      league_id            INTEGER NOT NULL,
      -- One of: all_star_selections | gold_gloves | silver_sluggers |
      --         mvp_awards | cy_young_awards | world_series_rings |
      --         hall_of_fame | rookie_of_the_year
      achievement_type     VARCHAR(50)  NOT NULL,
      is_repeatable        BOOLEAN      NOT NULL DEFAULT false,
      -- Minimum count of the award a player must have to qualify
      -- (e.g. 3 = player must have 3+ All-Star selections)
      player_min_count     INTEGER,
      -- Min/max number of qualifying players allowed on a roster
      roster_min           INTEGER,
      roster_max           INTEGER,
      -- Cap on the TOTAL count of a repeatable award across the whole roster
      -- (only used when is_repeatable=true)
      repeatable_roster_max INTEGER,
      created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      updated_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      CONSTRAINT league_achievement_restrictions_league_fk
        FOREIGN KEY (league_id)
        REFERENCES leagues (id)
        ON DELETE CASCADE,
      CONSTRAINT league_achievement_restrictions_uk
        UNIQUE (league_id, achievement_type)
    );
  `);

  // 3. Index for fast per-league lookup
  await db.execute(`
    CREATE INDEX IF NOT EXISTS lar_league_id_idx
      ON league_achievement_restrictions (league_id);
  `);

  // 4. Auto-update trigger for updated_at
  await db.execute(`
    CREATE OR REPLACE FUNCTION update_lar_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await db.execute(`
    DROP TRIGGER IF EXISTS trg_lar_updated_at
      ON league_achievement_restrictions;
    CREATE TRIGGER trg_lar_updated_at
      BEFORE UPDATE ON league_achievement_restrictions
      FOR EACH ROW
      EXECUTE FUNCTION update_lar_updated_at();
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP TRIGGER IF EXISTS trg_lar_updated_at
      ON league_achievement_restrictions;
    DROP FUNCTION IF EXISTS update_lar_updated_at();
    DROP TABLE IF EXISTS league_achievement_restrictions;
    ALTER TABLE players
      DROP COLUMN IF EXISTS all_star_selections,
      DROP COLUMN IF EXISTS gold_gloves,
      DROP COLUMN IF EXISTS silver_sluggers,
      DROP COLUMN IF EXISTS mvp_awards,
      DROP COLUMN IF EXISTS cy_young_awards,
      DROP COLUMN IF EXISTS world_series_rings,
      DROP COLUMN IF EXISTS hall_of_fame,
      DROP COLUMN IF EXISTS rookie_of_the_year;
  `);
};
