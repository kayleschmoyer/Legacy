/**
 * Unit tests for filterPlayerIdsByLeagueEligibility (LS-4835).
 *
 * Covers the football early-return path that was missing before this fix:
 * football leagues must skip all baseball-specific filters (playerPool,
 * career games/seasons, HoF, era) and return every candidate as eligible.
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

import { filterPlayerIdsByLeagueEligibility } from './DraftUtils';
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

    it('returns all IDs for afc/nfc pools without hitting the DB', async () => {
      const db = makeNeverCalledDb();

      const result = await filterPlayerIdsByLeagueEligibility(db, PLAYER_IDS, {
        playerPool: 'afc',
        minCareerGames: 10,
        minCareerSeasons: 1,
        sport: 'football',
      });

      expect(result.eligibleIds).toEqual(new Set(PLAYER_IDS));
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
  });
});
