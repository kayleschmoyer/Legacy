import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * LS-4535: Add missing (player_id, game_identifier) index to game_fielding.
 *
 * The _computeStandings query in matchup-history uses:
 *   WHERE player_id IN (...) AND game_identifier IN (...)
 * without a season filter. game_batting and game_pitching already have a
 * (player_id, game_identifier) index for this access pattern, but game_fielding
 * was missing it, causing seq-scans and connection-pool timeouts under load.
 */

export const up = async ({ db }: { db: PgDatabase<Record<string, never>> }) => {
  await db.execute(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS game_fielding_player_id_game_identifier_idx
      ON game_fielding (player_id, game_identifier)
  `);
};

export const down = async ({
  db,
}: {
  db: PgDatabase<Record<string, never>>;
}) => {
  await db.execute(`
    DROP INDEX CONCURRENTLY IF EXISTS game_fielding_player_id_game_identifier_idx
  `);
};
