import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Optimize draft player pool filtering indexes (LS-905)
 *
 * Purpose:
 * The getAvailableDraftPlayers query chains multiple subqueries for pool
 * filtering, position eligibility, and name search. Several of these
 * subqueries cannot use existing indexes efficiently:
 *
 * 1. LIKE on LOWER(first_name || ' ' || last_name) → full table scan
 * 2. Position filter queries player_eligible_positions by position, but the
 *    existing unique index leads with player_id
 * 3. Player pool (AL/NL) filter queries season_batting by lg_id, but the
 *    existing composite index leads with player_id
 *
 * Changes:
 * - Enable pg_trgm extension for trigram-based LIKE optimization
 * - Add GIN trigram index on players for case-insensitive name search
 * - Add index on player_eligible_positions(position, player_id) for
 *   position-first lookups
 * - Add index on season_batting(lg_id, player_id) for pool-first lookups
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  console.log('📦 LS-905: Adding draft pool filtering indexes…');

  // 1. Enable pg_trgm extension (idempotent — safe on RDS Aurora/PostgreSQL)
  await db.execute(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

  // 2. GIN trigram index on player full name for LIKE '%term%' queries.
  //    Eliminates full table scan on the ~20k players table.
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_players_name_trgm
      ON public.players
      USING gin ((lower(first_name || ' ' || last_name)) gin_trgm_ops)
  `);

  // 3. Index on player_eligible_positions leading with position for
  //    position-filter subqueries (WHERE position = $pos).
  //    The existing unique index (player_id, position) doesn't help when
  //    position is the filter column.
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_pep_position_player
      ON public.player_eligible_positions (position, player_id)
  `);

  // 4. Index on season_batting leading with lg_id for pool filter
  //    subqueries (WHERE lg_id = 'AL'/'NL'). The existing
  //    idx_season_batting_player_lgid has player_id first.
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_season_batting_lgid_player
      ON public.season_batting (lg_id, player_id)
  `);

  console.log('✅ LS-905: Draft pool filtering indexes applied');
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  console.log('⬇️ LS-905: Reverting draft pool filtering indexes…');

  await db.execute(
    `DROP INDEX IF EXISTS public.idx_season_batting_lgid_player`,
  );
  await db.execute(`DROP INDEX IF EXISTS public.idx_pep_position_player`);
  await db.execute(`DROP INDEX IF EXISTS public.idx_players_name_trgm`);
  // Note: not dropping pg_trgm extension — other features may depend on it

  console.log('✅ LS-905: Draft pool filtering indexes reverted');
};
