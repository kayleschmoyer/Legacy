import type { SQLWrapper } from 'drizzle-orm';

type MigrationDb = { execute: (query: SQLWrapper | string) => Promise<unknown> };

/**
 * Migration: Add an IMMUTABLE unaccent wrapper function and functional indexes
 * on players.first_name and players.last_name for football player name search
 * (LS-7049 / PLL-013).
 *
 * Background: unaccent() is STABLE, not IMMUTABLE, so it cannot be used
 * directly in index expressions. The standard workaround is an IMMUTABLE SQL
 * wrapper that hard-codes the 'unaccent' dictionary — fixing the dictionary
 * makes the function deterministic and therefore IMMUTABLE.
 *
 * The footballPlayers resolver uses `unaccent(col) ILIKE unaccent(term)` for
 * accent-insensitive matching. The indexes here use the f_unaccent() wrapper
 * so the planner can choose an index scan instead of a sequential scan.
 *
 * Both indexes are partial (WHERE sport = 'football') because the search is
 * scoped to football players, keeping the index small and the write overhead low.
 */

export const up = async ({ db }: { db: MigrationDb }) => {
  await db.execute(`
    CREATE OR REPLACE FUNCTION f_unaccent(text)
      RETURNS text
      LANGUAGE sql IMMUTABLE STRICT
    AS $$
      SELECT unaccent('unaccent', $1)
    $$
  `);
  await db.execute(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_players_unaccent_first_name_football
      ON public.players (f_unaccent(first_name))
      WHERE sport = 'football'
  `);
  await db.execute(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_players_unaccent_last_name_football
      ON public.players (f_unaccent(last_name))
      WHERE sport = 'football'
  `);
};

export const down = async ({ db }: { db: MigrationDb }) => {
  await db.execute(
    `DROP INDEX IF EXISTS idx_players_unaccent_first_name_football`,
  );
  await db.execute(
    `DROP INDEX IF EXISTS idx_players_unaccent_last_name_football`,
  );
  await db.execute(`DROP FUNCTION IF EXISTS f_unaccent(text)`);
};
