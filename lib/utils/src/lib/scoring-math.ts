/**
 * Pure scoring-math utilities shared by lib/scoring and lib/db-client.
 *
 * No DB, GraphQL, or platform-specific imports are allowed here.
 */

/**
 * Compute a fantasy score by applying multiplier weights to stat values.
 *
 * Iterates over `weights` (plus any `positionBonuses` keys); silently skips
 * any stat value that is not a finite number so callers never receive a NaN
 * or throw from unexpected DB nulls. Multipliers of 0 / non-number are also
 * skipped.
 *
 * `positionBonuses` (LS-9104) is an optional, position-scoped bonus applied
 * additively on top of the base weight for the same stat key — never a
 * replacement — so a league can grant e.g. a TE-premium PPR bonus without
 * touching the base `receiving.rec` multiplier every other position shares.
 */
export function applyScoring(
  stats: Record<string, unknown>,
  weights: Record<string, number>,
  positionBonuses?: Record<string, number>,
): number {
  let sum = 0;
  const keys = positionBonuses
    ? new Set([...Object.keys(weights), ...Object.keys(positionBonuses)])
    : Object.keys(weights);

  for (const key of keys) {
    const baseWeight = weights[key];
    const bonus = positionBonuses?.[key];
    const baseMultiplier = typeof baseWeight === 'number' ? baseWeight : 0;
    const bonusMultiplier = typeof bonus === 'number' ? bonus : 0;
    const multiplier = baseMultiplier + bonusMultiplier;
    if (!multiplier) continue;

    const value = stats[key];
    if (value === null || value === undefined || typeof value !== 'number')
      continue;
    sum += multiplier * value;
  }
  return sum;
}
