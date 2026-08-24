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

import { computeRosterLockTime, PublicSchema } from '@legacy-sports/db-client';
import { eq } from 'drizzle-orm';
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

  const [league] = await context.db
    .select({ rosterLockTiming: PublicSchema.leagues.rosterLockTiming })
    .from(PublicSchema.leagues)
    .where(eq(PublicSchema.leagues.id, matchup.leagueId))
    .limit(1);

  if (!league) return null;

  const [lockRules] = await context.db
    .select({
      customLockTime: PublicSchema.rosterLockRules.customLockTime,
      lockHoursBeforeMatchup:
        PublicSchema.rosterLockRules.lockHoursBeforeMatchup,
    })
    .from(PublicSchema.rosterLockRules)
    .where(eq(PublicSchema.rosterLockRules.leagueId, matchup.leagueId))
    .limit(1);

  const lockTime = computeRosterLockTime(
    matchup.startTime,
    league.rosterLockTiming,
    lockRules,
  );

  return lockTime ? lockTime.toISOString() : null;
}
