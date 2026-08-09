import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add league_scoring_position_bonuses table (LS-9103)
 *
 * Storage layer only — no GraphQL exposure, no fantasy-points application,
 * no UI, no entitlement gating (all sibling tickets). Adds a position-scoped
 * bonus, additive on top of the existing league_scoring_profile_entries
 * base multiplier, so e.g. a TE and a WR can score "receptions" differently.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase<any> is the correct type for drizzle migration runner callbacks
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."league_scoring_position_bonuses" (
      "id" SERIAL PRIMARY KEY NOT NULL,
      "profile_id" INTEGER NOT NULL,
      "stat_definition_id" INTEGER NOT NULL,
      "position" VARCHAR(10) NOT NULL,
      "bonus_multiplier" NUMERIC(6, 3) NOT NULL,
      "is_enabled" BOOLEAN NOT NULL DEFAULT true,
      "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      CONSTRAINT "league_scoring_position_bonuses_profile_fk"
        FOREIGN KEY ("profile_id") REFERENCES "public"."league_scoring_profiles" ("id") ON DELETE CASCADE,
      CONSTRAINT "league_scoring_position_bonuses_stat_fk"
        FOREIGN KEY ("stat_definition_id") REFERENCES "public"."scoring_stat_definitions" ("id")
    );
  `);

  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS "league_scoring_position_bonuses_unique"
      ON "public"."league_scoring_position_bonuses" ("profile_id", "stat_definition_id", "position");
  `);

  await db.execute(`
    CREATE TRIGGER league_scoring_position_bonuses_updated_at_trigger
    BEFORE UPDATE ON "public"."league_scoring_position_bonuses"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase<any> is the correct type for drizzle migration runner callbacks
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP TRIGGER IF EXISTS league_scoring_position_bonuses_updated_at_trigger
      ON "public"."league_scoring_position_bonuses";
  `);
  await db.execute(`
    DROP TABLE IF EXISTS "public"."league_scoring_position_bonuses";
  `);
};
