-- Add the new columns as nullable first
ALTER TABLE "players" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "last_name" text;--> statement-breakpoint

-- Migrate existing data by splitting the name field
UPDATE "players" 
SET 
    "first_name" = CASE 
        WHEN POSITION(' ' IN name) > 0 
        THEN TRIM(SUBSTRING(name FROM 1 FOR POSITION(' ' IN name) - 1))
        ELSE name
    END,
    "last_name" = CASE 
        WHEN POSITION(' ' IN name) > 0 
        THEN TRIM(SUBSTRING(name FROM POSITION(' ' IN name) + 1))
        ELSE ''
    END
WHERE name IS NOT NULL;--> statement-breakpoint

-- Set NOT NULL constraints after data migration
ALTER TABLE "players" ALTER COLUMN "first_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ALTER COLUMN "last_name" SET NOT NULL;--> statement-breakpoint

-- Drop the old name column
ALTER TABLE "players" DROP COLUMN IF EXISTS "name";