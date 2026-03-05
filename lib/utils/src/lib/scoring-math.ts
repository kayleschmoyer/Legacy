/**
 * Pure scoring-math utilities shared by lib/scoring and lib/db-client.
 *
 * No DB, GraphQL, or platform-specific imports are allowed here.
 */

/**
 * Compute a fantasy score by applying multiplier weights to stat values.
 *
 * Iterates over `weights` keys; silently skips any stat value that is not a
 * finite number so callers never receive a NaN or throw from unexpected DB
 * nulls.  Multipliers of 0 / non-number are also skipped.
 */
export function applyScoring(
  stats: Record<string, unknown>,
  weights: Record<string, number>,
): number {
  let sum = 0;
  for (const [key, multiplier] of Object.entries(weights)) {
    if (!multiplier || typeof multiplier !== 'number') continue;
    const value = stats[key];
    if (value === null || value === undefined || typeof value !== 'number')
      continue;
    sum += multiplier * value;
  }
  return sum;
}
