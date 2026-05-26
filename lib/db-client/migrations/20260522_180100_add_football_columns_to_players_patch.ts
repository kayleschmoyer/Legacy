import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Patch — add football identity columns before DST seed (LS-4151)
 *
 * 20260522_190200_seed_football_dst_players depends on sport/is_dst/nfl_team
 * columns existing, but the canonical addition (20260524_000100) runs at a
 * later timestamp. In a fresh-DB environment migrations run in filename order,
 * so the seed fails with "column does not exist".
 *
 * This patch runs the same ADD COLUMN / FK statements with IF NOT EXISTS guards
 * so that a fresh CI database has the columns in place before the seed fires.
 * The canonical migration (20260524_000100) then becomes a no-op for these
 * statements.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // sport_kind enum already exists from 20260521_120000_add_sport_to_leagues
  await db.execute(`
    ALTER TABLE "public"."players"
      ADD COLUMN IF NOT EXISTS "sport" "public"."sport_kind" NOT NULL DEFAULT 'baseball';
  `);

  await db.execute(`
    ALTER TABLE "public"."players"
      ADD COLUMN IF NOT EXISTS "is_dst" BOOLEAN NOT NULL DEFAULT false;
  `);

  await db.execute(`
    ALTER TABLE "public"."players"
      ADD COLUMN IF NOT EXISTS "nfl_team" VARCHAR(10);
  `);

  await db.execute(`
    DO $$ BEGIN
      ALTER TABLE "public"."players"
        ADD CONSTRAINT "players_nfl_team_fk"
          FOREIGN KEY ("nfl_team") REFERENCES "public"."nfl_teams" ("abbreviation")
          ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  // No-op: the canonical down migration in 20260524_000100 handles cleanup.
  // Removing columns here would break 20260524_000100's down path.
};
