import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Create career_football_* tables (LS-250)
 *
 * Career totals loaded by the football CLI scraper. Each table has player_id
 * as the primary key (one row per player — no team/season disambiguation).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."career_football_passing" (
      player_id  INTEGER      PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
      g          SMALLINT,
      cmp        SMALLINT,
      att        SMALLINT,
      yds        INTEGER,
      td         SMALLINT,
      int        SMALLINT,
      sacked     SMALLINT,
      sack_yds   SMALLINT,
      rating     NUMERIC(5,1)
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."career_football_rushing" (
      player_id  INTEGER  PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
      g          SMALLINT,
      att        SMALLINT,
      yds        INTEGER,
      td         SMALLINT,
      lng        SMALLINT,
      fumbles    SMALLINT
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."career_football_receiving" (
      player_id  INTEGER  PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
      g          SMALLINT,
      rec        SMALLINT,
      tgt        SMALLINT,
      yds        INTEGER,
      td         SMALLINT,
      lng        SMALLINT,
      fumbles    SMALLINT
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."career_football_kicking" (
      player_id  INTEGER  PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
      g          SMALLINT,
      fgm        SMALLINT,
      fga        SMALLINT,
      fg_0_19m   SMALLINT,
      fg_0_19a   SMALLINT,
      fg_20_29m  SMALLINT,
      fg_20_29a  SMALLINT,
      fg_30_39m  SMALLINT,
      fg_30_39a  SMALLINT,
      fg_40_49m  SMALLINT,
      fg_40_49a  SMALLINT,
      fg_50m     SMALLINT,
      fg_50a     SMALLINT,
      xpm        SMALLINT,
      xpa        SMALLINT,
      lng        SMALLINT
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."career_football_defense" (
      player_id         INTEGER      PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
      g                 SMALLINT,
      sacks             NUMERIC(5,1),
      int               SMALLINT,
      fum_rec           SMALLINT,
      def_td            SMALLINT,
      safeties          SMALLINT,
      pts_allowed_per_g NUMERIC(5,2),
      yds_allowed_per_g NUMERIC(6,2)
    );
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(
    `DROP TABLE IF EXISTS "public"."career_football_defense";`,
  );
  await db.execute(
    `DROP TABLE IF EXISTS "public"."career_football_kicking";`,
  );
  await db.execute(
    `DROP TABLE IF EXISTS "public"."career_football_receiving";`,
  );
  await db.execute(
    `DROP TABLE IF EXISTS "public"."career_football_rushing";`,
  );
  await db.execute(
    `DROP TABLE IF EXISTS "public"."career_football_passing";`,
  );
};
