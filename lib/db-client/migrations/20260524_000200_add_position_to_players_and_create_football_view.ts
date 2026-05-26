import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add players.position + create football_player_eligible_positions view (LS-250)
 *
 * Runs after 20260524_000100_add_football_columns_to_players (LS-246) so is_dst exists,
 * and after 20260524_000000_create_career_football_tables so career_football_* tables exist.
 *
 * players.position stores the PFR canonical position for football players (QB, RB, WR, TE, K,
 * DL, LB, DB). Nullable — baseball players and football players without a PFR mapping have null.
 *
 * The view derives eligible fantasy positions for each football player:
 *   1. is_dst=true → 'DST'
 *   2. position IN ('DL','LB','DB') → IDP position (authoritative from PFR)
 *   3. position IN ('QB','RB','WR','TE','K') → offensive position (authoritative from PFR)
 *   4. career passing att > 0, position IS NULL → 'QB' (stat-inferred fallback)
 *   5. career kicking fga > 0, position IS NULL, no passing att → 'K' (stat-inferred fallback)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase<any> is the correct type for drizzle migration runner callbacks
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE "public"."players"
      ADD COLUMN IF NOT EXISTS "position" "public"."player_position";
  `);

  await db.execute(`
    CREATE OR REPLACE VIEW "public"."football_player_eligible_positions" AS
    SELECT p.id AS player_id, 'DST'::text AS position
    FROM "public"."players" p
    WHERE p.is_dst = true
    UNION ALL
    SELECT p.id AS player_id, p.position::text AS position
    FROM "public"."players" p
    WHERE p.position::text IN ('DL', 'LB', 'DB')
      AND p.is_dst = false
    UNION ALL
    SELECT p.id AS player_id, p.position::text AS position
    FROM "public"."players" p
    WHERE p.position::text IN ('QB', 'RB', 'WR', 'TE', 'K')
      AND p.is_dst = false
    UNION ALL
    SELECT cfp.player_id, 'QB'::text AS position
    FROM "public"."career_football_passing" cfp
    JOIN "public"."players" p ON p.id = cfp.player_id
    WHERE cfp.att > 0
      AND p.position IS NULL
      AND p.is_dst = false
    UNION ALL
    SELECT cfk.player_id, 'K'::text AS position
    FROM "public"."career_football_kicking" cfk
    JOIN "public"."players" p ON p.id = cfk.player_id
    WHERE cfk.fga > 0
      AND p.position IS NULL
      AND p.is_dst = false
      AND NOT EXISTS (
        SELECT 1 FROM "public"."career_football_passing" cfp
        WHERE cfp.player_id = cfk.player_id AND cfp.att > 0
      );
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase<any> is the correct type for drizzle migration runner callbacks
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(
    `DROP VIEW IF EXISTS "public"."football_player_eligible_positions";`,
  );
  await db.execute(`
    ALTER TABLE "public"."players"
      DROP COLUMN IF EXISTS "position";
  `);
};
