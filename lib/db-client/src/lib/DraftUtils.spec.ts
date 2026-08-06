/**
 * Unit tests for filterPlayerIdsByLeagueEligibility (LS-4835 / LS-4896 / LS-9040).
 *
 * Covers the football path: football leagues always skip the baseball-only
 * filters (career games/seasons, HoF, era). The playerPool filter DOES apply
 * to football via a real nfl_teams.conference join for 'afc'/'nfc' pools
 * (LS-9040) — 'all'/'nfl' impose no restriction and skip the DB entirely.
 *
 * Also verifies the baseball path still applies filters when sport is
 * 'baseball' (or omitted for backwards-compatibility).
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import {
  buildEligibilityConditions,
  filterPlayerIdsByLeagueEligibility,
  findFailedEligibilityRule,
  resolveEraRange,
} from './DraftUtils';
import type { PublicDb } from '../index';

// A mock DB that throws if any method is invoked — used to prove the football
// path does not issue any DB queries.
function makeNeverCalledDb(): PublicDb {
  const fail = () => {
    throw new Error('DB should not be called for football leagues');
  };
  return { execute: fail, select: fail } as unknown as PublicDb;
}

// A mock DB for baseball tests: returns an empty set so all players are
// "filtered out" — sufficient to verify the baseball path runs queries.
function makeAlwaysEmptyDb(): PublicDb {
  const chain = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue([]),
    execute: jest.fn().mockResolvedValue({ rows: [] }),
  };
  return chain as unknown as PublicDb;
}

const PLAYER_IDS = [1, 2, 3, 4, 5];

describe('filterPlayerIdsByLeagueEligibility', () => {
  describe('football leagues', () => {
    it('returns all player IDs without hitting the DB', async () => {
      const db = makeNeverCalledDb();

      const result = await filterPlayerIdsByLeagueEligibility(db, PLAYER_IDS, {
        playerPool: 'nfl',
        minCareerGames: 50,
        minCareerSeasons: 3,
        baseballHofOnly: false,
        baseballEraFilter: 'all',
        customEraStartYear: null,
        customEraEndYear: null,
        sport: 'football',
      });

      expect(result.eligibleIds).toEqual(new Set(PLAYER_IDS));
      expect(result.excludedByPool).toBe(0);
      expect(result.excludedByCareerGames).toBe(0);
      expect(result.excludedByCareerSeasons).toBe(0);
      expect(result.excludedByHofOnly).toBe(0);
      expect(result.excludedByEraFilter).toBe(0);
    });

    it('applies a real conference filter for afc/nfc pools (LS-9040)', async () => {
      const db = makeAlwaysEmptyDb();

      const result = await filterPlayerIdsByLeagueEligibility(db, PLAYER_IDS, {
        playerPool: 'afc',
        minCareerGames: 10,
        minCareerSeasons: 1,
        sport: 'football',
      });

      // Empty DB (no matching nfl_teams.conference join rows) → all excluded
      expect(result.eligibleIds.size).toBe(0);
      expect(result.excludedByPool).toBe(PLAYER_IDS.length);
    });

    it('skips the conference filter (no DB call) for the "nfl" pool', async () => {
      const db = makeNeverCalledDb();

      const result = await filterPlayerIdsByLeagueEligibility(db, PLAYER_IDS, {
        playerPool: 'nfl',
        minCareerGames: 10,
        minCareerSeasons: 1,
        sport: 'football',
      });

      expect(result.eligibleIds).toEqual(new Set(PLAYER_IDS));
      expect(result.excludedByPool).toBe(0);
    });

    it('returns an empty eligible set when player list is empty', async () => {
      const db = makeNeverCalledDb();

      const result = await filterPlayerIdsByLeagueEligibility(db, [], {
        playerPool: 'nfl',
        minCareerGames: 50,
        minCareerSeasons: 3,
        sport: 'football',
      });

      expect(result.eligibleIds.size).toBe(0);
    });
  });

  describe('baseball leagues', () => {
    it('applies playerPool filter for al/nl pools', async () => {
      const db = makeAlwaysEmptyDb();

      const result = await filterPlayerIdsByLeagueEligibility(db, PLAYER_IDS, {
        playerPool: 'al',
        minCareerGames: 0,
        minCareerSeasons: 0,
        sport: 'baseball',
      });

      // Empty DB returns no eligible players after pool filter
      expect(result.eligibleIds.size).toBe(0);
      expect(result.excludedByPool).toBe(PLAYER_IDS.length);
    });

    it('skips playerPool filter when pool is "all"', async () => {
      const db = makeAlwaysEmptyDb();

      const result = await filterPlayerIdsByLeagueEligibility(db, PLAYER_IDS, {
        playerPool: 'all',
        minCareerGames: 0,
        minCareerSeasons: 0,
        sport: 'baseball',
      });

      // No pool filter means excludedByPool stays 0 (all IDs survive to next stage)
      expect(result.excludedByPool).toBe(0);
    });

    it('defaults to baseball behaviour when sport is omitted', async () => {
      const result = await filterPlayerIdsByLeagueEligibility(
        makeAlwaysEmptyDb(),
        PLAYER_IDS,
        {
          playerPool: 'al',
          minCareerGames: 0,
          minCareerSeasons: 0,
        },
      );

      expect(result.excludedByPool).toBe(PLAYER_IDS.length);
    });
  });
});

describe('resolveEraRange', () => {
  it('returns null for "all" or unset era', () => {
    expect(
      resolveEraRange({
        playerPool: 'all',
        minCareerGames: 0,
        minCareerSeasons: 0,
        baseballEraFilter: 'all',
      }),
    ).toBeNull();
    expect(
      resolveEraRange({
        playerPool: 'all',
        minCareerGames: 0,
        minCareerSeasons: 0,
      }),
    ).toBeNull();
  });

  it('resolves a named era to its [start, end] range', () => {
    expect(
      resolveEraRange({
        playerPool: 'all',
        minCareerGames: 0,
        minCareerSeasons: 0,
        baseballEraFilter: 'steroid_era',
      }),
    ).toEqual([1994, 2005]);
  });

  it('resolves a custom era only when both bounds are present', () => {
    const base = {
      playerPool: 'all' as const,
      minCareerGames: 0,
      minCareerSeasons: 0,
    };
    expect(
      resolveEraRange({
        ...base,
        baseballEraFilter: 'custom',
        customEraStartYear: 1985,
        customEraEndYear: 1999,
      }),
    ).toEqual([1985, 1999]);
    expect(
      resolveEraRange({
        ...base,
        baseballEraFilter: 'custom',
        customEraStartYear: 1985,
        customEraEndYear: null,
      }),
    ).toBeNull();
  });
});

describe('buildEligibilityConditions', () => {
  it('returns no predicates for football leagues with the "nfl" pool', () => {
    expect(
      buildEligibilityConditions({
        playerPool: 'nfl',
        minCareerGames: 50,
        minCareerSeasons: 3,
        baseballHofOnly: true,
        baseballEraFilter: 'modern',
        sport: 'football',
      }),
    ).toEqual([]);
  });

  it('returns a single conference-pool predicate for football afc/nfc pools (LS-9040)', () => {
    const afcConditions = buildEligibilityConditions({
      playerPool: 'afc',
      minCareerGames: 0,
      minCareerSeasons: 0,
      sport: 'football',
    });
    expect(afcConditions).toHaveLength(1);
    expect(afcConditions[0].key).toBe('pool');

    const nfcConditions = buildEligibilityConditions({
      playerPool: 'nfc',
      minCareerGames: 0,
      minCareerSeasons: 0,
      sport: 'football',
    });
    expect(nfcConditions).toHaveLength(1);
    expect(nfcConditions[0].key).toBe('pool');
  });

  it('returns no predicates when the league imposes no restrictions', () => {
    expect(
      buildEligibilityConditions({
        playerPool: 'all',
        minCareerGames: 0,
        minCareerSeasons: 0,
        baseballHofOnly: false,
        baseballEraFilter: 'all',
      }),
    ).toEqual([]);
  });

  it('emits every applicable rule, in display order, with value-bearing messages', () => {
    const conditions = buildEligibilityConditions({
      playerPool: 'nl',
      minCareerGames: 50,
      minCareerSeasons: 3,
      baseballHofOnly: true,
      baseballEraFilter: 'steroid_era',
      customEraStartYear: null,
      customEraEndYear: null,
      sport: 'baseball',
    });

    expect(conditions.map((c) => c.key)).toEqual([
      'pool',
      'careerGames',
      'careerSeasons',
      'hofOnly',
      'era',
    ]);
    expect(conditions.find((c) => c.key === 'pool')?.message).toContain('NL');
    expect(conditions.find((c) => c.key === 'careerGames')?.message).toContain(
      '50',
    );
    expect(
      conditions.find((c) => c.key === 'careerSeasons')?.message,
    ).toContain('3');
    expect(conditions.find((c) => c.key === 'era')?.message).toContain(
      'Steroid Era',
    );
  });

  it('omits the era rule when a custom era is missing its bounds', () => {
    const conditions = buildEligibilityConditions({
      playerPool: 'all',
      minCareerGames: 0,
      minCareerSeasons: 0,
      baseballEraFilter: 'custom',
      customEraStartYear: 1990,
      customEraEndYear: null,
    });
    expect(conditions.some((c) => c.key === 'era')).toBe(false);
  });
});

describe('findFailedEligibilityRule', () => {
  it('returns null without querying when no rules apply', async () => {
    const db = makeNeverCalledDb();
    const failed = await findFailedEligibilityRule(db, 42, {
      playerPool: 'all',
      minCareerGames: 0,
      minCareerSeasons: 0,
    });
    expect(failed).toBeNull();
  });

  it('returns the first failing rule by evaluation order', async () => {
    // pool passes, careerGames fails, careerSeasons passes → expect careerGames.
    const db = {
      execute: jest.fn().mockResolvedValue({
        rows: [{ rule_0: true, rule_1: false, rule_2: true }],
      }),
    } as unknown as PublicDb;

    const failed = await findFailedEligibilityRule(db, 42, {
      playerPool: 'nl',
      minCareerGames: 50,
      minCareerSeasons: 3,
    });
    expect(failed?.key).toBe('careerGames');
    expect(failed?.message).toContain('50');
  });

  it('returns null when the player passes every rule', async () => {
    const db = {
      execute: jest.fn().mockResolvedValue({
        rows: [{ rule_0: true, rule_1: true, rule_2: true }],
      }),
    } as unknown as PublicDb;

    const failed = await findFailedEligibilityRule(db, 42, {
      playerPool: 'nl',
      minCareerGames: 50,
      minCareerSeasons: 3,
    });
    expect(failed).toBeNull();
  });

  it('returns null when no player row is found', async () => {
    const db = {
      execute: jest.fn().mockResolvedValue({ rows: [] }),
    } as unknown as PublicDb;

    const failed = await findFailedEligibilityRule(db, 999, {
      playerPool: 'nl',
      minCareerGames: 50,
      minCareerSeasons: 3,
    });
    expect(failed).toBeNull();
  });
});
