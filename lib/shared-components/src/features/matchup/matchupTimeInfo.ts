import { MatchupStatus } from '@legacy-sports/graphql';

/** Short weekday + clock form of an ISO timestamp (e.g. "Sun 1:00 PM"), or null if absent/invalid. */
function formatShortDateTime(iso: string): string | null {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString(undefined, {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
}

/**
 * Formats the kickoff/time-remaining label shown on the football matchup
 * scoreboard (LS-5430): "Kickoff <start>" while the matchup hasn't started,
 * "Ends <end>" while it's live, and nothing once it's decided. Both
 * `startTime`/`endTime` represent the matchup's whole scoring window (there is
 * no per-game kickoff time on the Matchup type), so this is intentionally a
 * week-level label, not a live game clock.
 */
export function formatMatchupTimeInfo(
  status: string | null | undefined,
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): string | null {
  if (status === MatchupStatus.Scheduled && startTime) {
    const formatted = formatShortDateTime(startTime);
    return formatted ? `Kickoff ${formatted}` : null;
  }
  if (status === MatchupStatus.InProgress && endTime) {
    const formatted = formatShortDateTime(endTime);
    return formatted ? `Ends ${formatted}` : null;
  }
  return null;
}
