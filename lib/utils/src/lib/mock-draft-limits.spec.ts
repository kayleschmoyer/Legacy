import {
  clampUserPickPosition,
  getPickPositionError,
  MAX_MOCK_DRAFT_TEAMS,
  MIN_MOCK_DRAFT_TEAMS,
} from './mock-draft-limits';

describe('mock-draft-limits', () => {
  it('keeps the minimum below the maximum', () => {
    expect(MIN_MOCK_DRAFT_TEAMS).toBeLessThan(MAX_MOCK_DRAFT_TEAMS);
  });

  describe('clampUserPickPosition', () => {
    it.each([
      [1, 12, 1],
      [7, 12, 7],
      [12, 12, 12],
      [10, 4, 4],
      [13, 12, 12],
      [0, 12, 1],
      [-3, 12, 1],
      [2.9, 12, 2],
      [Number.NaN, 12, 1],
      [Number.POSITIVE_INFINITY, 12, 1],
    ])(
      'clamps %p into a %p-team draft as %p',
      (position, numTeams, expected) => {
        expect(clampUserPickPosition(position, numTeams)).toBe(expected);
      },
    );

    it('never returns less than 1 even for a degenerate team count', () => {
      expect(clampUserPickPosition(5, 0)).toBe(1);
    });
  });

  describe('getPickPositionError', () => {
    it('returns null for every in-range position', () => {
      for (let p = 1; p <= 12; p++) {
        expect(getPickPositionError(p, 12)).toBeNull();
      }
    });

    it('uses distinct copy for below-range and above-range positions', () => {
      const low = getPickPositionError(-1, 10);
      const zero = getPickPositionError(0, 10);
      const high = getPickPositionError(13, 12);

      expect(low).toBe('Draft position must be at least 1 (got -1)');
      expect(zero).toBe('Draft position must be at least 1 (got 0)');
      expect(high).toBe(
        'Draft position 13 is past the last pick — a 12-team draft only has positions 1 to 12',
      );
      expect(low).not.toBe(high);
    });

    it('rejects non-integer positions', () => {
      expect(getPickPositionError(1.5, 12)).toBe(
        'Draft position must be a whole number',
      );
    });
  });
});
