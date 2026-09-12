import { pgTable, varchar, timestamp } from 'drizzle-orm/pg-core';
import { nflTeams } from './FootballTeams';

/**
 * Per-team real-world NFL kickoff instant (LS-9687).
 *
 * One row per NFL franchise (`nfl_teams.abbreviation`), holding that team's
 * current/most-recently-announced real kickoff time. Populated ahead of game
 * day (see `upsertTeamKickoffTimes` in `PublicDbClient`) independent of any
 * single league's draft/cron state — this is what lets
 * `checkPlayersNotLocked` / the roster-position mutations reject a move the
 * instant a specific player's own NFL team has actually kicked off, even
 * before a league's whole-week `matchups.status` has transitioned off
 * `'scheduled'` (the bootstrap-timing race the whole-week check can't close
 * on its own, since it depends on the once-nightly `autoSelectGames` cron).
 *
 * `kickoffTime` is nullable: a team on a bye week (or a team whose next
 * kickoff hasn't been announced/populated yet) has no row, or a null
 * `kickoffTime` — callers must treat that as "not locked by this check",
 * not as "started". A postponed/rescheduled game is handled by simply
 * upserting a corrected `kickoffTime` — no separate code path needed.
 */
export const nflTeamKickoffTimes = pgTable('nfl_team_kickoff_times', {
  teamAbbreviation: varchar('team_abbreviation', { length: 10 })
    .primaryKey()
    .references(() => nflTeams.abbreviation),
  kickoffTime: timestamp('kickoff_time', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
