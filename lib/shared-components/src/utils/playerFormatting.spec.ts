import {
  formatEligiblePositions,
  getPlayerAbbreviatedName,
  getPlayerName,
} from './playerFormatting';

describe('formatEligiblePositions', () => {
  it('joins multiple positions with a slash', () => {
    expect(formatEligiblePositions(['1B', 'OF'])).toBe('1B/OF');
  });

  it('returns a single position unchanged', () => {
    expect(formatEligiblePositions(['SS'])).toBe('SS');
  });

  it('returns an em dash for an empty array', () => {
    expect(formatEligiblePositions([])).toBe('—');
  });

  it('returns an em dash for null', () => {
    expect(formatEligiblePositions(null)).toBe('—');
  });

  it('returns an em dash for undefined', () => {
    expect(formatEligiblePositions(undefined)).toBe('—');
  });

  it('handles three positions', () => {
    expect(formatEligiblePositions(['SP', 'RP', 'P'])).toBe('SP/RP/P');
  });
});

describe('getPlayerName', () => {
  it('returns Unknown Player for null input', () => {
    expect(getPlayerName(null)).toBe('Unknown Player');
  });

  it('returns the nickname when set', () => {
    expect(
      getPlayerName({
        nickname: 'The Babe',
        player: { firstName: 'Babe', lastName: 'Ruth' },
      }),
    ).toBe('The Babe');
  });

  it('returns the full name when no nickname', () => {
    expect(
      getPlayerName({ player: { firstName: 'Mike', lastName: 'Trout' } }),
    ).toBe('Mike Trout');
  });
});

describe('getPlayerAbbreviatedName', () => {
  it('returns Unknown for null input', () => {
    expect(getPlayerAbbreviatedName(null)).toBe('Unknown');
  });

  it('abbreviates the first name', () => {
    expect(
      getPlayerAbbreviatedName({
        player: { firstName: 'Mike', lastName: 'Trout' },
      }),
    ).toBe('M. Trout');
  });
});
