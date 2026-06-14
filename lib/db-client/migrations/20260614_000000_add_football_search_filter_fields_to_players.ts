import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';

/**
 * Migration: Add projected_fantasy_points and adp_rank columns to players
 * (LS-6489 — FPL-008: Premium-only advanced search filters)
 *
 * Backs the premium-only advanced search filters on the Football Players list.
 * Both columns are nullable — they remain NULL for baseball players and for
 * football players until a projections/ADP data pipeline populates them, so the
 * filters degrade gracefully (a player with no projection/ADP is simply not
 * matched by the corresponding threshold filter). injury_status already exists
 * (migration 20260611_000000_add_injury_fields_to_players) and is reused as the
 * third advanced filter.
 *
 *   projected_fantasy_points — projected season fantasy points (e.g. 245.6)
 *   adp_rank                 — average draft position rank (1 = earliest)
 *
 * No index required: the players table is already constrained to
 * sport = 'football' for these queries, and the football player set is small
 * enough that a sequential scan over the filtered rows is acceptable.
 */

export const up = async ({ db }: { db: PgDatabase<NodePgQueryResultHKT> }): Promise<void> => {
  await db.execute(`
    ALTER TABLE "public"."players"
      ADD COLUMN IF NOT EXISTS "projected_fantasy_points" REAL,
      ADD COLUMN IF NOT EXISTS "adp_rank"                 INTEGER;
  `);
};

export const down = async ({ db }: { db: PgDatabase<NodePgQueryResultHKT> }): Promise<void> => {
  await db.execute(`
    ALTER TABLE "public"."players"
      DROP COLUMN IF EXISTS "projected_fantasy_points",
      DROP COLUMN IF EXISTS "adp_rank";
  `);
};
