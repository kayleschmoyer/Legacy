import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add league dues tracker tables
 *
 * Purpose: LS-1531 — Support league dues tracking (Sleeper parity MVP)
 *
 * Changes:
 * - Create `league_dues_settings` table (per-league dues configuration)
 * - Create `league_member_payment_status` table (per-member payment tracking)
 * - Add automatic timestamp triggers for both tables
 */

export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // 1. Create league_dues_settings table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS public.league_dues_settings (
      id              SERIAL PRIMARY KEY,
      league_id       INTEGER NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
      enabled         BOOLEAN NOT NULL DEFAULT false,
      amount_cents    INTEGER NOT NULL DEFAULT 0,
      reminder_enabled BOOLEAN NOT NULL DEFAULT false,
      reminder_day_of_week INTEGER,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT league_dues_settings_league_uk UNIQUE (league_id)
    );
  `);

  // 2. Create league_member_payment_status table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS public.league_member_payment_status (
      id          SERIAL PRIMARY KEY,
      league_id   INTEGER NOT NULL,
      user_id     INTEGER NOT NULL,
      paid        BOOLEAN NOT NULL DEFAULT false,
      paid_at     TIMESTAMPTZ,
      marked_by   INTEGER,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT league_member_payment_status_league_fk
        FOREIGN KEY (league_id) REFERENCES public.leagues(id) ON DELETE CASCADE,
      CONSTRAINT league_member_payment_status_member_fk
        FOREIGN KEY (league_id, user_id) REFERENCES public.league_members(league_id, user_id) ON DELETE CASCADE,
      CONSTRAINT league_member_payment_status_uk UNIQUE (league_id, user_id)
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS league_member_payment_status_league_id_idx
      ON public.league_member_payment_status(league_id);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS league_member_payment_status_user_id_idx
      ON public.league_member_payment_status(user_id);
  `);

  // 3. Add automatic timestamp triggers
  await db.execute(`
    DROP TRIGGER IF EXISTS league_dues_settings_updated_at_trigger ON public.league_dues_settings;
    CREATE TRIGGER league_dues_settings_updated_at_trigger
      BEFORE UPDATE ON public.league_dues_settings
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  await db.execute(`
    DROP TRIGGER IF EXISTS league_member_payment_status_updated_at_trigger ON public.league_member_payment_status;
    CREATE TRIGGER league_member_payment_status_updated_at_trigger
      BEFORE UPDATE ON public.league_member_payment_status
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);
};

export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(
    `DROP TRIGGER IF EXISTS league_member_payment_status_updated_at_trigger ON public.league_member_payment_status;`,
  );
  await db.execute(
    `DROP TRIGGER IF EXISTS league_dues_settings_updated_at_trigger ON public.league_dues_settings;`,
  );
  await db.execute(`DROP TABLE IF EXISTS public.league_member_payment_status;`);
  await db.execute(`DROP TABLE IF EXISTS public.league_dues_settings;`);
};
