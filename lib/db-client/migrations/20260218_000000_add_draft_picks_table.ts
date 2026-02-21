/**
 * Migration: Add draft_picks table and extend drafts functionality
 * Date: 2026-02-18
 *
 * This migration adds support for tracking individual draft picks, including:
 * - draft_picks table to record each pick made during a draft
 * - current_pick tracking in drafts table
 * - draft_started_at and draft_completed_at timestamps
 * - Support for round and pick number tracking
 */

import { type PgDatabase } from 'drizzle-orm/pg-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // Add current_pick, draft_started_at, and draft_completed_at to drafts table
  await db.execute(`
    ALTER TABLE "drafts"
    ADD COLUMN IF NOT EXISTS "current_pick" integer DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS "draft_started_at" timestamp with time zone,
    ADD COLUMN IF NOT EXISTS "draft_completed_at" timestamp with time zone;
  `);

  // Create draft_picks table to track each pick made during a draft
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "draft_picks" (
      "id" serial PRIMARY KEY NOT NULL,
      "draft_id" integer NOT NULL,
      "team_id" integer NOT NULL,
      "player_id" integer NOT NULL,
      "round" integer NOT NULL,
      "pick_number" integer NOT NULL,
      "overall_pick" integer NOT NULL,
      "picked_at" timestamp with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "draft_picks_uk_draft_overall" UNIQUE("draft_id", "overall_pick"),
      CONSTRAINT "draft_picks_uk_draft_player" UNIQUE("draft_id", "player_id")
    );
  `);

  // Add foreign keys (IF NOT EXISTS via exception handling for idempotency)
  await db.execute(`
    DO $$ BEGIN
      ALTER TABLE "draft_picks"
      ADD CONSTRAINT "draft_picks_drafts_id_fk"
      FOREIGN KEY ("draft_id") REFERENCES "drafts"("id") ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await db.execute(`
    DO $$ BEGIN
      ALTER TABLE "draft_picks"
      ADD CONSTRAINT "draft_picks_teams_id_fk"
      FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE NO ACTION;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await db.execute(`
    DO $$ BEGIN
      ALTER TABLE "draft_picks"
      ADD CONSTRAINT "draft_picks_players_id_fk"
      FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE NO ACTION;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // Add indexes for performance
  await db.execute(`
    CREATE INDEX IF NOT EXISTS "draft_picks_draft_id_idx" ON "draft_picks" ("draft_id");
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "draft_picks_team_id_idx" ON "draft_picks" ("team_id");
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "draft_picks_player_id_idx" ON "draft_picks" ("player_id");
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "draft_picks_overall_pick_idx" ON "draft_picks" ("draft_id", "overall_pick");
  `);

  // Add trigger for updated_at
  await db.execute(`
    DROP TRIGGER IF EXISTS "draft_picks_updated_at_trigger" ON public."draft_picks";
  `);

  await db.execute(`
    CREATE TRIGGER "draft_picks_updated_at_trigger"
    BEFORE UPDATE ON public."draft_picks"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  // Optionally extend team_members to track draft information
  await db.execute(`
    ALTER TABLE "team_members"
    ADD COLUMN IF NOT EXISTS "draft_round" integer,
    ADD COLUMN IF NOT EXISTS "draft_pick" integer,
    ADD COLUMN IF NOT EXISTS "acquisition_type" varchar(20) DEFAULT 'draft';
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "team_members_draft_info_idx" 
    ON "team_members" ("draft_round", "draft_pick") 
    WHERE "draft_round" IS NOT NULL;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // Drop team_members columns
  await db.execute(`
    DROP INDEX IF EXISTS "team_members_draft_info_idx";
  `);

  await db.execute(`
    ALTER TABLE "team_members"
    DROP COLUMN IF EXISTS "draft_round",
    DROP COLUMN IF EXISTS "draft_pick",
    DROP COLUMN IF EXISTS "acquisition_type";
  `);

  // Drop draft_picks table and related objects
  await db.execute(
    `DROP TRIGGER IF EXISTS "draft_picks_updated_at_trigger" ON public."draft_picks";`,
  );
  await db.execute(`DROP INDEX IF EXISTS "draft_picks_overall_pick_idx";`);
  await db.execute(`DROP INDEX IF EXISTS "draft_picks_player_id_idx";`);
  await db.execute(`DROP INDEX IF EXISTS "draft_picks_team_id_idx";`);
  await db.execute(`DROP INDEX IF EXISTS "draft_picks_draft_id_idx";`);
  await db.execute(`DROP TABLE IF EXISTS "draft_picks";`);

  // Drop columns from drafts table
  await db.execute(`
    ALTER TABLE "drafts"
    DROP COLUMN IF EXISTS "current_pick",
    DROP COLUMN IF EXISTS "draft_started_at",
    DROP COLUMN IF EXISTS "draft_completed_at";
  `);
};
