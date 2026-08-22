import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add trade_offer_votes table (LS-6349)
 *
 * Premium leagues under commissioner review lacked a league-member voting
 * mechanism for accepted trades — only the commissioner's veto existed.
 * This adds a per-team vote (`approve` | `veto`) on an accepted trade offer,
 * one vote per team, so non-participating league members can weigh in
 * alongside the commissioner's manual veto.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DO $$ BEGIN
      CREATE TYPE public.trade_offer_vote_choice AS ENUM ('approve', 'veto');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS public.trade_offer_votes (
      id SERIAL PRIMARY KEY,
      trade_offer_id INTEGER NOT NULL REFERENCES public.trade_offers(id) ON DELETE CASCADE,
      team_id INTEGER NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
      vote public.trade_offer_vote_choice NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT trade_offer_votes_unique UNIQUE (trade_offer_id, team_id)
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS trade_offer_votes_trade_id_idx
      ON public.trade_offer_votes (trade_offer_id);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP TABLE IF EXISTS public.trade_offer_votes;
  `);

  await db.execute(`
    DROP TYPE IF EXISTS public.trade_offer_vote_choice;
  `);
};
