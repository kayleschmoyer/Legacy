import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Backfill legacy NFL team abbreviations in the players table (LS-6492).
 *
 * VALID_NFL_TEAMS in the GraphQL schema uses only current abbreviations (LV, LAC,
 * LAR). Historical player records imported before normalization may carry the
 * pre-relocation abbreviations OAK, SD, or STL. Those values are excluded by
 * the isValidNflTeam guard in the nflTeam resolver and will never appear when
 * filtering by LV, LAC, or LAR — the filter uses the current abbreviation.
 *
 * This migration normalises any such legacy values to their current equivalents:
 *   OAK → LV   (Raiders relocated from Oakland to Las Vegas, 2020)
 *   SD  → LAC  (Chargers relocated from San Diego to Los Angeles, 2017)
 *   STL → LAR  (Rams relocated from St. Louis to Los Angeles, 2016)
 *
 * The statements are idempotent (UPDATE … WHERE nfl_team = '<old>') and safe to
 * re-run: if no rows carry the legacy value the statement is a no-op. The `down`
 * function is intentionally a no-op — re-introducing stale abbreviations would
 * re-break the filter and is not a safe rollback.
 */

export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    UPDATE players
       SET nfl_team = 'LV'
     WHERE sport = 'football'
       AND nfl_team = 'OAK';
  `);
  await db.execute(`
    UPDATE players
       SET nfl_team = 'LAC'
     WHERE sport = 'football'
       AND nfl_team = 'SD';
  `);
  await db.execute(`
    UPDATE players
       SET nfl_team = 'LAR'
     WHERE sport = 'football'
       AND nfl_team = 'STL';
  `);
};

export const down = async (_ctx: { db: PgDatabase<any> }): Promise<void> => {
  // Intentional no-op: reverting a data-normalisation backfill would re-introduce
  // stale abbreviations that break the nflTeam resolver filter.
};
