import { type PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Restructure draft and league configurations
 *
 * Changes to drafts table:
 * - REMOVE: draft_type column (was: 'blind', 'normal', 'legacy', 'random-draft')
 * - ADD: draft_mode enum column ('live', 'automated')
 * - ADD: selection_method enum column ('standard', 'auction', 'random')
 * - UPDATE: draft_order enum values ('snake', 'linear' instead of 'snake', 'normal')
 *
 * Changes to leagues table:
 * - ADD: player_pool enum column ('all', 'nl', 'al')
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // Step 1: Create new enum types (idempotent)
  await db.execute(`
    DO $$ BEGIN CREATE TYPE "public"."draft_mode" AS ENUM('live', 'automated');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  await db.execute(`
    DO $$ BEGIN CREATE TYPE "public"."selection_method" AS ENUM('standard', 'auction', 'random');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  await db.execute(`
    DO $$ BEGIN CREATE TYPE "public"."player_pool" AS ENUM('all', 'nl', 'al');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  // Step 2: Add new columns to drafts table (idempotent)
  await db.execute(`
    ALTER TABLE drafts
    ADD COLUMN IF NOT EXISTS draft_mode draft_mode,
    ADD COLUMN IF NOT EXISTS selection_method selection_method;
  `);

  // Step 3: Migrate existing draft_type data (only if draft_type column still exists)
  await db.execute(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'drafts' AND column_name = 'draft_type'
      ) THEN
        UPDATE drafts SET
          draft_mode = CASE
            WHEN draft_type::text IN ('normal', 'legacy') THEN 'live'::draft_mode
            WHEN draft_type::text IN ('blind', 'random-draft') THEN 'automated'::draft_mode
            ELSE 'live'::draft_mode
          END,
          selection_method = CASE
            WHEN draft_type::text IN ('normal', 'legacy') THEN 'standard'::selection_method
            WHEN draft_type::text IN ('blind', 'random-draft') THEN 'random'::selection_method
            ELSE 'standard'::selection_method
          END;
      END IF;
    END $$;
  `);

  // Step 4: Make new columns NOT NULL
  await db.execute(`
    ALTER TABLE drafts
    ALTER COLUMN draft_mode SET NOT NULL,
    ALTER COLUMN selection_method SET NOT NULL;
  `);

  // Step 5: Ensure draft_order has 'linear'; migrate data if 'normal' still present
  // Note: ALTER TYPE ADD VALUE cannot run inside a transaction; Drizzle runs each
  // db.execute() in its own implicit statement, which satisfies this requirement.
  await db.execute(
    `ALTER TYPE "public"."draft_order" ADD VALUE IF NOT EXISTS 'linear';`,
  );

  await db.execute(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'draft_order' AND e.enumlabel = 'normal'
      ) THEN
        UPDATE drafts SET draft_order = 'linear'::draft_order
        WHERE draft_order::text = 'normal';
      END IF;
    END $$;
  `);

  // Step 6: Drop any orphaned draft_order_new left from a previous partial run
  await db.execute(`DROP TYPE IF EXISTS "public"."draft_order_new";`);

  // Step 7: Drop old draft_type column and enum (idempotent)
  await db.execute(`ALTER TABLE drafts DROP COLUMN IF EXISTS draft_type;`);
  await db.execute(`DROP TYPE IF EXISTS "public"."draft_type";`);

  // Step 8: Add player_pool to leagues table (idempotent)
  await db.execute(`
    ALTER TABLE leagues
    ADD COLUMN IF NOT EXISTS player_pool player_pool NOT NULL DEFAULT 'all';
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // Step 1: Recreate draft_type enum and column (idempotent)
  await db.execute(`
    DO $$ BEGIN CREATE TYPE "public"."draft_type" AS ENUM('blind', 'normal', 'legacy', 'random-draft');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  await db.execute(
    `ALTER TABLE drafts ADD COLUMN IF NOT EXISTS draft_type draft_type;`,
  );

  // Step 2: Migrate data back from new columns to draft_type
  await db.execute(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'drafts' AND column_name = 'draft_mode'
      ) THEN
        UPDATE drafts SET draft_type = CASE
          WHEN draft_mode::text = 'live' AND selection_method::text IN ('standard', 'auction') THEN 'normal'::draft_type
          WHEN draft_mode::text = 'automated' AND selection_method::text = 'random' THEN 'random-draft'::draft_type
          ELSE 'normal'::draft_type
        END;
      END IF;
    END $$;
  `);

  await db.execute(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'drafts' AND column_name = 'draft_type'
      ) THEN
        ALTER TABLE drafts ALTER COLUMN draft_type SET NOT NULL;
      END IF;
    END $$;
  `);

  // Step 3: Restore 'normal' to draft_order enum and migrate data back
  await db.execute(
    `ALTER TYPE "public"."draft_order" ADD VALUE IF NOT EXISTS 'normal';`,
  );

  await db.execute(`
    DO $$ BEGIN
      UPDATE drafts SET draft_order = 'normal'::draft_order
      WHERE draft_order::text = 'linear';
    END $$;
  `);

  // Step 4: Drop columns added by up (idempotent)
  await db.execute(`
    ALTER TABLE drafts
    DROP COLUMN IF EXISTS draft_mode,
    DROP COLUMN IF EXISTS selection_method;
  `);

  await db.execute(`ALTER TABLE leagues DROP COLUMN IF EXISTS player_pool;`);

  // Step 5: Drop enum types added by up (idempotent)
  await db.execute(`DROP TYPE IF EXISTS "public"."draft_mode";`);
  await db.execute(`DROP TYPE IF EXISTS "public"."selection_method";`);
  await db.execute(`DROP TYPE IF EXISTS "public"."player_pool";`);
  await db.execute(`DROP TYPE IF EXISTS "public"."draft_order_new";`);
};
