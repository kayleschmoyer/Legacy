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
  // Step 1: Create new enum types
  await db.execute(
    `CREATE TYPE "public"."draft_mode" AS ENUM('live', 'automated');`,
  );
  await db.execute(
    `CREATE TYPE "public"."selection_method" AS ENUM('standard', 'auction', 'random');`,
  );
  await db.execute(
    `CREATE TYPE "public"."player_pool" AS ENUM('all', 'nl', 'al');`,
  );
  await db.execute(
    `CREATE TYPE "public"."draft_order_new" AS ENUM('snake', 'linear');`,
  );

  // Step 2: Add new columns to drafts table with defaults
  await db.execute(`
    ALTER TABLE drafts 
    ADD COLUMN draft_mode draft_mode,
    ADD COLUMN selection_method selection_method;
  `);

  // Step 3: Migrate existing draft_type data to new columns
  // Mapping logic:
  // 'normal' -> draft_mode='live', selection_method='standard'
  // 'blind' -> draft_mode='automated', selection_method='random'
  // 'legacy' -> draft_mode='live', selection_method='standard'
  // 'random-draft' -> draft_mode='automated', selection_method='random'
  await db.execute(`
    UPDATE drafts 
    SET 
      draft_mode = CASE 
        WHEN draft_type IN ('normal', 'legacy') THEN 'live'::draft_mode
        WHEN draft_type IN ('blind', 'random-draft') THEN 'automated'::draft_mode
        ELSE 'live'::draft_mode
      END,
      selection_method = CASE 
        WHEN draft_type IN ('normal', 'legacy') THEN 'standard'::selection_method
        WHEN draft_type IN ('blind', 'random-draft') THEN 'random'::selection_method
        ELSE 'standard'::selection_method
      END;
  `);

  // Step 4: Make new columns NOT NULL now that they have values
  await db.execute(`
    ALTER TABLE drafts 
    ALTER COLUMN draft_mode SET NOT NULL,
    ALTER COLUMN selection_method SET NOT NULL;
  `);

  // Step 5: Update draft_order enum (replace 'normal' with 'linear')
  await db.execute(`
    UPDATE drafts 
    SET draft_order = 'linear'::text 
    WHERE draft_order = 'normal';
  `);

  await db.execute(`
    ALTER TABLE drafts 
    ALTER COLUMN draft_order TYPE draft_order_new 
    USING draft_order::text::draft_order_new;
  `);

  await db.execute(`DROP TYPE "public"."draft_order";`);
  await db.execute(
    `ALTER TYPE "public"."draft_order_new" RENAME TO "draft_order";`,
  );

  // Step 6: Drop old draft_type column and enum
  await db.execute(`ALTER TABLE drafts DROP COLUMN draft_type;`);
  await db.execute(`DROP TYPE "public"."draft_type";`);

  // Step 7: Add player_pool to leagues table with default 'all'
  await db.execute(`
    ALTER TABLE leagues 
    ADD COLUMN player_pool player_pool NOT NULL DEFAULT 'all';
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // Recreate original enum types
  await db.execute(
    `CREATE TYPE "public"."draft_type" AS ENUM('blind', 'normal', 'legacy', 'random-draft');`,
  );
  await db.execute(
    `CREATE TYPE "public"."draft_order_new" AS ENUM('snake', 'normal');`,
  );

  // Add back draft_type column
  await db.execute(`ALTER TABLE drafts ADD COLUMN draft_type draft_type;`);

  // Reverse the migration: map new columns back to old draft_type
  await db.execute(`
    UPDATE drafts 
    SET draft_type = CASE 
      WHEN draft_mode = 'live' AND selection_method = 'standard' THEN 'normal'::draft_type
      WHEN draft_mode = 'live' AND selection_method = 'auction' THEN 'normal'::draft_type
      WHEN draft_mode = 'automated' AND selection_method = 'random' THEN 'random-draft'::draft_type
      ELSE 'normal'::draft_type
    END;
  `);

  await db.execute(`ALTER TABLE drafts ALTER COLUMN draft_type SET NOT NULL;`);

  // Revert draft_order enum (replace 'linear' with 'normal')
  await db.execute(`
    UPDATE drafts 
    SET draft_order = 'normal'::text 
    WHERE draft_order = 'linear';
  `);

  await db.execute(`
    ALTER TABLE drafts 
    ALTER COLUMN draft_order TYPE draft_order_new 
    USING draft_order::text::draft_order_new;
  `);

  await db.execute(`DROP TYPE "public"."draft_order";`);
  await db.execute(
    `ALTER TYPE "public"."draft_order_new" RENAME TO "draft_order";`,
  );

  // Drop new columns and enums
  await db.execute(`ALTER TABLE drafts DROP COLUMN draft_mode;`);
  await db.execute(`ALTER TABLE drafts DROP COLUMN selection_method;`);
  await db.execute(`ALTER TABLE leagues DROP COLUMN player_pool;`);

  await db.execute(`DROP TYPE "public"."draft_mode";`);
  await db.execute(`DROP TYPE "public"."selection_method";`);
  await db.execute(`DROP TYPE "public"."player_pool";`);
};
