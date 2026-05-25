import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Fix career_football_defense_idp view (LS-255)
 *
 * 20260524_100300 created this view with ::smallint casts on SUM() aggregates,
 * which risk overflow for any player with season totals exceeding 32,767.
 * SUM(SMALLINT) in PostgreSQL returns BIGINT — this migration drops and recreates
 * the view without the casts so it returns native BIGINT columns.
 *
 * DROP + CREATE is used instead of CREATE OR REPLACE VIEW because PostgreSQL
 * rejects OR REPLACE when the existing column types differ (SMALLINT vs BIGINT).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(
    `DROP VIEW IF EXISTS "public"."career_football_defense_idp";`,
  );
  await db.execute(`
    CREATE VIEW "public"."career_football_defense_idp" AS
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
  // No-op: reverting to the ::smallint version is worse than leaving the fix.
};
