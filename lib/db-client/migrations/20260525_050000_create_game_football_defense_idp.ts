import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Create game_football_defense_idp table (LS-4155)
 *
 * Per-game individual defensive player (IDP) stats. Distinct from
 * game_football_defense (DST team-level aggregates): IDP tracks per-player
 * tackle/sack/turnover stats scraped from individual PFR player game logs.
 *
 * sacks uses DECIMAL(4,1) to support half-sacks (e.g. 0.5, 1.5).
 *
 * Depends on:
 *   LS-246 — players.sport column exists
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."game_football_defense_idp" (
      "player_id"       INTEGER     NOT NULL REFERENCES "public"."players" ("id") ON DELETE CASCADE,
      "season"          SMALLINT    NOT NULL,
      "game_num"        SMALLINT    NOT NULL,
      "game_identifier" VARCHAR(20) NOT NULL,
      "solo_tkl"        SMALLINT,
      "ast_tkl"         SMALLINT,
      "sacks"           DECIMAL(4,1),
      "int"             SMALLINT,
      "pd"              SMALLINT,
      "ff"              SMALLINT,
      "fr"              SMALLINT,
      "def_td"          SMALLINT,
      "safeties"        SMALLINT,
      CONSTRAINT "game_football_defense_idp_player_season_game_num_unique"
        UNIQUE ("player_id", "season", "game_num")
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "game_football_defense_idp_player_id_season_idx"
      ON "public"."game_football_defense_idp" ("player_id", "season");
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "game_football_defense_idp_game_identifier_idx"
      ON "public"."game_football_defense_idp" ("game_identifier");
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP TABLE IF EXISTS "public"."game_football_defense_idp";
  `);
};
