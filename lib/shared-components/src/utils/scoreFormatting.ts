/**
 * Shared score formatting utilities used across web and mobile.
 *
 * Centralises `.toFixed(2)` patterns found in MatchupCard, MatchupScoreboard,
 * StandingsTable, PlayerProjections, LineupEditor, etc.
 */

/**
 * Format a fantasy score for display.
 * Returns "—" for null/undefined, otherwise the number with 2 decimal places.
 */
export function formatScore(
  value: number | null | undefined,
  placeholder = '—',
): string {
  if (value == null || !Number.isFinite(value)) {
    return placeholder;
  }

  return value.toFixed(2);
}

/**
 * Format a win-percentage (0–1) as a display string like ".667".
 * Returns "—" for null/undefined.
 */
export function formatWinPercentage(
  value: number | null | undefined,
  placeholder = '—',
): string {
  if (value == null || !Number.isFinite(value)) {
    return placeholder;
  }

  return value.toFixed(3).replace(/^0/, '');
}

/**
 * Format a record as "W-L" (e.g. "5-2").
 */
export function formatRecord(wins: number, losses: number): string {
  return `${wins}-${losses}`;
}

/**
 * Determine the colour token for a score delta indicator.
 * Positive → green, negative → red, zero/neutral → gray.
 */
export function getScoreDeltaColor(delta: number): string {
  if (delta > 0) return '$green10';
  if (delta < 0) return '$red10';
  return '$gray10';
}

/**
 * Determine which team is leading based on scores.
 * Returns 1 if team1 leads, 2 if team2 leads, 0 if tied.
 */
export function getLeadingTeam(
  team1Score: number | null | undefined,
  team2Score: number | null | undefined,
): 0 | 1 | 2 {
  const s1 = team1Score ?? 0;
  const s2 = team2Score ?? 0;

  if (s1 > s2) return 1;
  if (s2 > s1) return 2;
  return 0;
}
