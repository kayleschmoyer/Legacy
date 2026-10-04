/**
 * Who Am I? (disclosure game) scoring — single source of truth (LS-10434).
 *
 * The server awards points with `calculateDisclosureScore` and the client
 * renders its scoring table with `buildDisclosureScoringTable`, so the copy a
 * player reads can never drift from what they are actually awarded.
 *
 * No DB, GraphQL, or platform-specific imports are allowed here — this module
 * is re-exported from the mobile (Hermes) barrels as well as the web one.
 */

/**
 * Minimum number of clues (facts) a player must have to be served in a round.
 * Rounds use every fact the player has, so the clue count is variable with
 * this as its floor.
 */
export const DISCLOSURE_MIN_CLUES = 5;

/** Points for a correct guess on the first clue. */
export const DISCLOSURE_MAX_SCORE = 1000;

/** Points floor for a correct guess on the last clue. */
export const DISCLOSURE_MIN_SCORE = 100;

/**
 * Score for a correct guess after `cluesRevealed` of `totalClues` clues.
 *
 * Scales linearly from DISCLOSURE_MAX_SCORE on the first clue down to
 * DISCLOSURE_MIN_SCORE on the last:
 *
 *   score = max(MIN, round(MAX - (cluesRevealed - 1) * ((MAX - MIN) / (totalClues - 1))))
 *
 * When totalClues <= 1 (or at most one clue was revealed) the full
 * DISCLOSURE_MAX_SCORE is awarded.
 */
export function calculateDisclosureScore(
  cluesRevealed: number,
  totalClues: number,
): number {
  if (totalClues <= 1 || cluesRevealed <= 1) return DISCLOSURE_MAX_SCORE;
  const range = DISCLOSURE_MAX_SCORE - DISCLOSURE_MIN_SCORE;
  const penalty = Math.round((range * (cluesRevealed - 1)) / (totalClues - 1));
  return Math.max(DISCLOSURE_MIN_SCORE, DISCLOSURE_MAX_SCORE - penalty);
}

export interface DisclosureScoringRow {
  /** e.g. "1 clue" or "2–3 clues" */
  label: string;
  /** e.g. "1,000 pts" or "850–700 pts" (highest first) */
  value: string;
}

// Manual thousands separator: avoids depending on Intl being present on Hermes.
const formatPoints = (points: number): string =>
  String(points).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * Build the scoring table shown to the player for a round of `totalClues`
 * clues. The first row is always the single-clue score; the remaining clue
 * counts are split into near-equal contiguous bands so the table stays at most
 * `maxRows` rows long whatever the round's clue count.
 *
 * Every value is computed with `calculateDisclosureScore`, the same function
 * the server uses to award points. A non-positive or non-finite `totalClues`
 * (round not started yet) falls back to DISCLOSURE_MIN_CLUES.
 */
export function buildDisclosureScoringTable(
  totalClues: number,
  maxRows = 4,
): DisclosureScoringRow[] {
  const total =
    Number.isFinite(totalClues) && totalClues >= 1
      ? Math.floor(totalClues)
      : DISCLOSURE_MIN_CLUES;
  const rows: DisclosureScoringRow[] = [
    {
      label: '1 clue',
      value: `${formatPoints(calculateDisclosureScore(1, total))} pts`,
    },
  ];

  const remaining = total - 1;
  const bandCount = Math.min(remaining, Math.max(1, maxRows - 1));
  let start = 2;
  for (let band = 0; band < bandCount; band++) {
    // Spread the remainder over the earliest bands so sizes differ by <= 1.
    const size =
      Math.floor(remaining / bandCount) +
      (band < remaining % bandCount ? 1 : 0);
    const end = start + size - 1;
    const high = calculateDisclosureScore(start, total);
    const low = calculateDisclosureScore(end, total);
    rows.push({
      label: start === end ? `${start} clues` : `${start}–${end} clues`,
      value:
        high === low
          ? `${formatPoints(high)} pts`
          : `${formatPoints(high)}–${formatPoints(low)} pts`,
    });
    start = end + 1;
  }

  return rows;
}
