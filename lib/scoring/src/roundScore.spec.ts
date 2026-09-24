import { roundScore } from './roundScore';

describe('roundScore', () => {
  it('collapses Float64 imprecision instead of storing it raw', () => {
    expect(12.1 + 0.2).not.toBe(12.3);
    expect(roundScore(12.1 + 0.2)).toBe('12.30');
  });

  it('formats whole numbers with 2 decimal places', () => {
    expect(roundScore(12)).toBe('12.00');
  });

  it('rounds a longer decimal to 2 places', () => {
    expect(roundScore(33.299999999999997)).toBe('33.30');
  });
});
