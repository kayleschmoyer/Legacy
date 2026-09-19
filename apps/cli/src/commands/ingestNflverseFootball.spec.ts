import {
  currentNflSeason,
  FIRST_SEASON,
  resolveSeasonRange,
} from './ingestNflverseFootball';

// Mid-September 2026: the 2026 NFL season is under way, so nflverse is already
// publishing its weekly stats file.
const NOW = new Date('2026-09-19T12:00:00Z');

describe('currentNflSeason', () => {
  it('is the calendar year once the season has kicked off', () => {
    expect(currentNflSeason(NOW)).toBe(2026);
  });

  it('is still last calendar year during the playoffs and the offseason', () => {
    // January 2027 is the 2026 season's postseason, and August 2027 is before
    // the 2027 season opens — both resolve to 2026.
    expect(currentNflSeason(new Date('2027-01-15T00:00:00Z'))).toBe(2026);
    expect(currentNflSeason(new Date('2027-08-31T00:00:00Z'))).toBe(2026);
  });
});

describe('resolveSeasonRange', () => {
  it('defaults to the first season through the current season', () => {
    expect(resolveSeasonRange({}, NOW)).toEqual({
      ok: true,
      from: FIRST_SEASON,
      to: 2026,
    });
  });

  it('accepts an explicit --from/--to of the in-progress season (LS-10235)', () => {
    expect(resolveSeasonRange({ from: 2026, to: 2026 }, NOW)).toEqual({
      ok: true,
      from: 2026,
      to: 2026,
    });
  });

  it('moves the default upper bound forward with the calendar', () => {
    expect(resolveSeasonRange({}, new Date('2027-09-15T00:00:00Z'))).toEqual({
      ok: true,
      from: FIRST_SEASON,
      to: 2027,
    });
  });

  it('clamps --to past the current season to the current season', () => {
    expect(resolveSeasonRange({ from: 2024, to: 2030 }, NOW)).toEqual({
      ok: true,
      from: 2024,
      to: 2026,
    });
  });

  it('clamps --from before nflverse coverage to the first season', () => {
    expect(resolveSeasonRange({ from: 1950, to: 2000 }, NOW)).toEqual({
      ok: true,
      from: FIRST_SEASON,
      to: 2000,
    });
  });

  it('rejects a range that is empty after clamping', () => {
    const range = resolveSeasonRange({ from: 2030 }, NOW);
    expect(range.ok).toBe(false);
  });

  it('rejects a non-integer year instead of silently running zero seasons', () => {
    expect(resolveSeasonRange({ from: Number.NaN }, NOW)).toEqual({
      ok: false,
      error: '--from must be a whole year (got: NaN)',
    });
  });
});
