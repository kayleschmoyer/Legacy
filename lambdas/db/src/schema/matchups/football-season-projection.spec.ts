/**
 * Unit tests for getFootballPlayerSeasonAverage (LS-6364).
 *
 * Covers:
 *   - Offense branch: season totals across passing/rushing/receiving/kicking
 *     averaged per game before scoring
 *   - DST branch: points-allowed averaged (not summed) before the non-linear
 *     band lookup, so a big early-season total doesn't skew every projection
 *     into the top band
 *   - IDP branch: numeric `sacks` column coerced from string
 *   - Multi-team season (mid-season trade): rows for two teams summed before
 *     averaging
 *   - No season stats (g=0 or no rows): returns 0
 */

jest.mock('@legacy-sports/db-client', () => ({
  PublicSchema: {
    footballSeasonPassing: { playerId: {}, season: {} },
    footballSeasonRushing: { playerId: {}, season: {} },
    footballSeasonReceiving: { playerId: {}, season: {} },
    footballSeasonKicking: { playerId: {}, season: {} },
    footballSeasonDefense: { playerId: {}, season: {} },
    footballSeasonDefenseIdp: { playerId: {}, season: {} },
  },
}));

jest.mock('drizzle-orm', () => ({
  and: jest.fn((...args: unknown[]) => ({ _and: args })),
  eq: jest.fn((a: unknown, b: unknown) => ({ _eq: [a, b] })),
}));

import { getDefaultFootballScoringSettings } from '@legacy-sports/scoring';
import { getFootballPlayerSeasonAverage } from './football-season-projection';

/** Sequential-queue mock db — each `select()` call consumes the next queued result set. */
function buildMockDb(resultQueue: unknown[][]) {
  let callIndex = 0;
  return {
    select: jest.fn().mockImplementation(() => {
      const results = resultQueue[callIndex++] ?? [];
      const chain: Record<string, jest.Mock> = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        then: jest
          .fn()
          .mockImplementation((resolve: (v: unknown) => unknown) =>
            resolve(results),
          ),
      };
      return chain;
    }),
  };
}

const settings = getDefaultFootballScoringSettings();

describe('getFootballPlayerSeasonAverage — offense branch', () => {
  it('averages passing/rushing totals per game before scoring', async () => {
    // 4 games: 1200 pass yds (×0.04=48), 8 pass TD (×4=32) → season total 80,
    // averaged over 4 games → 20 fppg.
    const db = buildMockDb([
      [{ g: 4, yds: 1200, td: 8, int: 0, sacked: 0 }], // passing
      [], // rushing
      [], // receiving
      [], // kicking
    ]);

    const avg = await getFootballPlayerSeasonAverage(
      db as never,
      5,
      2024,
      false,
      false,
      settings,
      'QB',
    );

    expect(avg).toBeCloseTo(20);
  });

  it('sums rows across a mid-season trade before averaging', async () => {
    // Player traded: 2 games with team A (200 yds), 2 games with team B (200 yds)
    // → 400 yds / 4 games × 0.04 = 4 fppg.
    const db = buildMockDb([
      [
        { g: 2, yds: 200, td: 0, int: 0, sacked: 0 },
        { g: 2, yds: 200, td: 0, int: 0, sacked: 0 },
      ],
      [],
      [],
      [],
    ]);

    const avg = await getFootballPlayerSeasonAverage(
      db as never,
      5,
      2024,
      false,
      false,
      settings,
    );

    expect(avg).toBeCloseTo(4);
  });

  it('returns 0 when the player has no season stats', async () => {
    const db = buildMockDb([[], [], [], []]);

    const avg = await getFootballPlayerSeasonAverage(
      db as never,
      5,
      2024,
      false,
      false,
      settings,
    );

    expect(avg).toBe(0);
  });
});

describe('getFootballPlayerSeasonAverage — DST branch', () => {
  it('averages points-allowed per game before the band lookup', async () => {
    // Season total pts_allowed = 160 over 8 games → avg 20/game → pts_18_27 band.
    // If summed-then-scored, 160 would incorrectly hit the pts_35_plus band.
    const db = buildMockDb([
      [
        {
          g: 8,
          sacks: 16,
          int: 0,
          fumRec: 0,
          defTd: 0,
          safeties: 0,
          ptsAllowed: 160,
          ydsAllowed: 0,
        },
      ],
    ]);

    const avg = await getFootballPlayerSeasonAverage(
      db as never,
      99,
      2024,
      true,
      false,
      settings,
    );

    // 16 sacks / 8 games = 2/game × 1 = 2, pts_18_27 band = 0 → total 2
    expect(avg).toBeCloseTo(2);
  });

  it('returns 0 when g is 0', async () => {
    const db = buildMockDb([[{ g: 0, ptsAllowed: 999 }]]);

    const avg = await getFootballPlayerSeasonAverage(
      db as never,
      99,
      2024,
      true,
      false,
      settings,
    );

    expect(avg).toBe(0);
  });
});

describe('getFootballPlayerSeasonAverage — IDP branch', () => {
  it('coerces the numeric sacks column from string before scoring', async () => {
    // 4 games, 4 solo tackles total (×1=4), 8 sacks total as numeric string (×2=16)
    // → 20 total / 4 games = 5 fppg.
    const db = buildMockDb([
      [
        {
          g: 4,
          soloTkl: 4,
          astTkl: 0,
          sacks: '8.0',
          int: 0,
          pd: 0,
          ff: 0,
          fr: 0,
          defTd: 0,
          safeties: 0,
        },
      ],
    ]);

    const avg = await getFootballPlayerSeasonAverage(
      db as never,
      42,
      2024,
      false,
      true,
      settings,
      'LB',
    );

    expect(avg).toBeCloseTo(5);
  });
});
