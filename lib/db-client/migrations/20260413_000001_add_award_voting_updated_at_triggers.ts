import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add updated_at triggers for award voting tables
 *
 * Adds BEFORE UPDATE triggers so updated_at is automatically maintained,
 * consistent with the rest of the schema.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP TRIGGER IF EXISTS league_award_voting_periods_updated_at_trigger
      ON public.league_award_voting_periods;
    CREATE TRIGGER league_award_voting_periods_updated_at_trigger
      BEFORE UPDATE ON public.league_award_voting_periods
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    DROP TRIGGER IF EXISTS league_season_award_votes_updated_at_trigger
      ON public.league_season_award_votes;
    CREATE TRIGGER league_season_award_votes_updated_at_trigger
      BEFORE UPDATE ON public.league_season_award_votes
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP TRIGGER IF EXISTS league_season_award_votes_updated_at_trigger
      ON public.league_season_award_votes;
    DROP TRIGGER IF EXISTS league_award_voting_periods_updated_at_trigger
      ON public.league_award_voting_periods;
  `);
};
