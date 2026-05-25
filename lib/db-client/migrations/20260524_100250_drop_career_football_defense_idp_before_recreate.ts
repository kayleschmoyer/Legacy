import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Pre-create football_season_defense_idp and fix the view (LS-255)
 *
 * Problem this migration solves:
 *  - 20260525_061000 (already merged to main) created career_football_defense_idp
 *    with BIGINT columns.
 *  - 100300 uses CREATE OR REPLACE VIEW with ::smallint casts, which PostgreSQL
 *    rejects when changing existing column types.
 *  - 100301 uses CREATE OR REPLACE VIEW without casts, which also fails after
 *    100300 creates the view with SMALLINT columns (SMALLINT → BIGINT rejected).
 *
 * Strategy:
 *  1. Drop the view (handles the BIGINT version from 061000).
 *  2. Create football_season_defense_idp table and indexes (IF NOT EXISTS) so
 *     100300's CREATE TABLE is a no-op.
 *  3. Create career_football_defense_idp view WITHOUT ::smallint casts (BIGINT
 *     columns — the correct final state).
 *  4. Pre-record 100300 in the migrations table so the runner skips its broken
 *     CREATE OR REPLACE VIEW with ::smallint casts. 100301 then runs against the
 *     correct BIGINT view and succeeds (CREATE OR REPLACE VIEW with same types).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // Step 1: Drop any existing view regardless of its current column types.
  await db.execute(
    `DROP VIEW IF EXISTS "public"."career_football_defense_idp";`,
  );

  // Step 2: Create the table and indexes (same DDL as 100300, idempotent).
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."football_season_defense_idp" (
      player_id   INTEGER      NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      season      SMALLINT     NOT NULL,
      team        VARCHAR(10)  NOT NULL,
      g           SMALLINT,
      gs          SMALLINT,
      solo_tkl    SMALLINT,
      ast_tkl     SMALLINT,
      total_tkl   SMALLINT,
      sacks       NUMERIC(5,1),
      int         SMALLINT,
      pd          SMALLINT,
      ff          SMALLINT,
      fr          SMALLINT,
      def_td      SMALLINT,
      safeties    SMALLINT,
      pfr_row_id  VARCHAR(30)  NOT NULL,
      PRIMARY KEY (player_id, season, team, pfr_row_id)
    );
    CREATE INDEX IF NOT EXISTS football_season_defense_idp_player_id_idx
      ON "public"."football_season_defense_idp" (player_id);
    CREATE INDEX IF NOT EXISTS football_season_defense_idp_player_season_idx
      ON "public"."football_season_defense_idp" (player_id, season);
  `);

  // Step 3: Create the view with native BIGINT columns (SUM(SMALLINT) → BIGINT).
  // No ::smallint casts — this is the correct final state also produced by 100301.
  // Note: PostgreSQL does not support CREATE VIEW IF NOT EXISTS; use CREATE OR REPLACE VIEW.
  // The view was dropped in step 1, so this always creates it fresh.
  await db.execute(`
    CREATE OR REPLACE VIEW "public"."career_football_defense_idp" AS
    SELECT
      player_id,
      SUM(g)         AS g,
      SUM(solo_tkl)  AS solo_tkl,
      SUM(ast_tkl)   AS ast_tkl,
      SUM(total_tkl) AS total_tkl,
      SUM(sacks)     AS sacks,
      SUM(int)       AS int,
      SUM(pd)        AS pd,
      SUM(ff)        AS ff,
      SUM(fr)        AS fr,
      SUM(def_td)    AS def_td,
      SUM(safeties)  AS safeties
    FROM "public"."football_season_defense_idp"
    GROUP BY player_id;
  `);

  // Step 4: Pre-record 100300 as applied so the migration runner skips its
  // CREATE OR REPLACE VIEW with ::smallint casts (which would fail with
  // "cannot change data type of view column" against our BIGINT view).
  // 100301 is NOT pre-recorded — it runs normally and succeeds because it uses
  // CREATE OR REPLACE VIEW without casts against our BIGINT view (same types).
  await db.execute(`
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    SELECT
      '20260524_100300_create_football_season_defense_idp.ts',
      EXTRACT(EPOCH FROM NOW())::bigint * 1000
    WHERE NOT EXISTS (
      SELECT 1 FROM drizzle.__drizzle_migrations
      WHERE hash = '20260524_100300_create_football_season_defense_idp.ts'
    );
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(
    `DROP VIEW IF EXISTS "public"."career_football_defense_idp";`,
  );
  await db.execute(
    `DROP TABLE IF EXISTS "public"."football_season_defense_idp";`,
  );
  await db.execute(`
    DELETE FROM drizzle.__drizzle_migrations
    WHERE hash IN (
      '20260524_100300_create_football_season_defense_idp.ts'
    );
  `);
};
