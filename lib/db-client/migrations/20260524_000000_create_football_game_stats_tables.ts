import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Create football game stats tables (LS-248)
 *
 * Football equivalent of game_batting / game_pitching / game_fielding.
 * Since Legacy Sports uses a non-synchronized random game selection mechanic,
 * all 17 NFL regular season games are loaded per player/season and the matchup
 * engine randomly selects N of them. game_num (1-17) is used identically to
 * game_batting.game_number.
 *
 * Tables created:
 *   game_football_passing  — QB stats per game
 *   game_football_rushing  — RB/all-positions rushing stats per game
 *   game_football_receiving — WR/TE/RB receiving stats per game
 *   game_football_kicking  — K field goal and extra-point stats per game
 *   game_football_defense  — DST team-defense stats per game
 *
 * UNIQUE on (player_id, season, game_num) on all tables.
 * Indexes follow the same pattern as the baseball game stats tables.
 * game_identifier format matches PFR box score IDs (e.g. '202409080kc').
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // game_football_passing
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."game_football_passing" (
      "player_id"       integer     NOT NULL,
      "season"          integer     NOT NULL,
      "game_num"        integer     NOT NULL,
      "game_identifier" varchar(20) NOT NULL,
      "cmp"             integer,
      "att"             integer,
      "yds"             integer,
      "td"              integer,
      "interceptions"   integer,
      "sacked"          integer,
      "sack_yds"        integer,
      "rating"          double precision,
      CONSTRAINT "game_football_passing_player_season_game_num_unique"
        UNIQUE ("player_id", "season", "game_num"),
      CONSTRAINT "game_football_passing_player_id_fk"
        FOREIGN KEY ("player_id") REFERENCES "public"."players" ("id") ON DELETE CASCADE
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "game_football_passing_player_id_season_idx"
      ON "public"."game_football_passing" ("player_id", "season");
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS "game_football_passing_player_id_season_game_num_idx"
      ON "public"."game_football_passing" ("player_id", "season", "game_num");
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS "game_football_passing_game_identifier_idx"
      ON "public"."game_football_passing" ("game_identifier");
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS "game_football_passing_player_id_game_identifier_idx"
      ON "public"."game_football_passing" ("player_id", "game_identifier");
  `);

  // game_football_rushing
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."game_football_rushing" (
      "player_id"       integer     NOT NULL,
      "season"          integer     NOT NULL,
      "game_num"        integer     NOT NULL,
      "game_identifier" varchar(20) NOT NULL,
      "att"             integer,
      "yds"             integer,
      "td"              integer,
      "lng"             integer,
      "fumbles"         integer,
      CONSTRAINT "game_football_rushing_player_season_game_num_unique"
        UNIQUE ("player_id", "season", "game_num"),
      CONSTRAINT "game_football_rushing_player_id_fk"
        FOREIGN KEY ("player_id") REFERENCES "public"."players" ("id") ON DELETE CASCADE
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "game_football_rushing_player_id_season_idx"
      ON "public"."game_football_rushing" ("player_id", "season");
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS "game_football_rushing_player_id_season_game_num_idx"
      ON "public"."game_football_rushing" ("player_id", "season", "game_num");
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS "game_football_rushing_game_identifier_idx"
      ON "public"."game_football_rushing" ("game_identifier");
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS "game_football_rushing_player_id_game_identifier_idx"
      ON "public"."game_football_rushing" ("player_id", "game_identifier");
  `);

  // game_football_receiving
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."game_football_receiving" (
      "player_id"       integer     NOT NULL,
      "season"          integer     NOT NULL,
      "game_num"        integer     NOT NULL,
      "game_identifier" varchar(20) NOT NULL,
      "rec"             integer,
      "tgt"             integer,
      "yds"             integer,
      "td"              integer,
      "lng"             integer,
      "fumbles"         integer,
      CONSTRAINT "game_football_receiving_player_season_game_num_unique"
        UNIQUE ("player_id", "season", "game_num"),
      CONSTRAINT "game_football_receiving_player_id_fk"
        FOREIGN KEY ("player_id") REFERENCES "public"."players" ("id") ON DELETE CASCADE
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "game_football_receiving_player_id_season_idx"
      ON "public"."game_football_receiving" ("player_id", "season");
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS "game_football_receiving_player_id_season_game_num_idx"
      ON "public"."game_football_receiving" ("player_id", "season", "game_num");
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS "game_football_receiving_game_identifier_idx"
      ON "public"."game_football_receiving" ("game_identifier");
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS "game_football_receiving_player_id_game_identifier_idx"
      ON "public"."game_football_receiving" ("player_id", "game_identifier");
  `);

  // game_football_kicking
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."game_football_kicking" (
      "player_id"       integer     NOT NULL,
      "season"          integer     NOT NULL,
      "game_num"        integer     NOT NULL,
      "game_identifier" varchar(20) NOT NULL,
      "fgm"             integer,
      "fga"             integer,
      "fg_0_19m"        integer,
      "fg_0_19a"        integer,
      "fg_20_29m"       integer,
      "fg_20_29a"       integer,
      "fg_30_39m"       integer,
      "fg_30_39a"       integer,
      "fg_40_49m"       integer,
      "fg_40_49a"       integer,
      "fg_50m"          integer,
      "fg_50a"          integer,
      "xpm"             integer,
      "xpa"             integer,
      "lng"             integer,
      CONSTRAINT "game_football_kicking_player_season_game_num_unique"
        UNIQUE ("player_id", "season", "game_num"),
      CONSTRAINT "game_football_kicking_player_id_fk"
        FOREIGN KEY ("player_id") REFERENCES "public"."players" ("id") ON DELETE CASCADE
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "game_football_kicking_player_id_season_idx"
      ON "public"."game_football_kicking" ("player_id", "season");
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS "game_football_kicking_player_id_season_game_num_idx"
      ON "public"."game_football_kicking" ("player_id", "season", "game_num");
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS "game_football_kicking_game_identifier_idx"
      ON "public"."game_football_kicking" ("game_identifier");
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS "game_football_kicking_player_id_game_identifier_idx"
      ON "public"."game_football_kicking" ("player_id", "game_identifier");
  `);

  // game_football_defense
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."game_football_defense" (
      "player_id"          integer     NOT NULL,
      "season"             integer     NOT NULL,
      "game_num"           integer     NOT NULL,
      "game_identifier"    varchar(20) NOT NULL,
      "sacks"              integer,
      "interceptions"      integer,
      "fumbles_rec"        integer,
      "def_td"             integer,
      "safeties"           integer,
      "pts_allowed"        integer,
      "yds_allowed"        integer,
      "pass_yds_allowed"   integer,
      "rush_yds_allowed"   integer,
      CONSTRAINT "game_football_defense_player_season_game_num_unique"
        UNIQUE ("player_id", "season", "game_num"),
      CONSTRAINT "game_football_defense_player_id_fk"
        FOREIGN KEY ("player_id") REFERENCES "public"."players" ("id") ON DELETE CASCADE
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "game_football_defense_player_id_season_idx"
      ON "public"."game_football_defense" ("player_id", "season");
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS "game_football_defense_player_id_season_game_num_idx"
      ON "public"."game_football_defense" ("player_id", "season", "game_num");
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS "game_football_defense_game_identifier_idx"
      ON "public"."game_football_defense" ("game_identifier");
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS "game_football_defense_player_id_game_identifier_idx"
      ON "public"."game_football_defense" ("player_id", "game_identifier");
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(
    `DROP TABLE IF EXISTS "public"."game_football_defense";`,
  );
  await db.execute(
    `DROP TABLE IF EXISTS "public"."game_football_kicking";`,
  );
  await db.execute(
    `DROP TABLE IF EXISTS "public"."game_football_receiving";`,
  );
  await db.execute(
    `DROP TABLE IF EXISTS "public"."game_football_rushing";`,
  );
  await db.execute(
    `DROP TABLE IF EXISTS "public"."game_football_passing";`,
  );
};
