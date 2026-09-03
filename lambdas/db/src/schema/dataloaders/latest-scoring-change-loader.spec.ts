/**
 * Unit tests for createLatestScoringChangeAtLoader (LS-9665).
 *
 * Backs `Matchup.scoringIsStale`. The point of the loader is AC6: a week — or
 * a season — of matchups must cost one lookup for the leagues involved, not one
 * per matchup. These tests pin that batching, since an N+1 here would only show
 * up as a latency regression on the very query the LS-9524 epic is trying to
 * make fast.
 */

const getLatestScoringChangeAtByLeague: jest.Mock<
  Promise<Map<number, Date | null>>,
  [unknown, number[]]
> = jest.fn();

jest.mock('@legacy-sports/db-client', () => ({
  PublicSchema: {},
  getLatestScoringChangeAtByLeague,
}));

import { createLatestScoringChangeAtLoader } from './matchup-loaders';

const db = {} as never;

describe('createLatestScoringChangeAtLoader', () => {
  beforeEach(() => {
    getLatestScoringChangeAtByLeague.mockReset();
  });

  it('resolves many matchups in one lookup for the leagues involved', async () => {
    const changedAt = new Date('2026-08-02T00:00:00.000Z');
    getLatestScoringChangeAtByLeague.mockResolvedValue(
      new Map([
        [1, changedAt],
        [2, null],
      ]),
    );

    const loader = createLatestScoringChangeAtLoader(db);

    // Twelve matchups across two leagues — the shape of a rendered week.
    const results = await Promise.all([
      ...Array.from({ length: 6 }, () => loader.load(1)),
      ...Array.from({ length: 6 }, () => loader.load(2)),
    ]);

    expect(getLatestScoringChangeAtByLeague).toHaveBeenCalledTimes(1);
    expect(results.slice(0, 6)).toEqual(Array(6).fill(changedAt));
    expect(results.slice(6)).toEqual(Array(6).fill(null));
  });

  it('deduplicates league ids before querying', async () => {
    getLatestScoringChangeAtByLeague.mockResolvedValue(new Map());

    const loader = createLatestScoringChangeAtLoader(db);
    await Promise.all([
      loader.load(9),
      loader.load(9),
      loader.load(4),
      loader.load(9),
    ]);

    expect(getLatestScoringChangeAtByLeague).toHaveBeenCalledTimes(1);
    const [, leagueIds] = getLatestScoringChangeAtByLeague.mock.calls[0];
    expect([...leagueIds].sort((a, b) => a - b)).toEqual([4, 9]);
  });

  it('returns null for a league the lookup did not report on', async () => {
    getLatestScoringChangeAtByLeague.mockResolvedValue(new Map());

    const loader = createLatestScoringChangeAtLoader(db);

    await expect(loader.load(123)).resolves.toBeNull();
  });
});
