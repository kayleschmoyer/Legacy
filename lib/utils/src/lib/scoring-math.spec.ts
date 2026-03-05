import { applyScoring } from './scoring-math';

describe('applyScoring', () => {
  const weights = { hr: 4, rbi: 1, r: 1, sb: 2, so: -0.5 };

  it('returns 0 for empty stats', () => {
    expect(applyScoring({}, weights)).toBe(0);
  });

  it('returns 0 for empty weights', () => {
    expect(applyScoring({ hr: 3, rbi: 5 }, {})).toBe(0);
  });

  it('computes weighted sum for numeric stats', () => {
    const stats = { hr: 2, rbi: 5, r: 3, sb: 1, so: 4 };
    // 2*4 + 5*1 + 3*1 + 1*2 + 4*(-0.5) = 8 + 5 + 3 + 2 - 2 = 16
    expect(applyScoring(stats, weights)).toBe(16);
  });

  it('silently skips null stat values', () => {
    const stats: Record<string, unknown> = { hr: null, rbi: 3, r: 2 };
    // hr skipped (null), rbi=3*1=3, r=2*1=2 → 5
    expect(applyScoring(stats, weights)).toBe(5);
  });

  it('silently skips undefined stat values', () => {
    const stats: Record<string, unknown> = { hr: undefined, rbi: 2 };
    expect(applyScoring(stats, weights)).toBe(2);
  });

  it('silently skips non-numeric stat values', () => {
    const stats: Record<string, unknown> = { hr: 'N/A', rbi: 4 };
    expect(applyScoring(stats, weights)).toBe(4);
  });

  it('skips weight entries with zero multiplier', () => {
    const zeroWeights = { hr: 0, rbi: 1 };
    expect(applyScoring({ hr: 10, rbi: 2 }, zeroWeights)).toBe(2);
  });

  it('ignores stats with no matching weight', () => {
    const stats = { hr: 3, extraStat: 99 };
    expect(applyScoring(stats, weights)).toBe(12); // only hr: 3*4
  });
});
