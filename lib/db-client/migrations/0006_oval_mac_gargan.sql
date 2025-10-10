DO $$ BEGIN
 CREATE TYPE "public"."draft_status" AS ENUM('not-started', 'queued', 'in-progress', 'completed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "draft_status" "draft_status" DEFAULT 'not-started' NOT NULL;