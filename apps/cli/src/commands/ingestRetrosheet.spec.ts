import { FIRST_SEASON, resolveSeasonRange } from './ingestRetrosheet';

// Mid-2026: the 2026 season is in progress and its archive is not published.
const NOW = new Date('2026-09-19T12:00:00Z');

describe('resolveSeasonRange', () => {
  it('defaults to the first season through last year', () => {
    expect(resolveSeasonRange({}, NOW)).toEqual({
      ok: true,
      from: FIRST_SEASON,
      to: 2025,
    });
  });

  it('accepts an explicit --to of the current season (LS-10232)', () => {
    expect(resolveSeasonRange({ from: 2026, to: 2026 }, NOW)).toEqual({
      ok: true,
      from: 2026,
      to: 2026,
    });
  });

  it('moves the default upper bound forward with the calendar', () => {
    expect(resolveSeasonRange({}, new Date('2027-02-01T00:00:00Z'))).toEqual({
      ok: true,
      from: FIRST_SEASON,
      to: 2026,
    });
  });

  it('clamps --to past the current season to the current season', () => {
    expect(resolveSeasonRange({ from: 2024, to: 2030 }, NOW)).toEqual({
      ok: true,
      from: 2024,
      to: 2026,
    });
  });

  it('clamps --from before Retrosheet coverage to the first season', () => {
    expect(resolveSeasonRange({ from: 1850, to: 1900 }, NOW)).toEqual({
      ok: true,
      from: FIRST_SEASON,
      to: 1900,
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
