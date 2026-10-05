/**
 * Matchup.lockTime — server-computed lineup lock instant.
 *
 * LS-6368 (FMD-043): the scheduled→in_progress lock itself is timezone-correct
 * (it's driven by matchup.startTime, an absolute UTC timestamp), but no field
 * exposed that instant to clients — so the UI had nothing to build a
 * "Lineup locks in 2h 14m" countdown from, and users in non-ET timezones had
 * no way to tell the lock was actually correct for their local kickoff.
 *
 * Mirrors the computation in `isRosterLocked` (lib/db-client) via the shared
 * `computeRosterLockTime` helper, so this always agrees with the lock that
 * actually gates roster moves.
 */

import { computeRosterLockTime } from '@legacy-sports/db-client';
import { type Context } from '../builder';

interface MatchupForLockTime {
  id: number;
  leagueId: number;
  status: string;
  startTime: string | null;
}

export async function resolveMatchupLockTime(
  matchup: MatchupForLockTime,
  context: Context,
): Promise<string | null> {
  // Once the matchup is no longer 'scheduled' the lock has already happened
  // (or never applies, e.g. cancelled) — nothing left to count down to.
  if (matchup.status !== 'scheduled') return null;

  // Resolved once per scheduled matchup, but the inputs are per-league — so
  // read them through a request-scoped loader. Selecting them per matchup
  // (LS-10042/LS-10045) issued 2 identical queries for every matchup in a
  // league-wide query and exhausted the pool (LS-10307).
  const inputs = await context.loaders.leagueRosterLockInputs.load(
    matchup.leagueId,
  );

  if (!inputs) return null;

  const lockTime = computeRosterLockTime(
    matchup.startTime,
    inputs.rosterLockTiming,
    inputs.lockRules,
  );

  return lockTime ? lockTime.toISOString() : null;
}
