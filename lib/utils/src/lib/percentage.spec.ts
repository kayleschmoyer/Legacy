import { roundPercentagesTo100 } from './percentage';

const total = (values: number[]): number =>
  values.reduce((sum, n) => sum + n, 0);

describe('roundPercentagesTo100', () => {
  it('leaves exact percentages untouched', () => {
    expect(roundPercentagesTo100([0.62, 0.38, 0])).toEqual([62, 38, 0]);
    expect(roundPercentagesTo100([0.49, 0.49, 0.02])).toEqual([49, 49, 2]);
  });

  it('sums to exactly 100 where independent Math.round overshoots', () => {
    // Math.round each: 50 / 50 / 1 = 101
    expect(roundPercentagesTo100([0.495, 0.495, 0.01])).toEqual([50, 49, 1]);
    // Math.round each: 34 / 34 / 33 = 101
    expect(roundPercentagesTo100([0.335, 0.335, 0.33])).toEqual([34, 33, 33]);
  });

  it('sums to exactly 100 where independent Math.round undershoots', () => {
    // Math.round each: 16 / 16 / 16 / 16 / 16 / 16 = 96
    const sixths = roundPercentagesTo100(Array<number>(6).fill(1 / 6));
    expect(total(sixths)).toBe(100);
    expect(sixths).toEqual([17, 17, 17, 17, 16, 16]);
  });

  it('hands leftover points to the largest remainders first', () => {
    // Floors 33 / 33 / 33 leave 1 point; 0.334 has the largest remainder.
    expect(roundPercentagesTo100([0.333, 0.334, 0.333])).toEqual([33, 34, 33]);
  });

  it('breaks remainder ties by original order, deterministically', () => {
    expect(roundPercentagesTo100([0.335, 0.335, 0.33])).toEqual([34, 33, 33]);
  });

  it('treats non-finite and negative inputs as zero', () => {
    expect(roundPercentagesTo100([0.5, NaN, 0.5])).toEqual([50, 0, 50]);
    expect(roundPercentagesTo100([1, -0.5, Infinity])).toEqual([100, 0, 0]);
  });

  it('keeps the win-probability triple summing to 100 across the unit range', () => {
    const offenders: string[] = [];
    for (let tie = 0; tie <= 100; tie += 1) {
      const tieProb = tie / 1000;
      const remaining = 1 - tieProb;
      for (let split = 0; split <= 100; split += 1) {
        const team1Prob = remaining * (split / 100);
        const inputs = [team1Prob, remaining - team1Prob, tieProb];
        const sum = total(roundPercentagesTo100(inputs));
        if (sum !== 100) offenders.push(`${inputs.join('/')} -> ${sum}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('returns an empty array for no inputs', () => {
    expect(roundPercentagesTo100([])).toEqual([]);
  });
});
