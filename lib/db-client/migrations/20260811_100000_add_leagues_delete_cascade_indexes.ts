import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add missing indexes on the leagues cascade-delete path (LS-9315)
 *
 * Investigation:
 * - pg_stat_statements showed `delete from leagues where id = $1` at 8,210
 *   calls, mean 223.86ms, max_exec_time ~38,243ms.
 * - `leagues.id` is referenced by 31 tables via `ON DELETE CASCADE`/`SET
 *   NULL` foreign keys; all direct references are indexed.
 * - Walking the cascade one level deeper (leagues -> teams -> ..., leagues ->
 *   matchups -> ...) found 5 FK columns with no leading index, forcing a
 *   sequential scan per row for every team/matchup cascaded from a league
 *   delete:
 *     - auction_budgets.team_id      (-> teams, CASCADE)
 *     - draft_forfeited_picks.team_id (-> teams, CASCADE)
 *     - matchup_chat_blocks.matchup_id (-> matchups, CASCADE)
 *     - trade_offer_players.from_team_id (-> teams, CASCADE)
 *     - user_badges.team_id           (-> teams, SET NULL)
 *   (draft_teams' composite FK (team_id, league_id) -> teams already has a
 *   matching leading index and was not affected.)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase generic is untyped across the runner/lambda sandbox boundary
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE INDEX IF NOT EXISTS auction_budgets_team_id_idx
      ON public.auction_budgets USING btree (team_id);
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS draft_forfeited_picks_team_id_idx
      ON public.draft_forfeited_picks USING btree (team_id);
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS matchup_chat_blocks_matchup_id_idx
      ON public.matchup_chat_blocks USING btree (matchup_id);
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS trade_offer_players_from_team_id_idx
      ON public.trade_offer_players USING btree (from_team_id);
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS user_badges_team_id_idx
      ON public.user_badges USING btree (team_id);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase generic is untyped across the runner/lambda sandbox boundary
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(
    `DROP INDEX IF EXISTS public.auction_budgets_team_id_idx;`,
  );
  await db.execute(
    `DROP INDEX IF EXISTS public.draft_forfeited_picks_team_id_idx;`,
  );
  await db.execute(
    `DROP INDEX IF EXISTS public.matchup_chat_blocks_matchup_id_idx;`,
  );
  await db.execute(
    `DROP INDEX IF EXISTS public.trade_offer_players_from_team_id_idx;`,
  );
  await db.execute(`DROP INDEX IF EXISTS public.user_badges_team_id_idx;`);
};
