import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Create career_football_defense_idp view (LS-4155)
 *
 * Career aggregation view over football_season_defense_idp. SUMs all season
 * rows for a player across multiple seasons and teams.
 *
 * Depends on:
 *   20260525_060000 — football_season_defense_idp table exists
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE OR REPLACE VIEW "public"."career_football_defense_idp" AS
    SELECT
      player_id,
      SUM(g)         AS g,
      SUM(solo_tkl)  AS solo_tkl,
      SUM(ast_tkl)   AS ast_tkl,
      SUM(total_tkl) AS total_tkl,
      SUM(sacks)     AS sacks,
      SUM(int)       AS int,
      SUM(pd)        AS pd,
      SUM(ff)        AS ff,
      SUM(fr)        AS fr,
      SUM(def_td)    AS def_td,
      SUM(safeties)  AS safeties
    FROM "public"."football_season_defense_idp"
    GROUP BY player_id;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP VIEW IF EXISTS "public"."career_football_defense_idp";
  `);
};
