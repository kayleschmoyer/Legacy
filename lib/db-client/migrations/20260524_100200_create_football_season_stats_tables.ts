import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Create football season stats tables (LS-247)
 *
 * Creates football_season_passing, football_season_rushing, football_season_receiving,
 * football_season_kicking, and football_season_defense. Each table stores one
 * player's aggregated stats for a team/season sourced from Pro Football Reference.
 *
 * PKs: (player_id, season, team, pfr_row_id)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."football_season_passing" (
      player_id  INTEGER      NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      season     SMALLINT     NOT NULL,
      team       VARCHAR(10)  NOT NULL,
      g          SMALLINT,
      gs         SMALLINT,
      cmp        SMALLINT,
      att        SMALLINT,
      yds        INTEGER,
      td         SMALLINT,
      int        SMALLINT,
      first_downs SMALLINT,
      sacked     SMALLINT,
      sack_yds   SMALLINT,
      lng        SMALLINT,
      rating     NUMERIC(5,1),
      pfr_row_id VARCHAR(30)  NOT NULL,
      PRIMARY KEY (player_id, season, team, pfr_row_id)
    );
    CREATE INDEX IF NOT EXISTS football_season_passing_player_id_idx
      ON "public"."football_season_passing" (player_id);
    CREATE INDEX IF NOT EXISTS football_season_passing_player_season_idx
      ON "public"."football_season_passing" (player_id, season);
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."football_season_rushing" (
      player_id   INTEGER      NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      season      SMALLINT     NOT NULL,
      team        VARCHAR(10)  NOT NULL,
      g           SMALLINT,
      gs          SMALLINT,
      att         SMALLINT,
      yds         INTEGER,
      td          SMALLINT,
      lng         SMALLINT,
      first_downs SMALLINT,
      fumbles     SMALLINT,
      yds_per_att NUMERIC(4,1),
      pfr_row_id  VARCHAR(30)  NOT NULL,
      PRIMARY KEY (player_id, season, team, pfr_row_id)
    );
    CREATE INDEX IF NOT EXISTS football_season_rushing_player_id_idx
      ON "public"."football_season_rushing" (player_id);
    CREATE INDEX IF NOT EXISTS football_season_rushing_player_season_idx
      ON "public"."football_season_rushing" (player_id, season);
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."football_season_receiving" (
      player_id   INTEGER      NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      season      SMALLINT     NOT NULL,
      team        VARCHAR(10)  NOT NULL,
      g           SMALLINT,
      gs          SMALLINT,
      rec         SMALLINT,
      tgt         SMALLINT,
      yds         INTEGER,
      td          SMALLINT,
      lng         SMALLINT,
      first_downs SMALLINT,
      fumbles     SMALLINT,
      yds_per_rec NUMERIC(4,1),
      pfr_row_id  VARCHAR(30)  NOT NULL,
      PRIMARY KEY (player_id, season, team, pfr_row_id)
    );
    CREATE INDEX IF NOT EXISTS football_season_receiving_player_id_idx
      ON "public"."football_season_receiving" (player_id);
    CREATE INDEX IF NOT EXISTS football_season_receiving_player_season_idx
      ON "public"."football_season_receiving" (player_id, season);
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."football_season_kicking" (
      player_id   INTEGER      NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      season      SMALLINT     NOT NULL,
      team        VARCHAR(10)  NOT NULL,
      g           SMALLINT,
      fgm         SMALLINT,
      fga         SMALLINT,
      fg_pct      NUMERIC(4,1),
      fg_0_19m    SMALLINT,
      fg_0_19a    SMALLINT,
      fg_20_29m   SMALLINT,
      fg_20_29a   SMALLINT,
      fg_30_39m   SMALLINT,
      fg_30_39a   SMALLINT,
      fg_40_49m   SMALLINT,
      fg_40_49a   SMALLINT,
      fg_50m      SMALLINT,
      fg_50a      SMALLINT,
      xpm         SMALLINT,
      xpa         SMALLINT,
      lng         SMALLINT,
      pfr_row_id  VARCHAR(30)  NOT NULL,
      PRIMARY KEY (player_id, season, team, pfr_row_id)
    );
    CREATE INDEX IF NOT EXISTS football_season_kicking_player_id_idx
      ON "public"."football_season_kicking" (player_id);
    CREATE INDEX IF NOT EXISTS football_season_kicking_player_season_idx
      ON "public"."football_season_kicking" (player_id, season);
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."football_season_defense" (
      player_id         INTEGER      NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      season            SMALLINT     NOT NULL,
      team              VARCHAR(10)  NOT NULL,
      g                 SMALLINT,
      sacks             NUMERIC(5,1),
      int               SMALLINT,
      fum_rec           SMALLINT,
      def_td            SMALLINT,
      safeties          SMALLINT,
      pts_allowed       SMALLINT,
      yds_allowed       INTEGER,
      pass_yds_allowed  INTEGER,
      rush_yds_allowed  INTEGER,
      pfr_row_id        VARCHAR(30)  NOT NULL,
      PRIMARY KEY (player_id, season, team, pfr_row_id)
    );
    CREATE INDEX IF NOT EXISTS football_season_defense_player_id_idx
      ON "public"."football_season_defense" (player_id);
    CREATE INDEX IF NOT EXISTS football_season_defense_player_season_idx
      ON "public"."football_season_defense" (player_id, season);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`DROP TABLE IF EXISTS "public"."football_season_defense";`);
  await db.execute(`DROP TABLE IF EXISTS "public"."football_season_kicking";`);
  await db.execute(
    `DROP TABLE IF EXISTS "public"."football_season_receiving";`,
  );
  await db.execute(`DROP TABLE IF EXISTS "public"."football_season_rushing";`);
  await db.execute(`DROP TABLE IF EXISTS "public"."football_season_passing";`);
};
