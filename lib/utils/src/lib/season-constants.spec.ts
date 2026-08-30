import {
  MIN_SEASON_GAMES_FOR_SELECTION,
  resolveEligibleSeasons,
  SEASON_MATCHUP_MULTIPLIER,
} from './season-constants';

describe('resolveEligibleSeasons', () => {
  // The league floor for the default 5-game baseball matchup.
  const leagueFloor = 5 * SEASON_MATCHUP_MULTIPLIER;

  it('returns only seasons at or above MIN_SEASON_GAMES_FOR_SELECTION when the player has some', () => {
    const result = resolveEligibleSeasons(
      new Map([
        [1921, 12], // clears the league floor but not the selection floor
        [1922, MIN_SEASON_GAMES_FOR_SELECTION],
        [1923, 140],
      ]),
      leagueFloor,
    );

    expect(result.tier).toBe('preferred');
    expect(result.minGamesApplied).toBe(MIN_SEASON_GAMES_FOR_SELECTION);
    expect(result.seasons).toEqual([1922, 1923]);
  });

  it('falls back to the league floor when no season clears the selection floor', () => {
    // A player whose only season is below N — the AC3 case. They keep the
    // eligibility they have today rather than dropping out of the matchup.
    const result = resolveEligibleSeasons(new Map([[1980, 12]]), leagueFloor);

    expect(result.tier).toBe('fallback');
    expect(result.minGamesApplied).toBe(leagueFloor);
    expect(result.seasons).toEqual([1980]);
  });

  it('reports no eligible season when nothing clears even the league floor', () => {
    const result = resolveEligibleSeasons(
      new Map([
        [1979, 3],
        [1980, 9],
      ]),
      leagueFloor,
    );

    expect(result.tier).toBe('none');
    expect(result.seasons).toEqual([]);
  });

  it('reports no eligible season for a player with no season data at all', () => {
    const result = resolveEligibleSeasons(new Map(), leagueFloor);

    expect(result.tier).toBe('none');
    expect(result.seasons).toEqual([]);
  });

  it('never lowers a league floor that already exceeds the selection floor', () => {
    // A 20-game matchup has a league floor of 40, above the absolute floor of
    // 25 — the higher of the two must win, and the fallback tier collapses
    // into it rather than admitting thinner seasons.
    const highFloor = 20 * SEASON_MATCHUP_MULTIPLIER;
    expect(highFloor).toBeGreaterThan(MIN_SEASON_GAMES_FOR_SELECTION);

    const result = resolveEligibleSeasons(
      new Map([
        [1998, 30],
        [1999, 45],
      ]),
      highFloor,
    );

    expect(result.tier).toBe('preferred');
    expect(result.minGamesApplied).toBe(highFloor);
    expect(result.seasons).toEqual([1999]);
  });

  it('keeps the selection floor meaningfully above gamesPerMatchup', () => {
    // Guards the LS-9534 reasoning: a floor of gamesPerMatchup + 1 (or the old
    // 2x league floor) still lets a 5-game matchup consume most of a season.
    // 25 keeps the default matchup at no more than 20% of the season.
    const gamesPerMatchup = 5;
    expect(MIN_SEASON_GAMES_FOR_SELECTION).toBeGreaterThan(
      gamesPerMatchup * SEASON_MATCHUP_MULTIPLIER,
    );
    expect(
      gamesPerMatchup / MIN_SEASON_GAMES_FOR_SELECTION,
    ).toBeLessThanOrEqual(0.2);
  });
});
