import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Backfill players.nfl_team for Emmitt Smith and Walter Payton (LS-10670)
 *
 * Client report: on /players NFL Overview, Emmitt Smith's TEAM column showed
 * "—" while other retired players show a team (e.g. Archie Manning → MIN).
 *
 * Root cause: both players were hand-inserted by
 * 20260909_120000_backfill_missing_hof_rb_players.ts (LS-9765) without an
 * nfl_team, and they have career_football_rushing rows but no
 * football_season_* rows, so the latest-season-team backfill
 * (20260820_034000_backfill_players_nfl_team.ts, LS-9477) had nothing to map
 * from. The nflverse seeder skips pfr_ids that already exist, so it never
 * fills them either.
 *
 * Convention: last team, mapped to the modern franchise abbreviation — the
 * same rule LS-9477 applies (latest season row; PHO → ARI). Smith finished
 * with the Arizona Cardinals (2003–04) → ARI; Payton played his whole career
 * with the Bears → CHI.
 *
 * Coverage: in dev these are the only two football players with career stats
 * and a NULL nfl_team. The other ~4,700 NULL-team football rows have neither
 * career stats nor a team on any season row, so there is nothing to map.
 *
 * Idempotent: only fills a NULL nfl_team, so re-running is a no-op and a team
 * set later by another path is never overwritten.
 */

export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    UPDATE public.players p
    SET nfl_team = v.nfl_team
    FROM (VALUES
      ('SmitEm00', 'ARI'),
      ('PaytWa00', 'CHI')
    ) AS v(pfr_id, nfl_team)
    WHERE p.pfr_id = v.pfr_id
      AND p.sport = 'football'
      AND p.nfl_team IS NULL;
  `);
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // Both rows had a NULL nfl_team before `up`; only clear the exact values
  // this migration set.
  await db.execute(`
    UPDATE public.players p
    SET nfl_team = NULL
    FROM (VALUES
      ('SmitEm00', 'ARI'),
      ('PaytWa00', 'CHI')
    ) AS v(pfr_id, nfl_team)
    WHERE p.pfr_id = v.pfr_id
      AND p.sport = 'football'
      AND p.nfl_team = v.nfl_team;
  `);
};
