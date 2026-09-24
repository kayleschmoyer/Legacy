/**
 * Rounds a fantasy score to 2 decimal places before it is persisted, so a
 * JS Float64 sum (e.g. `12.1 + 0.2 === 12.299999999999999`) never gets
 * written to the DB's NUMERIC column as a long repeating decimal (LS-6389).
 */
export function roundScore(score: number): string {
  return score.toFixed(2);
}
