import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add on_this_day_events table
 *
 * Purpose:
 * - Stores historical MLB baseball events (signings, trades, contract
 *   extensions, etc.) indexed by calendar month and day so the "On This
 *   Day" feature can surface meaningful content on every date of the year,
 *   including the off-season when no regular-season games are played.
 *
 * Changes:
 * - Creates public.on_this_day_events with composite index on (month, day)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS public.on_this_day_events (
      id            SERIAL PRIMARY KEY,
      month         SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
      day           SMALLINT NOT NULL CHECK (day BETWEEN 1 AND 31),
      year          SMALLINT NOT NULL,
      event_type    VARCHAR(50)  NOT NULL,
      description   TEXT         NOT NULL,
      player_id     INTEGER REFERENCES public.players(id),
      player_name   VARCHAR(200),
      from_team     VARCHAR(100),
      to_team       VARCHAR(100),
      mlb_transaction_id INTEGER,
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_on_this_day_events_month_day
      ON public.on_this_day_events (month, day);

    CREATE UNIQUE INDEX idx_on_this_day_events_mlb_tx_id
      ON public.on_this_day_events (mlb_transaction_id)
      WHERE mlb_transaction_id IS NOT NULL;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP TABLE IF EXISTS public.on_this_day_events;
  `);
};
