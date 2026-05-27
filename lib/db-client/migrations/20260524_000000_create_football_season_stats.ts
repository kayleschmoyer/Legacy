import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

/**
 * Migration: Create football season stats tables (LS-247)
 *
 * Football equivalents of season_batting/pitching/fielding. Each table stores
 * one player's aggregated season stats for a team/season, sourced from
 * Pro Football Reference. The defense table references the synthetic
 * is_dst=true DST player for the team rather than an individual player.
 */

export const up = async ({ db }: { db: PostgresJsDatabase }) => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."football_season_passing" (
      "player_id"   integer          NOT NULL,
      "season"      integer          NOT NULL,
      "team"        varchar(50)      NOT NULL,
      "g"           integer,
      "gs"          integer,
      "cmp"         integer,
      "att"         integer,
      "yds"         integer,
      "td"          integer,
      "int"         integer,
      "first_downs" integer,
      "sacked"      integer,
      "sack_yds"    integer,
      "lng"         integer,
      "rating"      double precision,
      "pfr_row_id"  varchar(50)      NOT NULL,
      CONSTRAINT "football_season_passing_pk"
        PRIMARY KEY ("player_id", "season", "team", "pfr_row_id"),
      CONSTRAINT "football_season_passing_players_id_fk"
        FOREIGN KEY ("player_id") REFERENCES "public"."players" ("id") ON DELETE CASCADE
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "football_season_passing_player_id_idx"
      ON "public"."football_season_passing" ("player_id");
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "football_season_passing_player_id_season_idx"
      ON "public"."football_season_passing" ("player_id", "season");
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."football_season_rushing" (
      "player_id"   integer          NOT NULL,
      "season"      integer          NOT NULL,
      "team"        varchar(50)      NOT NULL,
      "g"           integer,
      "gs"          integer,
      "att"         integer,
      "yds"         integer,
      "td"          integer,
      "lng"         integer,
      "first_downs" integer,
      "fumbles"     integer,
      "yds_per_att" double precision,
      "pfr_row_id"  varchar(50)      NOT NULL,
      CONSTRAINT "football_season_rushing_pk"
        PRIMARY KEY ("player_id", "season", "team", "pfr_row_id"),
      CONSTRAINT "football_season_rushing_players_id_fk"
        FOREIGN KEY ("player_id") REFERENCES "public"."players" ("id") ON DELETE CASCADE
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "football_season_rushing_player_id_idx"
      ON "public"."football_season_rushing" ("player_id");
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "football_season_rushing_player_id_season_idx"
      ON "public"."football_season_rushing" ("player_id", "season");
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."football_season_receiving" (
      "player_id"   integer          NOT NULL,
      "season"      integer          NOT NULL,
      "team"        varchar(50)      NOT NULL,
      "g"           integer,
      "gs"          integer,
      "rec"         integer,
      "tgt"         integer,
      "yds"         integer,
      "td"          integer,
      "lng"         integer,
      "first_downs" integer,
      "fumbles"     integer,
      "yds_per_rec" double precision,
      "pfr_row_id"  varchar(50)      NOT NULL,
      CONSTRAINT "football_season_receiving_pk"
        PRIMARY KEY ("player_id", "season", "team", "pfr_row_id"),
      CONSTRAINT "football_season_receiving_players_id_fk"
        FOREIGN KEY ("player_id") REFERENCES "public"."players" ("id") ON DELETE CASCADE
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "football_season_receiving_player_id_idx"
      ON "public"."football_season_receiving" ("player_id");
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "football_season_receiving_player_id_season_idx"
      ON "public"."football_season_receiving" ("player_id", "season");
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."football_season_kicking" (
      "player_id"  integer          NOT NULL,
      "season"     integer          NOT NULL,
      "team"       varchar(50)      NOT NULL,
      "g"          integer,
      "fgm"        integer,
      "fga"        integer,
      "fg_pct"     double precision,
      "fg_0_19m"   integer,
      "fg_0_19a"   integer,
      "fg_20_29m"  integer,
      "fg_20_29a"  integer,
      "fg_30_39m"  integer,
      "fg_30_39a"  integer,
      "fg_40_49m"  integer,
      "fg_40_49a"  integer,
      "fg_50m"     integer,
      "fg_50a"     integer,
      "xpm"        integer,
      "xpa"        integer,
      "lng"        integer,
      "pfr_row_id" varchar(50)      NOT NULL,
      CONSTRAINT "football_season_kicking_pk"
        PRIMARY KEY ("player_id", "season", "team", "pfr_row_id"),
      CONSTRAINT "football_season_kicking_players_id_fk"
        FOREIGN KEY ("player_id") REFERENCES "public"."players" ("id") ON DELETE CASCADE
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "football_season_kicking_player_id_idx"
      ON "public"."football_season_kicking" ("player_id");
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "football_season_kicking_player_id_season_idx"
      ON "public"."football_season_kicking" ("player_id", "season");
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."football_season_defense" (
      "player_id"        integer     NOT NULL,
      "season"           integer     NOT NULL,
      "team"             varchar(50) NOT NULL,
      "g"                integer,
      "sacks"            integer,
      "int"              integer,
      "fumbles_rec"      integer,
      "def_td"           integer,
      "safeties"         integer,
      "pts_allowed"      integer,
      "yds_allowed"      integer,
      "pass_yds_allowed" integer,
      "rush_yds_allowed" integer,
      "pfr_row_id"       varchar(50) NOT NULL,
      CONSTRAINT "football_season_defense_pk"
        PRIMARY KEY ("player_id", "season", "team", "pfr_row_id"),
      CONSTRAINT "football_season_defense_players_id_fk"
        FOREIGN KEY ("player_id") REFERENCES "public"."players" ("id") ON DELETE CASCADE
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "football_season_defense_player_id_idx"
      ON "public"."football_season_defense" ("player_id");
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "football_season_defense_player_id_season_idx"
      ON "public"."football_season_defense" ("player_id", "season");
  `);
};

export const down = async ({ db }: { db: PostgresJsDatabase }) => {
  await db.execute(
    `DROP TABLE IF EXISTS "public"."football_season_defense";`,
  );
  await db.execute(
    `DROP TABLE IF EXISTS "public"."football_season_kicking";`,
  );
  await db.execute(
    `DROP TABLE IF EXISTS "public"."football_season_receiving";`,
  );
  await db.execute(
    `DROP TABLE IF EXISTS "public"."football_season_rushing";`,
  );
  await db.execute(
    `DROP TABLE IF EXISTS "public"."football_season_passing";`,
  );
};
