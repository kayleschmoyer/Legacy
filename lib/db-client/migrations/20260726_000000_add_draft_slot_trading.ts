import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add draft slot trading schema (LS-8675)
 *
 * Purpose: Let a premium commissioner enable draft slot trading at league
 * creation, and store slot-trade proposals between teams. The trades table
 * ships dormant here — lifecycle mutations land in a follow-up ticket
 * (child 2 of the LS-8387 slice).
 *
 * Changes:
 * - Adds leagues.allow_draft_slot_trading boolean (default false)
 * - Creates the draft_slot_trade_status enum
 *   (proposed/accepted/declined/approved/executed/cancelled)
 * - Creates the draft_slot_trades table (league + proposer/counterpart team
 *   FKs, status, timestamps) with supporting indexes and updated_at trigger
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase generic is untyped across the runner/lambda sandbox boundary
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.leagues
      ADD COLUMN IF NOT EXISTS allow_draft_slot_trading BOOLEAN NOT NULL DEFAULT false;
  `);

  await db.execute(`
    DO $$ BEGIN
      CREATE TYPE public.draft_slot_trade_status AS ENUM (
        'proposed', 'accepted', 'declined', 'approved', 'executed', 'cancelled'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS public.draft_slot_trades (
      id                   SERIAL PRIMARY KEY,
      league_id            INTEGER NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
      proposer_team_id     INTEGER NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
      counterpart_team_id  INTEGER NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
      status               public.draft_slot_trade_status NOT NULL DEFAULT 'proposed',
      created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS draft_slot_trades_league_id_idx
      ON public.draft_slot_trades (league_id);
    CREATE INDEX IF NOT EXISTS draft_slot_trades_proposer_team_id_idx
      ON public.draft_slot_trades (proposer_team_id);
    CREATE INDEX IF NOT EXISTS draft_slot_trades_counterpart_team_id_idx
      ON public.draft_slot_trades (counterpart_team_id);
    CREATE INDEX IF NOT EXISTS draft_slot_trades_status_idx
      ON public.draft_slot_trades (status);
  `);

  await db.execute(`
    DROP TRIGGER IF EXISTS draft_slot_trades_updated_at_trigger ON public.draft_slot_trades;
    CREATE TRIGGER draft_slot_trades_updated_at_trigger
    BEFORE UPDATE ON public.draft_slot_trades
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase generic is untyped across the runner/lambda sandbox boundary
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP TRIGGER IF EXISTS draft_slot_trades_updated_at_trigger ON public.draft_slot_trades;
    DROP TABLE IF EXISTS public.draft_slot_trades;
    DROP TYPE IF EXISTS public.draft_slot_trade_status;

    ALTER TABLE public.leagues
      DROP COLUMN IF EXISTS allow_draft_slot_trading;
  `);
};
