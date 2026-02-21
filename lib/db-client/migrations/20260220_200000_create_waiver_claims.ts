import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Create waiver_claims table
 *
 * Purpose:
 * - Track free agent waiver claims as pending records to be processed later
 * - Support both manual (UI-triggered) and automatic (EventBridge cron) processing
 *
 * Changes:
 * - Creates waiver_claim_status enum (pending, processing, completed, failed, cancelled)
 * - Creates waiver_claims table with status, processedAt, foreign keys to leagues/teams/players
 * - Adds updated_at trigger
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // 1. Create the enum (IF NOT EXISTS in case of partial prior run)
  await db.execute(`
    DO $$ BEGIN
      CREATE TYPE waiver_claim_status AS ENUM (
        'pending',
        'processing',
        'completed',
        'failed',
        'cancelled'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // 2. Create the table (IF NOT EXISTS in case of partial prior run)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS waiver_claims (
      id SERIAL PRIMARY KEY,
      league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES app_internal.users(id),
      player_id INTEGER NOT NULL,
      drop_player_id INTEGER,
      status waiver_claim_status NOT NULL DEFAULT 'pending',
      error_message TEXT,
      processed_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );
  `);

  // 3. Add indexes (IF NOT EXISTS in case of partial prior run)
  await db.execute(`
    CREATE INDEX IF NOT EXISTS waiver_claims_league_id_idx ON waiver_claims(league_id);
    CREATE INDEX IF NOT EXISTS waiver_claims_team_id_idx ON waiver_claims(team_id);
    CREATE INDEX IF NOT EXISTS waiver_claims_status_idx ON waiver_claims(status);
    CREATE INDEX IF NOT EXISTS waiver_claims_pending_idx ON waiver_claims(status, created_at)
      WHERE status = 'pending';
  `);

  // 4. Create trigger to auto-update updated_at (drop first to be idempotent)
  await db.execute(`
    DROP TRIGGER IF EXISTS waiver_claims_updated_at_trigger ON public.waiver_claims;
    CREATE TRIGGER waiver_claims_updated_at_trigger
    BEFORE UPDATE ON public.waiver_claims
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP TRIGGER IF EXISTS waiver_claims_updated_at_trigger ON public.waiver_claims;
    DROP TABLE IF EXISTS waiver_claims;
    DROP TYPE IF EXISTS waiver_claim_status;
  `);
};
