import {
  assertNoFailedSeasons,
  currentNflSeason,
  fetchWeeklyStatsCsv,
  FIRST_SEASON,
  resolveSeasonRange,
  weeklyStatsUrl,
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

describe('fetchWeeklyStatsCsv (LS-10223)', () => {
  const realFetch = global.fetch;
  const respond = (status: number, body = '') =>
    jest
      .fn<Promise<Response>, [string]>()
      .mockResolvedValue(new Response(body, { status }));

  afterEach(() => {
    global.fetch = realFetch;
  });

  it('returns null for a season nflverse has not posted yet', async () => {
    const fetchMock = respond(404);
    global.fetch = fetchMock;

    await expect(fetchWeeklyStatsCsv(2026)).resolves.toBeNull();
    expect(fetchMock.mock.calls[0][0]).toBe(weeklyStatsUrl(2026));
  });

  it('returns the CSV body when the season exists', async () => {
    global.fetch = respond(200, 'season,week\n2003,1\n');

    await expect(fetchWeeklyStatsCsv(2003)).resolves.toBe(
      'season,week\n2003,1\n',
    );
  });

  it('still throws on non-404 HTTP failures', async () => {
    global.fetch = respond(500);

    await expect(fetchWeeklyStatsCsv(2003)).rejects.toThrow('failed: 500');
  });
});

describe('weeklyStatsUrl (LS-10224)', () => {
  // The release TAG is the load-bearing part. nflverse's `player_stats`
  // release only mirrors some stats_player_week_YYYY.csv files — it is missing
  // 2002, 2019 and 2025, which 404'd in a real dry-run. The canonical
  // `stats_player` release carries all of 1999-2025.
  it('downloads weekly stats from the stats_player release', () => {
    expect(weeklyStatsUrl(2002)).toBe(
      'https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2002.csv',
    );
  });

  it.each([2002, 2019, 2025])(
    'does not use the player_stats release, which lacks %i',
    (season) => {
      expect(weeklyStatsUrl(season)).not.toContain('/player_stats/');
    },
  );
});

describe('assertNoFailedSeasons (LS-10224)', () => {
  it('does nothing when every season downloaded', () => {
    expect(() => assertNoFailedSeasons([])).not.toThrow();
  });

  // A failed season is skipped so the rest of the run still lands, but the
  // run must not then report success: an operator would ship a corpus with
  // whole seasons missing and exit code 0. The throw reaches the CLI's
  // top-level catch in main.ts, which exits 1.
  it('throws, naming every failed season, when any season failed', () => {
    expect(() => assertNoFailedSeasons([2002, 2019, 2025])).toThrow(
      /2002, 2019, 2025/,
    );
  });

  it('tells the operator a re-run only fills the gaps', () => {
    expect(() => assertNoFailedSeasons([2019])).toThrow(/re-run/i);
  });
});
