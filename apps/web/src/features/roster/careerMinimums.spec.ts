import { type CareerRecord, isBelowCareerMinimums } from './careerMinimums';

// Modern pure pitcher, 8 G / 1 season, no batting record (the LS-10807 report).
const rookiePitcher: CareerRecord = {
  careerBatting: null,
  seasonsPlayed: 0,
  careerPitching: { games: 8 },
  pitchingSeasonsPlayed: 1,
};
const veteranPitcher: CareerRecord = {
  careerBatting: null,
  seasonsPlayed: 0,
  careerPitching: { games: 90 },
  pitchingSeasonsPlayed: 3,
};
const rookieBatter: CareerRecord = {
  careerBatting: { games: 20 },
  seasonsPlayed: 1,
  careerPitching: null,
  pitchingSeasonsPlayed: 0,
};
const veteranBatter: CareerRecord = {
  careerBatting: { games: 400 },
  seasonsPlayed: 4,
  careerPitching: null,
  pitchingSeasonsPlayed: 0,
};
// Two-way: clears the pitcher set only.
const twoWayPitcher: CareerRecord = {
  careerBatting: { games: 120 },
  seasonsPlayed: 2,
  careerPitching: { games: 90 },
  pitchingSeasonsPlayed: 3,
};
// Two-way: below both sets.
const twoWayRookie: CareerRecord = {
  careerBatting: { games: 40 },
  seasonsPlayed: 1,
  careerPitching: { games: 10 },
  pitchingSeasonsPlayed: 1,
};

describe('isBelowCareerMinimums', () => {
  const batterOnly = { minCareerGames: 50, minCareerSeasons: 3 };
  const split = {
    ...batterOnly,
    minCareerPitcherGames: 25,
    minCareerPitcherSeasons: 3,
  };

  it('keeps the legacy batter-only rule while pitcher minimums are off', () => {
    expect(isBelowCareerMinimums(rookiePitcher, batterOnly)).toBe(false);
    expect(isBelowCareerMinimums(rookieBatter, batterOnly)).toBe(true);
    expect(isBelowCareerMinimums(veteranBatter, batterOnly)).toBe(false);
  });

  it('flags a pitcher below the pitcher minimums and clears one above', () => {
    expect(isBelowCareerMinimums(rookiePitcher, split)).toBe(true);
    expect(isBelowCareerMinimums(veteranPitcher, split)).toBe(false);
  });

  it('judges position players on batting only', () => {
    expect(isBelowCareerMinimums(rookieBatter, split)).toBe(true);
    expect(isBelowCareerMinimums(veteranBatter, split)).toBe(false);
    expect(
      isBelowCareerMinimums(rookieBatter, {
        minCareerPitcherGames: 25,
        minCareerPitcherSeasons: 3,
      }),
    ).toBe(false);
  });

  it('clears a two-way player who meets either full set', () => {
    expect(isBelowCareerMinimums(twoWayPitcher, split)).toBe(false);
    expect(isBelowCareerMinimums(twoWayRookie, split)).toBe(true);
  });
});
