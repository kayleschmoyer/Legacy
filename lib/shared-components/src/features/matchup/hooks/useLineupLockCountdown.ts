/**
 * useLineupLockCountdown — pre-lock lineup countdown (LS-6368 / FMD-043).
 *
 * The scheduled→in_progress lock is already timezone-correct: it fires off
 * `matchup.lockTime`, an absolute UTC instant computed server-side from the
 * league's roster-lock settings (see lambdas/db `Matchup.lockTime` resolver).
 * The reported bug was purely a UI gap — leagues in PT saw the lock land at
 * 10am local with no explanation, even though that's the correct instant for
 * a 1pm ET kickoff. This hook turns that server timestamp into a live
 * countdown so the banner can say so.
 */
import { useEffect, useState } from 'react';

export interface LineupLockCountdownMatchup {
  status?: string | null;
  lockTime?: string | null;
}

export interface LineupLockCountdown {
  /** The computed lock instant, or null if there's nothing to count down to. */
  nextLockAt: Date | null;
  /** Seconds until lock, floored at 0. Null when there's no lockTime to count down to. */
  secondsRemaining: number | null;
}

/**
 * Ticks a countdown to `matchup.lockTime`. Takes the matchup fragment
 * directly (already fetched by the page-level matchup query) rather than a
 * matchupId + separate network round trip, matching how sibling components
 * (MatchupScoreboard, MatchupWinProbabilityPanel, etc.) consume matchup data
 * on this page.
 */
export function useLineupLockCountdown(
  matchup: LineupLockCountdownMatchup | null | undefined,
): LineupLockCountdown {
  const lockTimeIso = matchup?.lockTime ?? null;
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  useEffect(() => {
    const deadline = lockTimeIso ? new Date(lockTimeIso).getTime() : NaN;
    if (Number.isNaN(deadline)) {
      setSecondsRemaining(null);
      return;
    }

    const tick = () => {
      setSecondsRemaining(
        Math.max(0, Math.round((deadline - Date.now()) / 1000)),
      );
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [lockTimeIso]);

  const parsedLockAt = lockTimeIso ? new Date(lockTimeIso) : null;
  const nextLockAt =
    parsedLockAt && !Number.isNaN(parsedLockAt.getTime()) ? parsedLockAt : null;
  return { nextLockAt, secondsRemaining };
}
