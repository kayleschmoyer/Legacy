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
 * Format a record as "W-L" (e.g. "5-2"), or "W-L-T" when ties are non-zero
 * (e.g. "7-3-1").
 */
export function formatRecord(wins: number, losses: number, ties = 0): string {
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
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
 * Format a per-player or per-team fantasy points value (e.g. "12.5").
 *
 * Points are summed in floating point, so a line that nets to zero can land
 * on a tiny negative like -1e-16, which raw `toFixed(1)` renders as "-0.0".
 * Round first, then normalise -0 to 0 so near-zero values read "0.0" while
 * genuine negatives keep their sign (LS-10685). Rounds the magnitude so
 * halves round away from zero symmetrically (-0.25 → "-0.3", like 0.25).
 */
export function formatFantasyPoints(value: number, digits = 1): string {
  const factor = 10 ** digits;
  const rounded =
    (Math.sign(value) * Math.round(Math.abs(value) * factor)) / factor;
  return (Object.is(rounded, -0) ? 0 : rounded).toFixed(digits);
}

/**
 * Format a fantasy points total for display in a standings table.
 * Applies comma thousands-separators and one decimal place (e.g. 1548.2 → "1,548.2").
 * Returns "—" for null/undefined/non-finite values.
 */
export function formatPoints(
  value: number | null | undefined,
  placeholder = '—',
): string {
  if (value == null || !Number.isFinite(value)) {
    return placeholder;
  }

  const parts = formatFantasyPoints(value).split('.');
  const whole = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${whole}.${parts[1] ?? '0'}`;
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
