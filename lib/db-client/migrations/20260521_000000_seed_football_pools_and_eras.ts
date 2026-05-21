import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Multi-sport football player pools + era windows (LS-4633)
 *
 * Adds football pool keys (nfl/afc/nfc) to the existing player_pool enum
 * and football era keys (pioneer/single_platoon/super_bowl_era/west_coast/
 * salary_cap_era/spread_offense) to the era_filter enum so leagues.player_pool
 * and leagues.era_filter can persist a football selection.
 *
 * Introduces sport_player_pools and sport_eras reference tables to make pool
 * and era options queryable per sport (the existing enums are flat and carry
 * no sport tag). Seeds both tables with baseball + football rows; reseeding
 * the migration is a no-op via ON CONFLICT DO NOTHING.
 *
 * Football era windows per design (LS-4568):
 *   Pioneer         : 1920-1945
 *   Single-Platoon  : 1946-1959
 *   Super Bowl Era  : 1960-1977
 *   West Coast      : 1978-1993
 *   Salary Cap      : 1994-2010
 *   Spread Offense  : 2011+
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // 1. Extend player_pool enum with football values
  await db.execute(`
    ALTER TYPE "public"."player_pool" ADD VALUE IF NOT EXISTS 'nfl';
    ALTER TYPE "public"."player_pool" ADD VALUE IF NOT EXISTS 'afc';
    ALTER TYPE "public"."player_pool" ADD VALUE IF NOT EXISTS 'nfc';
  `);

  // 2. Extend era_filter enum with football era values
  await db.execute(`
    ALTER TYPE "public"."era_filter" ADD VALUE IF NOT EXISTS 'pioneer';
    ALTER TYPE "public"."era_filter" ADD VALUE IF NOT EXISTS 'single_platoon';
    ALTER TYPE "public"."era_filter" ADD VALUE IF NOT EXISTS 'super_bowl_era';
    ALTER TYPE "public"."era_filter" ADD VALUE IF NOT EXISTS 'west_coast';
    ALTER TYPE "public"."era_filter" ADD VALUE IF NOT EXISTS 'salary_cap_era';
    ALTER TYPE "public"."era_filter" ADD VALUE IF NOT EXISTS 'spread_offense';
  `);

  // 3. Reference table: sport_player_pools
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."sport_player_pools" (
      "sport" varchar(20) NOT NULL,
      "key" varchar(50) NOT NULL,
      "label" varchar(100) NOT NULL,
      "sort_order" integer NOT NULL DEFAULT 0,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "sport_player_pools_pk" PRIMARY KEY ("sport", "key")
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "sport_player_pools_sport_idx"
      ON "public"."sport_player_pools" ("sport");
  `);

  // 4. Reference table: sport_eras
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."sport_eras" (
      "sport" varchar(20) NOT NULL,
      "key" varchar(50) NOT NULL,
      "label" varchar(100) NOT NULL,
      "start_year" integer,
      "end_year" integer,
      "sort_order" integer NOT NULL DEFAULT 0,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "sport_eras_pk" PRIMARY KEY ("sport", "key"),
      CONSTRAINT "sport_eras_years_check" CHECK (
        start_year IS NULL OR end_year IS NULL OR start_year <= end_year
      )
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "sport_eras_sport_idx"
      ON "public"."sport_eras" ("sport");
  `);

  // 5. Seed pool definitions (idempotent)
  await db.execute(`
    INSERT INTO "public"."sport_player_pools" ("sport", "key", "label", "sort_order")
    VALUES
      ('baseball', 'all', 'All MLB', 0),
      ('baseball', 'nl',  'National League', 1),
      ('baseball', 'al',  'American League', 2),
      ('football', 'nfl', 'All NFL', 0),
      ('football', 'afc', 'American Football Conference', 1),
      ('football', 'nfc', 'National Football Conference', 2)
    ON CONFLICT ("sport", "key") DO NOTHING;
  `);

  // 6. Seed era windows (idempotent)
  await db.execute(`
    INSERT INTO "public"."sport_eras"
      ("sport", "key", "label", "start_year", "end_year", "sort_order")
    VALUES
      ('baseball', 'all',         'All Eras',     NULL, NULL, 0),
      ('baseball', 'dead_ball',   'Dead Ball Era',     1871, 1919, 1),
      ('baseball', 'golden_age',  'Golden Age',        1920, 1960, 2),
      ('baseball', 'expansion',   'Expansion Era',     1961, 1976, 3),
      ('baseball', 'free_agency', 'Free Agency Era',   1977, 1993, 4),
      ('baseball', 'steroid_era', 'Steroid Era',       1994, 2005, 5),
      ('baseball', 'modern',      'Modern Era',        2006, NULL, 6),
      ('football', 'pioneer',         'Pioneer Era',         1920, 1945, 1),
      ('football', 'single_platoon',  'Single-Platoon Era',  1946, 1959, 2),
      ('football', 'super_bowl_era',  'Super Bowl Era',      1960, 1977, 3),
      ('football', 'west_coast',      'West Coast Era',      1978, 1993, 4),
      ('football', 'salary_cap_era',  'Salary Cap Era',      1994, 2010, 5),
      ('football', 'spread_offense',  'Spread Offense Era',  2011, NULL, 6)
    ON CONFLICT ("sport", "key") DO NOTHING;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`DROP TABLE IF EXISTS "public"."sport_eras";`);
  await db.execute(`DROP TABLE IF EXISTS "public"."sport_player_pools";`);
  // Enum values cannot be removed in PostgreSQL without recreating the type.
  // Rows using these values would need cleanup before a full reconstruction.
};
