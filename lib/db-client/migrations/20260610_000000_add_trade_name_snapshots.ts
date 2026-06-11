import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add name snapshot columns to trade tables
 *
 * Fixes TC-023: hydrateTrades resolved team/player names via JOIN at query
 * time, so renames after a trade was proposed corrupted historical records.
 * Storing snapshots at proposal time makes trade history immutable.
 *
 * Changes:
 * - trade_offers: add proposing_team_name, receiving_team_name (nullable)
 * - trade_offer_players: add player_name (nullable)
 *
 * Nullable so existing rows are unaffected; hydration falls back to JOIN.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.trade_offers
      ADD COLUMN IF NOT EXISTS proposing_team_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS receiving_team_name VARCHAR(255);
  `);

  await db.execute(`
    ALTER TABLE public.trade_offer_players
      ADD COLUMN IF NOT EXISTS player_name VARCHAR(255);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.trade_offer_players
      DROP COLUMN IF EXISTS player_name;
  `);

  await db.execute(`
    ALTER TABLE public.trade_offers
      DROP COLUMN IF EXISTS proposing_team_name,
      DROP COLUMN IF EXISTS receiving_team_name;
  `);
};
