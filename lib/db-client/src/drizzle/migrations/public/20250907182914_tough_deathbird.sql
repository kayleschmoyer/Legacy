DO $$ BEGIN
 CREATE TYPE "public"."access_level" AS ENUM('none', 'admin');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."draft_order" AS ENUM('snake', 'normal');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."draft_type" AS ENUM('blind', 'normal', 'legacy');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."league_permission_level" AS ENUM('owner', 'commissioner');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."player_position" AS ENUM('SP', 'RP', 'C', '1B', '2B', '3B', 'SS', 'RF', 'LF', 'CF', 'DH');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."position_slot" AS ENUM('SP', 'RP', 'C', '1B', '2B', '3B', 'SS', 'RF', 'LF', 'CF', 'DH', 'XDH', 'OF', 'IF');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "draft_teams" (
	"draft_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"league_id" integer NOT NULL,
	"draft_order" integer NOT NULL,
	CONSTRAINT "draft_teams_pk" PRIMARY KEY("draft_id","team_id","league_id"),
	CONSTRAINT "draft_teams_uk_order" UNIQUE("draft_id","draft_order")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drafts" (
	"id" serial PRIMARY KEY NOT NULL,
	"league_id" integer NOT NULL,
	"draft_type" "draft_type" NOT NULL,
	"date" date,
	"draft_order" "draft_order" DEFAULT 'snake' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "league_members" (
	"league_id" integer NOT NULL,
	"team_id" integer,
	"permission_level" "league_permission_level" NOT NULL,
	"user_id" integer NOT NULL,
	CONSTRAINT "league_members_pk" PRIMARY KEY("league_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "league_messages" (
	"league_id" integer NOT NULL,
	"message_text" varchar NOT NULL,
	"timestamp" timestamp DEFAULT now(),
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "league_positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"league_id" integer NOT NULL,
	"position_type" "position_slot" NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leagues" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"owner" integer NOT NULL,
	"max_roster_size" integer DEFAULT 25 NOT NULL,
	"current_matchup" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer,
	"league_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"position_id" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"league_id" integer NOT NULL,
	CONSTRAINT "teams_uk_id_league_id" UNIQUE("id","league_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "matchup_player_games" (
	"id" serial PRIMARY KEY NOT NULL,
	"matchup_player_id" integer NOT NULL,
	"game_num" integer NOT NULL,
	"batting_game_num" integer,
	"fielding_game_num" integer,
	"pitching_game_num" integer,
	"fielding_game_pos" char(2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "matchup_players" (
	"id" serial PRIMARY KEY NOT NULL,
	"matchup_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"season" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "matchups" (
	"id" serial PRIMARY KEY NOT NULL,
	"league_id" integer NOT NULL,
	"week_number" integer NOT NULL,
	CONSTRAINT "matchups_league_id_week_number_unique" UNIQUE("league_id","week_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "players" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"bref_id" varchar(10) NOT NULL,
	CONSTRAINT "players_uk_bref_id" UNIQUE("bref_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "game_batting" (
	"player_id" integer NOT NULL,
	"season" integer NOT NULL,
	"game_number" integer NOT NULL,
	"game_identifier" char(12) NOT NULL,
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
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "game_fielding" (
	"player_id" integer NOT NULL,
	"season" integer NOT NULL,
	"game_num" integer NOT NULL,
	"game_identifier" char(12) NOT NULL,
	"inn_def" double precision,
	"chances" double precision,
	"po" integer,
	"a" integer,
	"e_def" integer,
	"dp_def" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "game_pitching" (
	"player_id" integer NOT NULL,
	"season" integer NOT NULL,
	"game_num" integer NOT NULL,
	"game_identifier" char(12) NOT NULL,
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
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "season_batting" (
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
	"sf" varchar(10),
	"ibb" integer,
	"pos_season" varchar(50),
	"award_summary" text,
	"lg_id" varchar(20),
	"team" varchar(20) NOT NULL,
	"row_id" varchar(10) NOT NULL,
	CONSTRAINT "season_batting_pk" PRIMARY KEY("player_id","season","team","row_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "season_fielding" (
	"player_id" integer NOT NULL,
	"season" integer NOT NULL,
	"pos" varchar(10) NOT NULL,
	"lg_id" varchar(20),
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
	"team" varchar(20) NOT NULL,
	"row_id" varchar(10) NOT NULL,
	CONSTRAINT "season_fielding_pk" PRIMARY KEY("player_id","season","pos","team","row_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "season_pitching" (
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
	"row_id" varchar(10) NOT NULL,
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
	"team" varchar(20) NOT NULL,
	"lg_id" varchar(20),
	"outs_recorded" integer GENERATED ALWAYS AS (((floor(ip) * (3)::double precision) + ((ip - floor(ip)) * (10)::double precision))) STORED,
	CONSTRAINT "season_pitching_pk" PRIMARY KEY("player_id","season","team","row_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "draft_teams" ADD CONSTRAINT "draft_teams_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "draft_teams" ADD CONSTRAINT "draft_teams_teams_id_league_id_fk" FOREIGN KEY ("team_id","league_id") REFERENCES "public"."teams"("id","league_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drafts" ADD CONSTRAINT "drafts_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "league_members" ADD CONSTRAINT "league_members_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "league_messages" ADD CONSTRAINT "league_messages_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "league_positions" ADD CONSTRAINT "league_position_league_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_members" ADD CONSTRAINT "team_members_teams_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_members" ADD CONSTRAINT "team_members_league_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_members" ADD CONSTRAINT "team_members_players_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_members" ADD CONSTRAINT "team_members_position_fk" FOREIGN KEY ("position_id") REFERENCES "public"."league_positions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teams" ADD CONSTRAINT "teams_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "matchup_player_games" ADD CONSTRAINT "matchup_player_games_matchup_player_fk" FOREIGN KEY ("matchup_player_id") REFERENCES "public"."matchup_players"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "matchup_players" ADD CONSTRAINT "matchup_players_matchup_fk" FOREIGN KEY ("matchup_id") REFERENCES "public"."matchups"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "matchup_players" ADD CONSTRAINT "matchup_players_player_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "matchups" ADD CONSTRAINT "matchups_league_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "season_batting" ADD CONSTRAINT "season_batting_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "season_fielding" ADD CONSTRAINT "season_fielding_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "season_pitching" ADD CONSTRAINT "season_pitching_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "league_messages_league_id_index" ON "league_messages" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "league_messages_league_id_timestamp_index" ON "league_messages" USING btree ("league_id","timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "season_batting_hr_index" ON "season_batting" USING btree ("hr");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "season_batting_player_id_index" ON "season_batting" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "season_fielding_player_id_index" ON "season_fielding" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "season_fielding_player_id_pos_index" ON "season_fielding" USING btree ("player_id","pos");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "season_fielding_po_index" ON "season_fielding" USING btree ("po");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "season_pitching_player_id_index" ON "season_pitching" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "season_pitching_w_index" ON "season_pitching" USING btree ("w");