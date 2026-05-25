import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Create football_season_defense_idp table (LS-4155)
 *
 * Season-aggregated IDP stats. Distinct from football_season_defense (DST
 * team-level aggregates). Primary key includes pfr_row_id to handle players
 * who played for multiple teams in the same season.
 *
 * sacks uses DECIMAL(5,1) to support season-level half-sack accumulation.
 *
 * Depends on:
 *   LS-246 — players.sport column exists
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."football_season_defense_idp" (
      "player_id"  INTEGER     NOT NULL REFERENCES "public"."players" ("id") ON DELETE CASCADE,
      "season"     SMALLINT    NOT NULL,
      "team"       VARCHAR(10) NOT NULL,
      "g"          SMALLINT,
      "gs"         SMALLINT,
      "solo_tkl"   SMALLINT,
      "ast_tkl"    SMALLINT,
      "total_tkl"  SMALLINT,
      "sacks"      DECIMAL(5,1),
      "int"        SMALLINT,
      "pd"         SMALLINT,
      "ff"         SMALLINT,
      "fr"         SMALLINT,
      "def_td"     SMALLINT,
      "safeties"   SMALLINT,
      "pfr_row_id" VARCHAR(30) NOT NULL,
      CONSTRAINT "football_season_defense_idp_pk"
        PRIMARY KEY ("player_id", "season", "team", "pfr_row_id")
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "football_season_defense_idp_player_id_idx"
      ON "public"."football_season_defense_idp" ("player_id");
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "football_season_defense_idp_player_id_season_idx"
      ON "public"."football_season_defense_idp" ("player_id", "season");
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP TABLE IF EXISTS "public"."football_season_defense_idp";
  `);
};
