import {
  defaultDivisionCount,
  isValidDivisionCount,
  validDivisionCounts,
} from './division-rules';

describe('division rules', () => {
  it('requires at least 6 teams per division', () => {
    expect(validDivisionCounts(12)).toEqual([1, 2]);
    expect(validDivisionCounts(10)).toEqual([1]);
    expect(validDivisionCounts(16)).toEqual([1, 2]);
    expect(isValidDivisionCount(12, 4)).toBe(false);
  });

  it('keeps parity and bounds checks', () => {
    expect(isValidDivisionCount(13, 2)).toBe(false);
    expect(isValidDivisionCount(4, 5)).toBe(false);
    expect(isValidDivisionCount(4, 0)).toBe(false);
  });

  it('defaults to two divisions only when each reaches 6 teams', () => {
    expect(defaultDivisionCount(12)).toBe(2);
    expect(defaultDivisionCount(8)).toBe(1);
  });
});
