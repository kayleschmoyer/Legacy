import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add trade offers tables
 *
 * Purpose:
 * - Enable peer-to-peer player trading between teams within a fantasy league
 * - Trade workflow: propose → accept | reject | cancel | veto | expire
 *
 * Changes:
 * - Add `trade_offer_status` enum type
 * - Create `trade_offers` table (one row per trade proposal)
 * - Create `trade_offer_players` table (individual player legs of each trade)
 * - Add `updated_at` triggers for both tables
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // 1. Create the status enum
  await db.execute(`
    DO $$ BEGIN
      CREATE TYPE public.trade_offer_status AS ENUM (
        'pending',
        'accepted',
        'rejected',
        'cancelled',
        'vetoed',
        'expired'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // 2. Create trade_offers table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS public.trade_offers (
      id                 SERIAL PRIMARY KEY,
      league_id          INTEGER NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
      proposing_team_id  INTEGER NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
      receiving_team_id  INTEGER NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
      status             public.trade_offer_status NOT NULL DEFAULT 'pending',
      message            VARCHAR(500),
      expires_at         TIMESTAMP WITH TIME ZONE,
      responded_at       TIMESTAMP WITH TIME ZONE,
      vetoed_at          TIMESTAMP WITH TIME ZONE,
      created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS trade_offers_league_id_idx
      ON public.trade_offers (league_id);
    CREATE INDEX IF NOT EXISTS trade_offers_proposing_team_id_idx
      ON public.trade_offers (proposing_team_id);
    CREATE INDEX IF NOT EXISTS trade_offers_receiving_team_id_idx
      ON public.trade_offers (receiving_team_id);
    CREATE INDEX IF NOT EXISTS trade_offers_status_idx
      ON public.trade_offers (status);
  `);

  await db.execute(`
    CREATE TRIGGER trade_offers_updated_at_trigger
    BEFORE UPDATE ON public.trade_offers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  // 3. Create trade_offer_players table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS public.trade_offer_players (
      id              SERIAL PRIMARY KEY,
      trade_offer_id  INTEGER NOT NULL REFERENCES public.trade_offers(id) ON DELETE CASCADE,
      player_id       INTEGER NOT NULL REFERENCES public.players(id),
      from_team_id    INTEGER NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
      CONSTRAINT trade_offer_players_unique UNIQUE (trade_offer_id, player_id)
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS trade_offer_players_trade_id_idx
      ON public.trade_offer_players (trade_offer_id);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP TRIGGER IF EXISTS trade_offers_updated_at_trigger ON public.trade_offers;
    DROP TABLE IF EXISTS public.trade_offer_players;
    DROP TABLE IF EXISTS public.trade_offers;
    DROP TYPE IF EXISTS public.trade_offer_status;
  `);
};
