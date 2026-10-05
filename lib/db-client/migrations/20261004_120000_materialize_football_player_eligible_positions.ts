import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Materialize football_player_eligible_positions (LS-10553)
 *
 * Purpose:
 * - The plain VIEW is a 5-branch UNION ALL over players (+ career passing /
 *   kicking joins). When the player-id set arrives via a subquery, join, or a
 *   generic prepared plan, Postgres applies the filter after the Append, so
 *   every branch seq-scans players (~1 s on dev; 5.6k calls at 1.26 s mean).
 * - Materializing it with a unique (player_id, position) index turns every
 *   lookup into an index seek regardless of how the ids are supplied —
 *   mirroring baseball's player_eligible_positions (LS-369).
 *
 * The SELECT is identical to 20260524_000200 (LS-250), so rows are unchanged.
 *
 * Refresh strategy:
 * - refreshFootballPlayerEligiblePositions() (lib/db-client PublicDbClient)
 *   runs after the paths that write its inputs (players.position / is_dst and
 *   career_football_passing / career_football_kicking):
 *     - CLI `queue-players --sport football` (player import), and
 *     - CLI `load-football-career` (career stats load).
 * - CONCURRENTLY is used so reads are not blocked; it needs the unique index.
 */

const SELECT_SQL = `
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
      )
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase<any> is the correct type for drizzle migration runner callbacks
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // DROP VIEW errors on a materialized view, so only drop the plain view.
  await db.execute(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'football_player_eligible_positions'
          AND c.relkind = 'v'
      ) THEN
        DROP VIEW public.football_player_eligible_positions;
      END IF;
    END
    $$;
  `);

  await db.execute(`
    CREATE MATERIALIZED VIEW IF NOT EXISTS public.football_player_eligible_positions AS
    ${SELECT_SQL}
    WITH DATA
  `);

  // Logical primary key — serves player_id lookups (leading column) and is
  // required for REFRESH MATERIALIZED VIEW CONCURRENTLY.
  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS football_player_eligible_positions_player_id_position_idx
      ON public.football_player_eligible_positions (player_id, position)
  `);

  await db.execute(`ANALYZE public.football_player_eligible_positions`);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase<any> is the correct type for drizzle migration runner callbacks
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(
    `DROP MATERIALIZED VIEW IF EXISTS public.football_player_eligible_positions`,
  );
  await db.execute(`
    CREATE OR REPLACE VIEW public.football_player_eligible_positions AS
    ${SELECT_SQL}
  `);
};
