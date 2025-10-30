import { computeAverageScoring, computeScoring } from './ComputeScoring';

describe('computeScoring', () => {
  it('computes total based on provided multipliers', () => {
    const total = computeScoring(
      { hr: 10, r: 20, playerName: 'Sample' },
      { hr: 4, r: 1 },
    );

    expect(total).toBe(60);
  });

  it('ignores stats without multipliers', () => {
    const total = computeScoring({ hr: 5, sb: 3 }, { hr: 4 });

    expect(total).toBe(20);
  });

  it('throws when stat value is non-numeric', () => {
    expect(() => computeScoring({ hr: 'ten' }, { hr: 4 })).toThrow(
      'Cannot compute non-numeric stat: hr',
    );
  });

  it('throws when multiplier is not finite', () => {
    expect(() =>
      computeScoring({ hr: 10 }, { hr: Number.POSITIVE_INFINITY }),
    ).toThrow('Cannot compute with non-finite multiplier: hr');
  });
});

describe('computeAverageScoring', () => {
  it('returns per-game scoring when games present', () => {
    const average = computeAverageScoring({ hr: 10, g: 5 }, { hr: 4 });

    expect(average).toBe(8);
  });

  it('returns zero when games are not present', () => {
    const average = computeAverageScoring({ hr: 10 }, { hr: 4 });

    expect(average).toBe(0);
  });
});
