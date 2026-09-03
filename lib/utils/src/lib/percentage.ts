/**
 * Pure percentage-display helpers.
 *
 * No DB, GraphQL, or platform-specific imports are allowed here — this module
 * is re-exported from the mobile (Hermes) barrels as well as the web one.
 */

/**
 * Converts a set of proportions that sum to 1 into whole percentages that sum
 * to exactly 100, using the largest-remainder (Hare–Niemeyer) method.
 *
 * Rounding each proportion independently with `Math.round` does not preserve
 * the total: `0.495 / 0.495 / 0.01` renders as `50 / 50 / 1` (101) and
 * `0.335 / 0.335 / 0.33` renders as `34 / 34 / 33` (101). A win-probability
 * panel whose numbers do not add up to 100 reads as broken to a user.
 *
 * Every value is floored first, then the leftover points are handed out one at
 * a time to the largest fractional remainders. Ties are broken by original
 * order so the output is deterministic.
 *
 * The exact-100 guarantee holds whenever the inputs sum to 1, which is the
 * case for mutually exclusive, exhaustive probabilities. Non-finite and
 * negative inputs are treated as 0.
 */
export function roundPercentagesTo100(proportions: number[]): number[] {
  const scaled = proportions.map((p) =>
    Number.isFinite(p) && p > 0 ? p * 100 : 0,
  );
  const percentages = scaled.map((value) => Math.floor(value));
  let leftover = 100 - percentages.reduce((sum, n) => sum + n, 0);

  const byLargestRemainder = scaled
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  for (const { index } of byLargestRemainder) {
    if (leftover <= 0) break;
    percentages[index] = (percentages[index] ?? 0) + 1;
    leftover -= 1;
  }

  return percentages;
}
