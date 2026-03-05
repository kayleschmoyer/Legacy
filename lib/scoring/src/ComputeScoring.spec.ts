/**
 * Verifies that applyScoring (lib/utils) and computeScoring (lib/scoring)
 * produce identical results for the same clean numeric input.
 *
 * The two functions differ in iteration strategy (applyScoring iterates weights,
 * computeScoring iterates stats) and error handling (computeScoring throws on
 * non-numeric values; applyScoring silently skips them).  For well-formed data
 * — all stats present and numeric, all weights finite — both must return the
 * exact same sum.
 */

import { applyScoring } from '@legacy-sports/utils';
import { computeScoring } from './ComputeScoring';

describe('applyScoring vs computeScoring parity', () => {
  const weights = {
    hr: 4,
    rbi: 1,
    r: 1,
    sb: 2,
    so: -0.5,
    bb: 1,
    h: 1,
    doubles: 2,
    triples: 3,
  };

  const stats: Record<string, number> = {
    hr: 2,
    rbi: 5,
    r: 3,
    sb: 1,
    so: 4,
    bb: 2,
    h: 8,
    doubles: 1,
    triples: 0,
  };

  it('returns the same value for a full batting stat line', () => {
    const fromUtils = applyScoring(stats, weights);
    const fromScoring = computeScoring(stats, weights);
    expect(fromUtils).toBe(fromScoring);
  });

  it('returns the same value for a minimal stat line', () => {
    const minimal = { hr: 1, rbi: 2 };
    expect(applyScoring(minimal, weights)).toBe(
      computeScoring(minimal, weights),
    );
  });

  it('both return 0 when there are no matching keys', () => {
    // Cast to generic Record so TypeScript does not enforce key overlap; the
    // important invariant is that both functions agree on the numeric result.
    const unrelated: Record<string, number> = { wins: 10, era: 3.2 };
    const nonMatchingWeights: Record<string, number> = { hr: 4, rbi: 1 };
    expect(applyScoring(unrelated, nonMatchingWeights)).toBe(0);
    expect(computeScoring(unrelated, nonMatchingWeights)).toBe(0);
  });

  it('both return 0 for an all-zero stat line', () => {
    const zeroed = Object.fromEntries(Object.keys(stats).map((k) => [k, 0]));
    expect(applyScoring(zeroed, weights)).toBe(0);
    expect(computeScoring(zeroed, weights)).toBe(0);
  });
});
