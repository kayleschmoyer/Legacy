import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Backfill Emmitt Smith and Walter Payton (LS-9765)
 *
 * Client report: the NFL Player stats page, filtered to Running backs and
 * sorted by rushing yards, showed Frank Gore (16,000 career yds) as the
 * all-time leader — ahead of Emmitt Smith (18,355, the actual NFL record)
 * and Walter Payton (16,726). The `footballPlayers` sort itself
 * (lambdas/db/src/schema/football.ts) was never the bug: `rushing.yds` has
 * always ordered by the real `career_football_rushing.yds` career total.
 * Smith and Payton simply had no `players` row at all, so they never had a
 * `career_football_rushing` row to sort by.
 *
 * Root cause: LS-9968. PFR's per-letter player-index page marks every Hall of
 * Fame inductee with a trailing "+" directly after their name (e.g.
 * "Emmitt Smith+ (RB) 1990-2004"). The old parser
 * (lib/pfr-client/src/lib/Players.ts) matched the `(POS)` token without
 * stripping that marker, so the regex never matched, `rawPosition` stayed
 * empty, `mapPfrPosition('')` returned null, and
 * apps/cli/src/commands/queuePlayers.ts's `processFootballLetter` silently
 * skipped the player — for every HOF player, not just these two. That parser
 * bug is already fixed. The `checkFootballHofCoverage` regression guard added
 * alongside it (apps/cli/src/commands/checkFootballHofCoverage.ts) missed
 * Emmitt Smith and Walter Payton specifically because it matched on last name
 * only: "Smith" and "Payton" both already had plenty of *other*, non-HOF
 * players in the table, so the guard reported them "present" — this migration
 * ships alongside a fix tightening that guard to check the individual by
 * `pfr_id`, not just surname.
 *
 * This is NOT the LS-9919/LS-9920 multi-team-season repair: that fixes
 * `career_football_rushing` aggregation for players who already have a
 * `players` row split across teams in a season. Smith and Payton had no row
 * to aggregate.
 *
 * Full per-season re-discovery (all 20+ affected HOF players, real
 * season-by-season rows) still needs the corrected `queuePlayers --sport
 * football` pipeline to run against PFR, which requires live network access
 * this migration doesn't have. This backfill unblocks the leaderboard bug
 * report now with well-established, undisputed NFL career totals for the two
 * players named in the ticket; season-level detail is deferred to that
 * re-run, same as every other career_football_* row already seeded this way
 * (see 20260822_100000_add_football_player_scoring_cache.ts's migration note).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    INSERT INTO public.players
      (first_name, last_name, bref_id, pfr_id, sport, is_dst, position, hall_of_fame)
    VALUES
      ('Emmitt', 'Smith',  'SmitEm00', 'SmitEm00', 'football', false, 'RB', true),
      ('Walter', 'Payton', 'PaytWa00', 'PaytWa00', 'football', false, 'RB', true)
    ON CONFLICT (pfr_id) WHERE pfr_id IS NOT NULL DO NOTHING;
  `);

  await db.execute(`
    INSERT INTO public.career_football_rushing (player_id, g, att, yds, td)
    SELECT p.id, v.g, v.att, v.yds, v.td
    FROM public.players p
    JOIN (VALUES
      ('SmitEm00', 226, 4409, 18355, 164),
      ('PaytWa00', 190, 3838, 16726, 110)
    ) AS v(pfr_id, g, att, yds, td) ON v.pfr_id = p.pfr_id
    ON CONFLICT (player_id) DO UPDATE SET
      g = excluded.g, att = excluded.att, yds = excluded.yds, td = excluded.td;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DELETE FROM public.career_football_rushing
    WHERE player_id IN (
      SELECT id FROM public.players WHERE pfr_id IN ('SmitEm00', 'PaytWa00')
    );
  `);
  await db.execute(`
    DELETE FROM public.players WHERE pfr_id IN ('SmitEm00', 'PaytWa00');
  `);
};
