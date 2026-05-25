import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Create football_season_defense_idp table (LS-4155)
 *
 * Season-aggregated IDP (Individual Defensive Player) stats.
 * player_id references real individual players (DL/LB/DB), not synthetic DST players.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."football_season_defense_idp" (
      player_id   INTEGER      NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      season      SMALLINT     NOT NULL,
      team        VARCHAR(10)  NOT NULL,
      g           SMALLINT,
      gs          SMALLINT,
      solo_tkl    SMALLINT,
      ast_tkl     SMALLINT,
      total_tkl   SMALLINT,
      sacks       NUMERIC(5,1),
      int         SMALLINT,
      pd          SMALLINT,
      ff          SMALLINT,
      fr          SMALLINT,
      def_td      SMALLINT,
      safeties    SMALLINT,
      pfr_row_id  VARCHAR(30)  NOT NULL,
      PRIMARY KEY (player_id, season, team, pfr_row_id)
    );
    CREATE INDEX IF NOT EXISTS football_season_defense_idp_player_id_idx
      ON "public"."football_season_defense_idp" (player_id);
    CREATE INDEX IF NOT EXISTS football_season_defense_idp_player_season_idx
      ON "public"."football_season_defense_idp" (player_id, season);
  `);

  await db.execute(`
    CREATE OR REPLACE VIEW "public"."career_football_defense_idp" AS
    SELECT
      player_id,
      SUM(g)::smallint         AS g,
      SUM(solo_tkl)::smallint  AS solo_tkl,
      SUM(ast_tkl)::smallint   AS ast_tkl,
      SUM(total_tkl)::smallint AS total_tkl,
      SUM(sacks)               AS sacks,
      SUM(int)::smallint       AS int,
      SUM(pd)::smallint        AS pd,
      SUM(ff)::smallint        AS ff,
      SUM(fr)::smallint        AS fr,
      SUM(def_td)::smallint    AS def_td,
      SUM(safeties)::smallint  AS safeties
    FROM football_season_defense_idp
    GROUP BY player_id;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(
    `DROP VIEW IF EXISTS "public"."career_football_defense_idp";`,
  );
  await db.execute(
    `DROP TABLE IF EXISTS "public"."football_season_defense_idp";`,
  );
};
