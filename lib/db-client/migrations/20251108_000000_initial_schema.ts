import type { PgDatabase } from 'drizzle-orm/pg-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // Create schemas
  await db.execute(`CREATE SCHEMA IF NOT EXISTS "app_internal";`);

  // Create enums
  await db.execute(
    `CREATE TYPE "public"."access_level" AS ENUM('none', 'admin');`,
  );
  await db.execute(
    `CREATE TYPE "public"."draft_order" AS ENUM('snake', 'normal');`,
  );
  await db.execute(
    `CREATE TYPE "public"."draft_status" AS ENUM('not-started', 'queued', 'in-progress', 'completed');`,
  );
  await db.execute(
    `CREATE TYPE "public"."draft_type" AS ENUM('blind', 'normal', 'legacy', 'random-draft');`,
  );
  await db.execute(
    `CREATE TYPE "public"."league_permission_level" AS ENUM('owner', 'commissioner');`,
  );
  await db.execute(
    `CREATE TYPE "public"."player_position" AS ENUM('SP', 'RP', 'C', '1B', '2B', '3B', 'SS', 'RF', 'LF', 'CF', 'DH');`,
  );
  await db.execute(
    `CREATE TYPE "public"."position_slot" AS ENUM('SP', 'RP', 'C', '1B', '2B', '3B', 'SS', 'RF', 'LF', 'CF', 'DH', 'XDH', 'OF', 'IF');`,
  );
  await db.execute(
    `CREATE TYPE "public"."scoring_change_action" AS ENUM('created', 'updated', 'disabled');`,
  );
  await db.execute(
    `CREATE TYPE "public"."scoring_profile_status" AS ENUM('draft', 'active', 'archived');`,
  );
  await db.execute(
    `CREATE TYPE "public"."scoring_stat_group" AS ENUM('batting', 'pitching', 'fielding');`,
  );
  await db.execute(
    `CREATE TYPE "app_internal"."access_level" AS ENUM('none', 'admin');`,
  );

  // Create tables
  await db.execute(`
    CREATE TABLE "draft_teams" (
      "draft_id" integer NOT NULL,
      "team_id" integer NOT NULL,
      "league_id" integer NOT NULL,
      "draft_order" integer NOT NULL,
      CONSTRAINT "draft_teams_pk" PRIMARY KEY("draft_id","team_id","league_id"),
      CONSTRAINT "draft_teams_uk_order" UNIQUE("draft_id","draft_order")
    );
  `);

  await db.execute(`
    CREATE TABLE "drafts" (
      "id" serial PRIMARY KEY NOT NULL,
      "league_id" integer NOT NULL,
      "draft_type" "draft_type" NOT NULL,
      "date" date,
      "draft_order" "draft_order" DEFAULT 'snake' NOT NULL
    );
  `);

  await db.execute(`
    CREATE TABLE "league_members" (
      "league_id" integer NOT NULL,
      "team_id" integer,
      "permission_level" "league_permission_level" NOT NULL,
      "user_id" integer NOT NULL,
      CONSTRAINT "league_members_pk" PRIMARY KEY("league_id","user_id")
    );
  `);

  await db.execute(`
    CREATE TABLE "league_messages" (
      "league_id" integer NOT NULL,
      "message_text" varchar NOT NULL,
      "timestamp" timestamp DEFAULT now(),
      "id" serial PRIMARY KEY NOT NULL,
      "user_id" integer NOT NULL
    );
  `);

  await db.execute(`
    CREATE TABLE "league_positions" (
      "id" serial PRIMARY KEY NOT NULL,
      "league_id" integer NOT NULL,
      "position_type" "position_slot" NOT NULL
    );
  `);

  await db.execute(`
    CREATE TABLE "leagues" (
      "id" serial PRIMARY KEY NOT NULL,
      "name" varchar NOT NULL,
      "owner" integer NOT NULL,
      "max_roster_size" integer DEFAULT 25 NOT NULL,
      "current_matchup" integer,
      "draft_status" "draft_status" DEFAULT 'not-started' NOT NULL,
      "invite_code" varchar(8) NOT NULL,
      CONSTRAINT "leagues_invite_code_unique" UNIQUE("invite_code")
    );
  `);

  await db.execute(`
    CREATE TABLE "team_members" (
      "id" serial PRIMARY KEY NOT NULL,
      "team_id" integer,
      "league_id" integer NOT NULL,
      "player_id" integer NOT NULL,
      "position_id" integer,
      CONSTRAINT "team_members_uk_team_position" UNIQUE("team_id","position_id")
    );
  `);

  await db.execute(`
    CREATE TABLE "teams" (
      "id" serial PRIMARY KEY NOT NULL,
      "name" varchar NOT NULL,
      "league_id" integer NOT NULL,
      CONSTRAINT "teams_uk_id_league_id" UNIQUE("id","league_id")
    );
  `);

  await db.execute(`
    CREATE TABLE "matchup_player_games" (
      "id" serial PRIMARY KEY NOT NULL,
      "matchup_player_id" integer NOT NULL,
      "game_num" integer NOT NULL,
      "batting_game_num" integer,
      "fielding_game_num" integer,
      "pitching_game_num" integer,
      "fielding_game_pos" char(2) NOT NULL
    );
  `);

  await db.execute(`
    CREATE TABLE "matchup_players" (
      "id" serial PRIMARY KEY NOT NULL,
      "matchup_id" integer NOT NULL,
      "player_id" integer NOT NULL,
      "season" integer NOT NULL
    );
  `);

  await db.execute(`
    CREATE TABLE "matchups" (
      "id" serial PRIMARY KEY NOT NULL,
      "league_id" integer NOT NULL,
      "week_number" integer NOT NULL,
      CONSTRAINT "matchups_league_id_week_number_unique" UNIQUE("league_id","week_number")
    );
  `);

  await db.execute(`
    CREATE TABLE "players" (
      "id" serial PRIMARY KEY NOT NULL,
      "first_name" text NOT NULL,
      "last_name" text NOT NULL,
      "bref_id" varchar(10) NOT NULL,
      "stats_last_fetched_at" timestamp,
      CONSTRAINT "players_uk_bref_id" UNIQUE("bref_id")
    );
  `);

  await db.execute(`
    CREATE TABLE "game_batting" (
      "player_id" integer NOT NULL,
      "season" integer NOT NULL,
      "game_number" integer NOT NULL,
      "game_identifier" varchar(20) NOT NULL,
      "pa" integer,
      "ab" integer,
      "r" integer,
      "h" integer,
      "doubles" integer,
      "triples" integer,
      "hr" integer,
      "rbi" integer,
      "sb" integer,
      "cs" integer,
      "bb" integer,
      "so" integer,
      "gidp" integer,
      "hbp" integer,
      "sh" integer,
      "sf" varchar(10),
      "ibb" integer
    );
  `);

  await db.execute(`
    CREATE TABLE "game_fielding" (
      "player_id" integer NOT NULL,
      "season" integer NOT NULL,
      "game_num" integer NOT NULL,
      "game_identifier" varchar(20) NOT NULL,
      "inn_def" double precision,
      "chances" double precision,
      "po" integer,
      "a" integer,
      "e_def" integer,
      "dp_def" integer
    );
  `);

  await db.execute(`
    CREATE TABLE "game_pitching" (
      "player_id" integer NOT NULL,
      "season" integer NOT NULL,
      "game_num" integer NOT NULL,
      "game_identifier" varchar(20) NOT NULL,
      "w" integer,
      "l" integer,
      "gs" integer,
      "gf" integer,
      "cg" integer,
      "sho" integer,
      "sv" integer,
      "ip" double precision,
      "h" integer,
      "r" integer,
      "er" integer,
      "hr" integer,
      "bb" integer,
      "ibb" integer,
      "so" integer,
      "hbp" integer,
      "batters_faced" integer,
      "outs_recorded" integer GENERATED ALWAYS AS (((floor(ip) * (3)::double precision) + ((ip - floor(ip)) * (10)::double precision))) STORED
    );
  `);

  await db.execute(`
    CREATE TABLE "season_batting" (
      "player_id" integer NOT NULL,
      "season" integer NOT NULL,
      "g" integer,
      "pa" integer,
      "ab" integer,
      "r" integer,
      "h" integer,
      "doubles" integer,
      "triples" integer,
      "hr" integer,
      "rbi" integer,
      "sb" integer,
      "cs" integer,
      "bb" integer,
      "so" integer,
      "batting_avg" double precision,
      "onbase_perc" double precision,
      "slugging_perc" double precision,
      "onbase_plus_slugging" double precision,
      "onbase_plus_slugging_plus" double precision,
      "tb" integer,
      "gidp" integer,
      "hbp" integer,
      "sh" integer,
      "sf" varchar(20),
      "ibb" integer,
      "pos_season" varchar(100),
      "award_summary" text,
      "lg_id" varchar(50),
      "team" varchar(50) NOT NULL,
      "row_id" varchar(50) NOT NULL,
      CONSTRAINT "season_batting_pk" PRIMARY KEY("player_id","season","team","row_id")
    );
  `);

  await db.execute(`
    CREATE TABLE "season_fielding" (
      "player_id" integer NOT NULL,
      "season" integer NOT NULL,
      "pos" varchar(20) NOT NULL,
      "lg_id" varchar(50),
      "g" integer,
      "gs" integer,
      "cg" integer,
      "inn_def" double precision,
      "chances" double precision,
      "po" integer,
      "a" integer,
      "e_def" integer,
      "dp_def" integer,
      "fielding_perc" double precision,
      "range_factor_per_nine" double precision,
      "range_factor_per_game" double precision,
      "fielding_perc_lg" double precision,
      "range_factor_per_nine_lg" double precision,
      "range_factor_per_game_lg" double precision,
      "g_of_parts" integer,
      "sb" integer,
      "cs" integer,
      "caught_stealing_perc" double precision,
      "caught_stealing_perc_lg" double precision,
      "pickoffs" integer,
      "award_summary" text,
      "wp" integer,
      "team" varchar(50) NOT NULL,
      "row_id" varchar(50) NOT NULL,
      CONSTRAINT "season_fielding_pk" PRIMARY KEY("player_id","season","pos","team","row_id")
    );
  `);

  await db.execute(`
    CREATE TABLE "season_pitching" (
      "player_id" integer NOT NULL,
      "season" integer NOT NULL,
      "w" integer,
      "l" integer,
      "win_loss_perc" numeric,
      "earned_run_avg" numeric,
      "g" integer,
      "gs" integer,
      "gf" integer,
      "cg" integer,
      "sho" integer,
      "sv" integer,
      "ip" double precision,
      "h" integer,
      "r" integer,
      "er" integer,
      "hr" integer,
      "bb" integer,
      "ibb" integer,
      "so" integer,
      "hbp" integer,
      "bk" integer,
      "wp" integer,
      "row_id" varchar(50) NOT NULL,
      "batters_faced" integer,
      "earned_run_avg_plus" double precision,
      "fip" double precision,
      "whip" double precision,
      "hits_per_nine" double precision,
      "home_runs_per_nine" double precision,
      "bases_on_balls_per_nine" double precision,
      "strikeouts_per_nine" double precision,
      "strikeouts_per_base_on_balls" double precision,
      "award_summary" text,
      "team" varchar(50) NOT NULL,
      "lg_id" varchar(50),
      "outs_recorded" integer GENERATED ALWAYS AS (((floor(ip) * (3)::double precision) + ((ip - floor(ip)) * (10)::double precision))) STORED,
      CONSTRAINT "season_pitching_pk" PRIMARY KEY("player_id","season","team","row_id")
    );
  `);

  await db.execute(`
    CREATE TABLE "league_scoring_change_log" (
      "id" bigserial PRIMARY KEY NOT NULL,
      "profile_id" integer NOT NULL,
      "stat_definition_id" integer NOT NULL,
      "previous_multiplier" numeric(6, 3),
      "new_multiplier" numeric(6, 3),
      "changed_by" integer,
      "changed_at" timestamp with time zone DEFAULT now() NOT NULL,
      "change_reason" varchar(120),
      "action" "scoring_change_action" NOT NULL
    );
  `);

  await db.execute(`
    CREATE TABLE "league_scoring_profile_entries" (
      "id" serial PRIMARY KEY NOT NULL,
      "profile_id" integer NOT NULL,
      "stat_definition_id" integer NOT NULL,
      "multiplier" numeric(6, 3) NOT NULL,
      "is_enabled" boolean DEFAULT true NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  `);

  await db.execute(`
    CREATE TABLE "league_scoring_profiles" (
      "id" serial PRIMARY KEY NOT NULL,
      "league_id" integer NOT NULL,
      "profile_name" varchar(64) DEFAULT 'Default' NOT NULL,
      "season_year" smallint,
      "status" "scoring_profile_status" DEFAULT 'active' NOT NULL,
      "is_default" boolean DEFAULT false NOT NULL,
      "copied_from_profile_id" integer,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
      "activated_at" timestamp with time zone
    );
  `);

  await db.execute(`
    CREATE TABLE "scoring_stat_definitions" (
      "id" serial PRIMARY KEY NOT NULL,
      "stat_key" varchar(64) NOT NULL,
      "stat_group" "scoring_stat_group" NOT NULL,
      "source_table" varchar(48) NOT NULL,
      "source_column" varchar(48) NOT NULL,
      "display_name" varchar(80) NOT NULL,
      "description" text,
      "default_multiplier" numeric(6, 3) NOT NULL,
      "min_multiplier" numeric(6, 3) NOT NULL,
      "max_multiplier" numeric(6, 3) NOT NULL,
      "step_size" numeric(4, 3) DEFAULT '0.5' NOT NULL,
      "is_required" boolean DEFAULT false NOT NULL,
      "enforce_positive" boolean DEFAULT false NOT NULL,
      "enforce_negative" boolean DEFAULT false NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  `);

  await db.execute(`
    CREATE TABLE "app_internal"."users" (
      "id" serial PRIMARY KEY NOT NULL,
      "username" varchar(50),
      "email" varchar(100) NOT NULL,
      "password_hash" char(128),
      "access_level" "app_internal"."access_level" DEFAULT 'none',
      CONSTRAINT "users_username_uk" UNIQUE("username"),
      CONSTRAINT "users_email_uk" UNIQUE("email")
    );
  `);

  // Add foreign keys
  await db.execute(
    `ALTER TABLE "draft_teams" ADD CONSTRAINT "draft_teams_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE no action ON UPDATE no action;`,
  );
  await db.execute(
    `ALTER TABLE "draft_teams" ADD CONSTRAINT "draft_teams_teams_id_league_id_fk" FOREIGN KEY ("team_id","league_id") REFERENCES "public"."teams"("id","league_id") ON DELETE no action ON UPDATE no action;`,
  );
  await db.execute(
    `ALTER TABLE "drafts" ADD CONSTRAINT "drafts_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;`,
  );
  await db.execute(
    `ALTER TABLE "league_members" ADD CONSTRAINT "league_members_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;`,
  );
  await db.execute(
    `ALTER TABLE "league_messages" ADD CONSTRAINT "league_messages_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;`,
  );
  await db.execute(
    `ALTER TABLE "league_positions" ADD CONSTRAINT "league_position_league_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;`,
  );
  await db.execute(
    `ALTER TABLE "team_members" ADD CONSTRAINT "team_members_teams_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;`,
  );
  await db.execute(
    `ALTER TABLE "team_members" ADD CONSTRAINT "team_members_league_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;`,
  );
  await db.execute(
    `ALTER TABLE "team_members" ADD CONSTRAINT "team_members_players_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;`,
  );
  await db.execute(
    `ALTER TABLE "team_members" ADD CONSTRAINT "team_members_position_fk" FOREIGN KEY ("position_id") REFERENCES "public"."league_positions"("id") ON DELETE no action ON UPDATE no action;`,
  );
  await db.execute(
    `ALTER TABLE "teams" ADD CONSTRAINT "teams_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;`,
  );
  await db.execute(
    `ALTER TABLE "matchup_player_games" ADD CONSTRAINT "matchup_player_games_matchup_player_fk" FOREIGN KEY ("matchup_player_id") REFERENCES "public"."matchup_players"("id") ON DELETE no action ON UPDATE no action;`,
  );
  await db.execute(
    `ALTER TABLE "matchup_players" ADD CONSTRAINT "matchup_players_matchup_fk" FOREIGN KEY ("matchup_id") REFERENCES "public"."matchups"("id") ON DELETE no action ON UPDATE no action;`,
  );
  await db.execute(
    `ALTER TABLE "matchup_players" ADD CONSTRAINT "matchup_players_player_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;`,
  );
  await db.execute(
    `ALTER TABLE "matchups" ADD CONSTRAINT "matchups_league_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;`,
  );
  await db.execute(
    `ALTER TABLE "season_batting" ADD CONSTRAINT "season_batting_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;`,
  );
  await db.execute(
    `ALTER TABLE "season_fielding" ADD CONSTRAINT "season_fielding_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;`,
  );
  await db.execute(
    `ALTER TABLE "season_pitching" ADD CONSTRAINT "season_pitching_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;`,
  );
  await db.execute(
    `ALTER TABLE "league_scoring_change_log" ADD CONSTRAINT "league_scoring_change_log_profile_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."league_scoring_profiles"("id") ON DELETE no action ON UPDATE no action;`,
  );
  await db.execute(
    `ALTER TABLE "league_scoring_change_log" ADD CONSTRAINT "league_scoring_change_log_stat_fk" FOREIGN KEY ("stat_definition_id") REFERENCES "public"."scoring_stat_definitions"("id") ON DELETE no action ON UPDATE no action;`,
  );
  await db.execute(
    `ALTER TABLE "league_scoring_profile_entries" ADD CONSTRAINT "league_scoring_profile_entries_profile_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."league_scoring_profiles"("id") ON DELETE no action ON UPDATE no action;`,
  );
  await db.execute(
    `ALTER TABLE "league_scoring_profile_entries" ADD CONSTRAINT "league_scoring_profile_entries_stat_fk" FOREIGN KEY ("stat_definition_id") REFERENCES "public"."scoring_stat_definitions"("id") ON DELETE no action ON UPDATE no action;`,
  );
  await db.execute(
    `ALTER TABLE "league_scoring_profiles" ADD CONSTRAINT "league_scoring_profiles_league_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;`,
  );
  await db.execute(
    `ALTER TABLE "league_scoring_profiles" ADD CONSTRAINT "league_scoring_profiles_copied_from_fk" FOREIGN KEY ("copied_from_profile_id") REFERENCES "public"."league_scoring_profiles"("id") ON DELETE no action ON UPDATE no action;`,
  );

  // Create indexes
  await db.execute(
    `CREATE INDEX "league_messages_league_id_index" ON "league_messages" USING btree ("league_id");`,
  );
  await db.execute(
    `CREATE INDEX "league_messages_league_id_timestamp_index" ON "league_messages" USING btree ("league_id","timestamp");`,
  );
  await db.execute(
    `CREATE INDEX "leagues_invite_code_idx" ON "leagues" USING btree ("invite_code");`,
  );
  await db.execute(
    `CREATE INDEX "season_batting_hr_index" ON "season_batting" USING btree ("hr");`,
  );
  await db.execute(
    `CREATE INDEX "season_batting_player_id_index" ON "season_batting" USING btree ("player_id");`,
  );
  await db.execute(
    `CREATE INDEX "season_fielding_player_id_index" ON "season_fielding" USING btree ("player_id");`,
  );
  await db.execute(
    `CREATE INDEX "season_fielding_player_id_pos_index" ON "season_fielding" USING btree ("player_id","pos");`,
  );
  await db.execute(
    `CREATE INDEX "season_fielding_po_index" ON "season_fielding" USING btree ("po");`,
  );
  await db.execute(
    `CREATE INDEX "season_pitching_player_id_index" ON "season_pitching" USING btree ("player_id");`,
  );
  await db.execute(
    `CREATE INDEX "season_pitching_w_index" ON "season_pitching" USING btree ("w");`,
  );
  await db.execute(
    `CREATE INDEX "league_scoring_change_log_profile_idx" ON "league_scoring_change_log" USING btree ("profile_id");`,
  );
  await db.execute(
    `CREATE INDEX "league_scoring_change_log_stat_idx" ON "league_scoring_change_log" USING btree ("stat_definition_id");`,
  );
  await db.execute(
    `CREATE INDEX "league_scoring_change_log_action_idx" ON "league_scoring_change_log" USING btree ("action");`,
  );
  await db.execute(
    `CREATE UNIQUE INDEX "league_scoring_profile_entries_unique" ON "league_scoring_profile_entries" USING btree ("profile_id","stat_definition_id");`,
  );
  await db.execute(
    `CREATE INDEX "league_scoring_profiles_league_idx" ON "league_scoring_profiles" USING btree ("league_id");`,
  );
  await db.execute(
    `CREATE UNIQUE INDEX "league_scoring_profiles_unique_default" ON "league_scoring_profiles" USING btree ("league_id") WHERE "league_scoring_profiles"."is_default" = true;`,
  );
  await db.execute(
    `CREATE UNIQUE INDEX "scoring_stat_definitions_stat_key_unique" ON "scoring_stat_definitions" USING btree ("stat_key");`,
  );
  await db.execute(
    `CREATE INDEX "scoring_stat_definitions_group_idx" ON "scoring_stat_definitions" USING btree ("stat_group");`,
  );
  await db.execute(
    `CREATE INDEX "users__index" ON "app_internal"."users" USING btree ("username");`,
  );
  await db.execute(
    `CREATE INDEX "users_email_index" ON "app_internal"."users" USING btree ("email");`,
  );

  // Create views - must be in dependency order
  // First create empty aggregate views
  await db.execute(
    `CREATE VIEW "public"."aggregate_season_batting" AS SELECT null WHERE false;`,
  );
  await db.execute(
    `CREATE VIEW "public"."aggregate_season_fielding" AS SELECT null WHERE false;`,
  );
  await db.execute(
    `CREATE VIEW "public"."aggregate_season_fielding_by_pos" AS SELECT null WHERE false;`,
  );
  await db.execute(
    `CREATE VIEW "public"."aggregate_season_pitching" AS SELECT null WHERE false;`,
  );

  await db.execute(`
    CREATE VIEW "public"."career_batting" AS (
      SELECT player_id,
        sum(g) AS g, sum(pa) AS pa, sum(ab) AS ab, sum(r) AS r, sum(h) AS h,
        sum(doubles) AS doubles, sum(triples) AS triples, sum(hr) AS hr, sum(rbi) AS rbi,
        sum(sb) AS sb, sum(cs) AS cs, sum(bb) AS bb, sum(so) AS so, sum(tb) AS tb,
        sum(gidp) AS gidp, sum(hbp) AS hbp, sum(sh) AS sh, sum(ibb) AS ibb
      FROM season_batting
      WHERE ((SELECT count(1) AS count
              FROM regexp_split_to_table(season_batting.lg_id::text, ','::text)
              WHERE season_batting.lg_id::text = ANY (ARRAY ['AL'::character varying::text, 'NL'::character varying::text]))) > 0
      GROUP BY player_id
    );
  `);

  await db.execute(`
    CREATE VIEW "public"."career_fielding" AS (
      SELECT 
        cf.player_id, cf.g, cf.gs, cf.cg, cf.inn_def, cf.chances, cf.po, cf.a, cf.e_def, cf.dp_def,
        cf.sb, cf.cs, cf.pickoffs, cf.wp, NULL::text AS pos,
        COALESCE(
          jsonb_object_agg(
            pos_agg.pos, 
            jsonb_build_object('games', pos_agg.g, 'gamesStarted', pos_agg.gs, 'position', pos_agg.pos)
          ) FILTER (WHERE pos_agg.pos IS NOT NULL),
          '{}'::jsonb
        ) AS positions_played
      FROM (
        SELECT player_id,
          sum(g) AS g, sum(gs) AS gs, sum(cg) AS cg, sum(inn_def) AS inn_def, sum(chances) AS chances,
          sum(po) AS po, sum(a) AS a, sum(e_def) AS e_def, sum(dp_def) AS dp_def,
          sum(sb) AS sb, sum(cs) AS cs, sum(pickoffs) AS pickoffs, sum(wp) AS wp
        FROM season_fielding
        WHERE ((SELECT count(1) AS count
                FROM regexp_split_to_table(season_fielding.lg_id::text, ','::text)
                WHERE season_fielding.lg_id::text = ANY (ARRAY ['AL'::character varying::text, 'NL'::character varying::text]))) > 0
        GROUP BY player_id
      ) cf
      LEFT JOIN (
        SELECT player_id, pos, sum(g) AS g, sum(gs) AS gs
        FROM season_fielding
        WHERE ((SELECT count(1) AS count
                FROM regexp_split_to_table(season_fielding.lg_id::text, ','::text)
                WHERE season_fielding.lg_id::text = ANY (ARRAY ['AL'::character varying::text, 'NL'::character varying::text]))) > 0
        GROUP BY player_id, pos
      ) pos_agg ON cf.player_id = pos_agg.player_id
      GROUP BY cf.player_id, cf.g, cf.gs, cf.cg, cf.inn_def, cf.chances, cf.po, cf.a, cf.e_def, cf.dp_def, cf.sb, cf.cs, cf.pickoffs, cf.wp
    );
  `);

  await db.execute(`
    CREATE VIEW "public"."career_fielding_by_position" AS (
      SELECT player_id, pos,
        sum(g) AS g, sum(gs) AS gs, sum(cg) AS cg, sum(inn_def) AS inn_def, sum(chances) AS chances,
        sum(po) AS po, sum(a) AS a, sum(e_def) AS e_def, sum(dp_def) AS dp_def,
        sum(sb) AS sb, sum(cs) AS cs, sum(pickoffs) AS pickoffs, sum(wp) AS wp
      FROM season_fielding
      WHERE ((SELECT count(1) AS count
              FROM regexp_split_to_table(season_fielding.lg_id::text, ','::text)
              WHERE season_fielding.lg_id::text = ANY (ARRAY ['AL'::character varying::text, 'NL'::character varying::text]))) > 0
      GROUP BY player_id, pos
    );
  `);

  await db.execute(`
    CREATE VIEW "public"."career_pitching" AS (
      SELECT player_id, w, l, g, gs, gf, cg, sho, sv, h, r, er, hr, bb, ibb, so, hbp, bk, wp,
        batters_faced, outs_recorded, out_rate, era
      FROM (
        SELECT season_pitching.player_id,
          sum(season_pitching.w) AS w, sum(season_pitching.l) AS l, sum(season_pitching.g) AS g,
          sum(season_pitching.gs) AS gs, sum(season_pitching.gf) AS gf, sum(season_pitching.cg) AS cg,
          sum(season_pitching.sho) AS sho, sum(season_pitching.sv) AS sv, sum(season_pitching.h) AS h,
          sum(season_pitching.r) AS r, sum(season_pitching.er) AS er, sum(season_pitching.hr) AS hr,
          sum(season_pitching.bb) AS bb, sum(season_pitching.ibb) AS ibb, sum(season_pitching.so) AS so,
          sum(season_pitching.hbp) AS hbp, sum(season_pitching.bk) AS bk, sum(season_pitching.wp) AS wp,
          sum(season_pitching.batters_faced) AS batters_faced, sum(season_pitching.outs_recorded) AS outs_recorded,
          sum(season_pitching.outs_recorded) / CASE sum(season_pitching.batters_faced) WHEN 0 THEN 1::bigint ELSE sum(season_pitching.batters_faced) END AS out_rate,
          sum(season_pitching.er)::numeric / CASE sum(season_pitching.outs_recorded) WHEN 0 THEN 1::bigint::numeric ELSE sum(season_pitching.outs_recorded)::numeric / 27.0 END AS era
        FROM season_pitching
        WHERE ((SELECT count(1) AS count
                FROM regexp_split_to_table(season_pitching.lg_id::text, ','::text)
                WHERE season_pitching.lg_id::text = ANY (ARRAY ['AL'::character varying::text, 'NL'::character varying::text]))) > 0
        GROUP BY season_pitching.player_id
      ) unnamed_subquery
    );
  `);

  await db.execute(`
    CREATE VIEW "public"."users" AS (
      SELECT id, email, username, access_level::character varying::access_level AS access_level
      FROM app_internal.users
    );
  `);

  // Create player_eligible_positions view last (depends on career views)
  await db.execute(`
    CREATE VIEW "public"."player_eligible_positions" AS (
      SELECT player_id, pos AS position
      FROM career_fielding_by_position
      WHERE g > 50 AND POS != 'P'
      UNION
      SELECT player_id, 'SP' AS position
      FROM career_pitching
      WHERE gs > 50
      UNION
      SELECT player_id, 'RP' AS position
      FROM career_pitching
      WHERE g - gs > 50
    );
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  // Drop views
  await db.execute(`DROP VIEW IF EXISTS "public"."users" CASCADE;`);
  await db.execute(`DROP VIEW IF EXISTS "public"."career_pitching" CASCADE;`);
  await db.execute(
    `DROP VIEW IF EXISTS "public"."career_fielding_by_position" CASCADE;`,
  );
  await db.execute(`DROP VIEW IF EXISTS "public"."career_fielding" CASCADE;`);
  await db.execute(`DROP VIEW IF EXISTS "public"."career_batting" CASCADE;`);
  await db.execute(
    `DROP VIEW IF EXISTS "public"."aggregate_season_pitching" CASCADE;`,
  );
  await db.execute(
    `DROP VIEW IF EXISTS "public"."aggregate_season_fielding_by_pos" CASCADE;`,
  );
  await db.execute(
    `DROP VIEW IF EXISTS "public"."aggregate_season_fielding" CASCADE;`,
  );
  await db.execute(
    `DROP VIEW IF EXISTS "public"."aggregate_season_batting" CASCADE;`,
  );
  await db.execute(
    `DROP VIEW IF EXISTS "public"."player_eligible_positions" CASCADE;`,
  );

  // Drop tables (in reverse order to respect foreign keys)
  await db.execute(`DROP TABLE IF EXISTS "app_internal"."users" CASCADE;`);
  await db.execute(`DROP TABLE IF EXISTS "scoring_stat_definitions" CASCADE;`);
  await db.execute(`DROP TABLE IF EXISTS "league_scoring_profiles" CASCADE;`);
  await db.execute(
    `DROP TABLE IF EXISTS "league_scoring_profile_entries" CASCADE;`,
  );
  await db.execute(`DROP TABLE IF EXISTS "league_scoring_change_log" CASCADE;`);
  await db.execute(`DROP TABLE IF EXISTS "season_pitching" CASCADE;`);
  await db.execute(`DROP TABLE IF EXISTS "season_fielding" CASCADE;`);
  await db.execute(`DROP TABLE IF EXISTS "season_batting" CASCADE;`);
  await db.execute(`DROP TABLE IF EXISTS "game_pitching" CASCADE;`);
  await db.execute(`DROP TABLE IF EXISTS "game_fielding" CASCADE;`);
  await db.execute(`DROP TABLE IF EXISTS "game_batting" CASCADE;`);
  await db.execute(`DROP TABLE IF EXISTS "players" CASCADE;`);
  await db.execute(`DROP TABLE IF EXISTS "matchups" CASCADE;`);
  await db.execute(`DROP TABLE IF EXISTS "matchup_players" CASCADE;`);
  await db.execute(`DROP TABLE IF EXISTS "matchup_player_games" CASCADE;`);
  await db.execute(`DROP TABLE IF EXISTS "teams" CASCADE;`);
  await db.execute(`DROP TABLE IF EXISTS "team_members" CASCADE;`);
  await db.execute(`DROP TABLE IF EXISTS "leagues" CASCADE;`);
  await db.execute(`DROP TABLE IF EXISTS "league_positions" CASCADE;`);
  await db.execute(`DROP TABLE IF EXISTS "league_messages" CASCADE;`);
  await db.execute(`DROP TABLE IF EXISTS "league_members" CASCADE;`);
  await db.execute(`DROP TABLE IF EXISTS "drafts" CASCADE;`);
  await db.execute(`DROP TABLE IF EXISTS "draft_teams" CASCADE;`);

  // Drop enums
  await db.execute(
    `DROP TYPE IF EXISTS "app_internal"."access_level" CASCADE;`,
  );
  await db.execute(
    `DROP TYPE IF EXISTS "public"."scoring_stat_group" CASCADE;`,
  );
  await db.execute(
    `DROP TYPE IF EXISTS "public"."scoring_profile_status" CASCADE;`,
  );
  await db.execute(
    `DROP TYPE IF EXISTS "public"."scoring_change_action" CASCADE;`,
  );
  await db.execute(`DROP TYPE IF EXISTS "public"."position_slot" CASCADE;`);
  await db.execute(`DROP TYPE IF EXISTS "public"."player_position" CASCADE;`);
  await db.execute(
    `DROP TYPE IF EXISTS "public"."league_permission_level" CASCADE;`,
  );
  await db.execute(`DROP TYPE IF EXISTS "public"."draft_type" CASCADE;`);
  await db.execute(`DROP TYPE IF EXISTS "public"."draft_status" CASCADE;`);
  await db.execute(`DROP TYPE IF EXISTS "public"."draft_order" CASCADE;`);
  await db.execute(`DROP TYPE IF EXISTS "public"."access_level" CASCADE;`);

  // Drop schema
  await db.execute(`DROP SCHEMA IF EXISTS "app_internal" CASCADE;`);
};
