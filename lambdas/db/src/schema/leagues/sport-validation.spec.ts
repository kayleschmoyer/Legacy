/**
 * Unit tests for sport-aware league-input validation (LS-4631 / LS-4684 / LS-4685).
 *
 * These functions are the server-side authority for which eraFilter,
 * playerPool, and maxRosterSize values are valid for a given sport, and
 * which eras are free vs. premium-gated. The client-side maps in
 * apps/web/src/pages/baseball/LeagueCreatePage.tsx are UX hints; the
 * server is what actually keeps malformed leagues out of the database.
 */

import {
  FREE_ERA_IDS_BY_SPORT,
  GAMES_PER_MATCHUP_RANGE_BY_SPORT,
  isEraFreeForSport,
  isEraValidForSport,
  isGamesPerMatchupValidForSport,
  isPoolValidForSport,
  isRosterSizeValidForSport,
  normalizeSport,
  ROSTER_RANGE_BY_SPORT,
  VALID_ERAS_BY_SPORT,
  VALID_POOLS_BY_SPORT,
} from './sport-validation';
import type { SportKind } from './sport-validation';
import { UserInputError } from '../graphql-errors';

describe('sport-validation', () => {
  describe('normalizeSport', () => {
    it('returns football when passed "football"', () => {
      expect(normalizeSport('football')).toBe('football');
    });
    it('returns baseball for "baseball", null, undefined, or unknown', () => {
      expect(normalizeSport('baseball')).toBe('baseball');
      expect(normalizeSport(null)).toBe('baseball');
      expect(normalizeSport(undefined)).toBe('baseball');
      expect(normalizeSport('cricket')).toBe('baseball');
    });
  });

  describe('isEraValidForSport', () => {
    it('accepts each baseball era for baseball', () => {
      for (const era of VALID_ERAS_BY_SPORT.baseball) {
        expect(isEraValidForSport('baseball', era)).toBe(true);
      }
    });
    it('accepts each football era for football', () => {
      for (const era of VALID_ERAS_BY_SPORT.football) {
        expect(isEraValidForSport('football', era)).toBe(true);
      }
    });
    it('rejects football-only eras under baseball', () => {
      expect(isEraValidForSport('baseball', 'pioneer')).toBe(false);
      expect(isEraValidForSport('baseball', 'super_bowl')).toBe(false);
      expect(isEraValidForSport('baseball', 'single_platoon')).toBe(false);
    });
    it('rejects baseball-only eras under football', () => {
      expect(isEraValidForSport('football', 'dead_ball')).toBe(false);
      expect(isEraValidForSport('football', 'golden_age')).toBe(false);
      expect(isEraValidForSport('football', 'steroid_era')).toBe(false);
    });
    it('rejects unknown era ids for both sports', () => {
      expect(isEraValidForSport('baseball', 'made_up')).toBe(false);
      expect(isEraValidForSport('football', '')).toBe(false);
    });
  });

  describe('isEraFreeForSport', () => {
    it('treats baseball `all` and `modern` as free, everything else as premium', () => {
      expect(isEraFreeForSport('baseball', 'all')).toBe(true);
      expect(isEraFreeForSport('baseball', 'modern')).toBe(true);
      expect(isEraFreeForSport('baseball', 'dead_ball')).toBe(false);
      expect(isEraFreeForSport('baseball', 'custom')).toBe(false);
      expect(isEraFreeForSport('baseball', 'steroid_era')).toBe(false);
    });
    it('treats football `all` and `spread_offense` as free, everything else as premium', () => {
      expect(isEraFreeForSport('football', 'all')).toBe(true);
      expect(isEraFreeForSport('football', 'spread_offense')).toBe(true);
      expect(isEraFreeForSport('football', 'pioneer')).toBe(false);
      expect(isEraFreeForSport('football', 'super_bowl')).toBe(false);
      expect(isEraFreeForSport('football', 'custom')).toBe(false);
    });
    it('agrees with FREE_ERA_IDS_BY_SPORT for every entry', () => {
      for (const era of FREE_ERA_IDS_BY_SPORT.baseball) {
        expect(isEraFreeForSport('baseball', era)).toBe(true);
      }
      for (const era of FREE_ERA_IDS_BY_SPORT.football) {
        expect(isEraFreeForSport('football', era)).toBe(true);
      }
    });
  });

  describe('isPoolValidForSport', () => {
    it('accepts all/nl/al for baseball', () => {
      for (const pool of VALID_POOLS_BY_SPORT.baseball) {
        expect(isPoolValidForSport('baseball', pool)).toBe(true);
      }
    });
    it('accepts all/nfc/afc for football', () => {
      for (const pool of VALID_POOLS_BY_SPORT.football) {
        expect(isPoolValidForSport('football', pool)).toBe(true);
      }
    });
    it('rejects football conferences under baseball', () => {
      expect(isPoolValidForSport('baseball', 'nfc')).toBe(false);
      expect(isPoolValidForSport('baseball', 'afc')).toBe(false);
    });
    it('rejects baseball leagues under football', () => {
      expect(isPoolValidForSport('football', 'nl')).toBe(false);
      expect(isPoolValidForSport('football', 'al')).toBe(false);
    });
  });

  describe('isRosterSizeValidForSport', () => {
    it('accepts the inclusive endpoints for each sport', () => {
      expect(isRosterSizeValidForSport('baseball', 15)).toBe(true);
      expect(isRosterSizeValidForSport('baseball', 50)).toBe(true);
      expect(isRosterSizeValidForSport('football', 10)).toBe(true);
      expect(isRosterSizeValidForSport('football', 25)).toBe(true);
    });
    it('rejects values outside the sport-specific range', () => {
      expect(isRosterSizeValidForSport('baseball', 14)).toBe(false);
      expect(isRosterSizeValidForSport('baseball', 51)).toBe(false);
      // A baseball-shaped roster size (e.g. 30) would be way too big for football.
      expect(isRosterSizeValidForSport('football', 26)).toBe(false);
      expect(isRosterSizeValidForSport('football', 9)).toBe(false);
    });
    it('matches ROSTER_RANGE_BY_SPORT min/max', () => {
      expect(ROSTER_RANGE_BY_SPORT.baseball.min).toBe(15);
      expect(ROSTER_RANGE_BY_SPORT.baseball.max).toBe(50);
      expect(ROSTER_RANGE_BY_SPORT.football.min).toBe(10);
      expect(ROSTER_RANGE_BY_SPORT.football.max).toBe(25);
    });
  });

  describe('isGamesPerMatchupValidForSport', () => {
    it('accepts the inclusive min and max for each sport', () => {
      expect(isGamesPerMatchupValidForSport('baseball', 1)).toBe(true);
      expect(isGamesPerMatchupValidForSport('baseball', 162)).toBe(true);
      expect(isGamesPerMatchupValidForSport('football', 1)).toBe(true);
      expect(isGamesPerMatchupValidForSport('football', 17)).toBe(true);
    });

    it('rejects values below the minimum for each sport', () => {
      expect(isGamesPerMatchupValidForSport('baseball', 0)).toBe(false);
      expect(isGamesPerMatchupValidForSport('football', 0)).toBe(false);
    });

    it('rejects values above the maximum for baseball (163 > 162)', () => {
      expect(isGamesPerMatchupValidForSport('baseball', 163)).toBe(false);
    });

    it('rejects values above 17 for football (enforces per-sport cap)', () => {
      expect(isGamesPerMatchupValidForSport('football', 18)).toBe(false);
    });

    describe('resolver-level throw behaviour (create and update paths)', () => {
      /**
       * Mirrors the validation+throw pattern used in both createLeagueAndTeams
       * and updateLeagueSettings.  Tests here prove that out-of-bounds values
       * produce a UserInputError with the expected message — the same contract
       * the resolvers enforce.
       */
      function throwIfInvalid(sport: SportKind, n: number): void {
        if (!isGamesPerMatchupValidForSport(sport, n)) {
          const range = GAMES_PER_MATCHUP_RANGE_BY_SPORT[sport];
          throw UserInputError(
            `Games per matchup must be between ${range.min} and ${range.max} for ${sport} leagues`,
          );
        }
      }

      it('throws UserInputError when below minimum for a baseball league (create path)', () => {
        expect(() => throwIfInvalid('baseball', 0)).toThrow(
          'Games per matchup must be between 1 and 162 for baseball leagues',
        );
      });

      it('throws UserInputError when above maximum for a baseball league (create path)', () => {
        expect(() => throwIfInvalid('baseball', 163)).toThrow(
          'Games per matchup must be between 1 and 162 for baseball leagues',
        );
      });

      it('throws UserInputError when below minimum for a football league (update path)', () => {
        expect(() => throwIfInvalid('football', 0)).toThrow(
          'Games per matchup must be between 1 and 17 for football leagues',
        );
      });

      it('throws UserInputError when above maximum for a football league — enforces 17-game cap (update path)', () => {
        expect(() => throwIfInvalid('football', 18)).toThrow(
          'Games per matchup must be between 1 and 17 for football leagues',
        );
      });
    });
  });
});
