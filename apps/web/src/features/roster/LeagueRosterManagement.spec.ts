import {
  getLineupGroup,
  getPaceColor,
  isPlayerLocked,
  PACE_GREEN,
  PACE_RED,
} from './LeagueRosterManagement';
import type { PlayerMatchupData } from '../../pages/baseball/LeagueDetailPage';

describe('getLineupGroup', () => {
  it.each(['SP', 'RP'])('routes pitcher slot %s to "pitchers"', (pos) => {
    expect(getLineupGroup(pos)).toBe('pitchers');
  });

  it.each([
    'C',
    '1B',
    '2B',
    '3B',
    'SS',
    'LF',
    'CF',
    'RF',
    'OF',
    'IF',
    'DH',
    'XDH',
  ])('routes non-pitcher slot %s to "hitters"', (pos) => {
    expect(getLineupGroup(pos)).toBe('hitters');
  });

  it('routes unknown / empty positionType to "hitters" (safe default)', () => {
    expect(getLineupGroup('')).toBe('hitters');
    expect(getLineupGroup('UNKNOWN')).toBe('hitters');
  });
});

describe('getPaceColor', () => {
  const baseData = (
    overrides: Partial<PlayerMatchupData> = {},
  ): PlayerMatchupData => ({
    score: 0,
    projection: 100,
    gamesPlayed: 5,
    totalGames: 10,
    isLocked: false,
    ...overrides,
  });

  it('returns undefined when matchupData is missing', () => {
    expect(getPaceColor(undefined)).toBeUndefined();
  });

  it('returns undefined when score is null', () => {
    expect(getPaceColor(baseData({ score: null }))).toBeUndefined();
  });

  it('returns undefined when projection is null', () => {
    expect(getPaceColor(baseData({ projection: null }))).toBeUndefined();
  });

  it('returns undefined when gamesPlayed is 0 (no fraction yet)', () => {
    expect(
      getPaceColor(baseData({ gamesPlayed: 0, totalGames: 10, score: 50 })),
    ).toBeUndefined();
  });

  it('falls back to full projection as target when totalGames is 0', () => {
    // frac = 1 (full projection); ratio = (110 - 100) / 100 = +10% → green
    expect(
      getPaceColor(
        baseData({
          gamesPlayed: 0,
          totalGames: 0,
          score: 110,
          projection: 100,
        }),
      ),
    ).toBe(PACE_GREEN);
  });

  it('returns green when actual is ≥ 10% above pace target', () => {
    // target = 100 * (5/10) = 50; ratio = (55 - 50) / 50 = +10%
    expect(
      getPaceColor(
        baseData({
          score: 55,
          projection: 100,
          gamesPlayed: 5,
          totalGames: 10,
        }),
      ),
    ).toBe(PACE_GREEN);
  });

  it('returns red when actual is ≤ 10% below pace target', () => {
    // target = 50; ratio = (45 - 50) / 50 = -10%
    expect(
      getPaceColor(
        baseData({
          score: 45,
          projection: 100,
          gamesPlayed: 5,
          totalGames: 10,
        }),
      ),
    ).toBe(PACE_RED);
  });

  it('returns undefined for ratios strictly inside the ±10% band', () => {
    // target = 50; ratio = (52 - 50) / 50 = +4%
    expect(
      getPaceColor(
        baseData({
          score: 52,
          projection: 100,
          gamesPlayed: 5,
          totalGames: 10,
        }),
      ),
    ).toBeUndefined();
  });

  it('returns undefined when target is non-positive (projection ≤ 0)', () => {
    expect(
      getPaceColor(
        baseData({ score: 1, projection: 0, gamesPlayed: 5, totalGames: 10 }),
      ),
    ).toBeUndefined();
    expect(
      getPaceColor(
        baseData({ score: 1, projection: -5, gamesPlayed: 5, totalGames: 10 }),
      ),
    ).toBeUndefined();
  });
});

describe('isPlayerLocked', () => {
  const makeMap = (
    entries: [number, boolean][],
  ): ReadonlyMap<number, PlayerMatchupData> =>
    new Map(
      entries.map(([id, isLocked]) => [
        id,
        { score: 0, projection: 0, gamesPlayed: 0, totalGames: 0, isLocked },
      ]),
    );

  it('returns false when playerMatchupData is absent', () => {
    expect(isPlayerLocked(1, undefined)).toBe(false);
  });

  it('returns false when playerId is null', () => {
    expect(isPlayerLocked(null, makeMap([[1, true]]))).toBe(false);
  });

  it('returns false when playerId is undefined', () => {
    expect(isPlayerLocked(undefined, makeMap([[1, true]]))).toBe(false);
  });

  it('returns false when player is not in the matchup data', () => {
    expect(isPlayerLocked(99, makeMap([[1, true]]))).toBe(false);
  });

  it('returns false when player matchup data shows unlocked', () => {
    expect(isPlayerLocked(1, makeMap([[1, false]]))).toBe(false);
  });

  it('returns true when player matchup data shows locked', () => {
    expect(isPlayerLocked(1, makeMap([[1, true]]))).toBe(true);
  });
});
