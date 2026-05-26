import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Create career_football_* tables (LS-250)
 *
 * Creates 5 career stat tables for football (analogous to career_batting / career_pitching /
 * career_fielding for baseball). Tables are populated by a separate CLI loader; this migration
 * creates DDL only.
 *
 * Note: career_football_defense_idp is a VIEW owned by LS-4155
 * (20260525_061000_create_career_football_defense_idp_view).
 *
 * The football_player_eligible_positions view is created in a separate migration
 * (20260524_000200_add_position_to_players_and_create_football_view) that runs after
 * 20260524_000100_add_football_columns_to_players (LS-246) so is_dst and position exist.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase<any> is the correct type for drizzle migration runner callbacks
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // career_football_passing
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."career_football_passing" (
      "player_id"  integer     PRIMARY KEY,
      "g"          integer,
      "cmp"        integer,
      "att"        integer,
      "yds"        integer,
      "td"         integer,
      "int"        integer,
      "sacked"     integer,
      "sack_yds"   integer,
      "rating"     double precision,
      CONSTRAINT "career_football_passing_players_id_fk"
        FOREIGN KEY ("player_id") REFERENCES "public"."players" ("id") ON DELETE CASCADE
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "career_football_passing_player_id_idx"
      ON "public"."career_football_passing" ("player_id");
  `);

  // career_football_rushing
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."career_football_rushing" (
      "player_id"  integer  PRIMARY KEY,
      "g"          integer,
      "att"        integer,
      "yds"        integer,
      "td"         integer,
      "lng"        integer,
      "fumbles"    integer,
      CONSTRAINT "career_football_rushing_players_id_fk"
        FOREIGN KEY ("player_id") REFERENCES "public"."players" ("id") ON DELETE CASCADE
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "career_football_rushing_player_id_idx"
      ON "public"."career_football_rushing" ("player_id");
  `);

  // career_football_receiving
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."career_football_receiving" (
      "player_id"  integer  PRIMARY KEY,
      "g"          integer,
      "rec"        integer,
      "tgt"        integer,
      "yds"        integer,
      "td"         integer,
      "lng"        integer,
      "fumbles"    integer,
      CONSTRAINT "career_football_receiving_players_id_fk"
        FOREIGN KEY ("player_id") REFERENCES "public"."players" ("id") ON DELETE CASCADE
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "career_football_receiving_player_id_idx"
      ON "public"."career_football_receiving" ("player_id");
  `);

  // career_football_kicking
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."career_football_kicking" (
      "player_id"    integer  PRIMARY KEY,
      "g"            integer,
      "fgm"          integer,
      "fga"          integer,
      "fg_0_19m"     integer,
      "fg_0_19a"     integer,
      "fg_20_29m"    integer,
      "fg_20_29a"    integer,
      "fg_30_39m"    integer,
      "fg_30_39a"    integer,
      "fg_40_49m"    integer,
      "fg_40_49a"    integer,
      "fg_50m"       integer,
      "fg_50a"       integer,
      "xpm"          integer,
      "xpa"          integer,
      "lng"          integer,
      CONSTRAINT "career_football_kicking_players_id_fk"
        FOREIGN KEY ("player_id") REFERENCES "public"."players" ("id") ON DELETE CASCADE
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "career_football_kicking_player_id_idx"
      ON "public"."career_football_kicking" ("player_id");
  `);

  // career_football_defense (DST team-level — player_id references synthetic is_dst=true player)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."career_football_defense" (
      "player_id"         integer          PRIMARY KEY,
      "g"                 integer,
      "sacks"             double precision,
      "int"               integer,
      "fumbles_rec"       integer,
      "def_td"            integer,
      "safeties"          integer,
      "pts_allowed_per_g" double precision,
      "yds_allowed_per_g" double precision,
      CONSTRAINT "career_football_defense_players_id_fk"
        FOREIGN KEY ("player_id") REFERENCES "public"."players" ("id") ON DELETE CASCADE
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "career_football_defense_player_id_idx"
      ON "public"."career_football_defense" ("player_id");
  `);

  // career_football_defense_idp is a VIEW owned by LS-4155
  // (20260525_061000_create_career_football_defense_idp_view)

};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase<any> is the correct type for drizzle migration runner callbacks
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  // career_football_defense_idp is a VIEW dropped by 20260525_061000 (LS-4155)
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
