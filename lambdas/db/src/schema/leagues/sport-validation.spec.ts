/**
 * Unit tests for sport-aware league-input validation (LS-4631 / LS-4684 / LS-4685).
 *
 * These functions are the server-side authority for which eraFilter,
 * playerPool, and maxRosterSize values are valid for a given sport, and
 * which eras are free vs. premium-gated. The client-side maps in
 * apps/web/src/pages/baseball/LeagueCreatePage.tsx are UX hints; the
 * server is what actually keeps malformed leagues out of the database.
 */

import { PublicSchema } from '@legacy-sports/db-client';
import {
  CUSTOM_ERA_MIN_YEAR_BY_SPORT,
  FREE_ERA_IDS_BY_SPORT,
  GAMES_PER_MATCHUP_RANGE_BY_SPORT,
  isCustomEraYearValidForSport,
  isDefensiveFormatAvailable,
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
      expect(isEraValidForSport('baseball', 'super_bowl_era')).toBe(false);
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
      expect(isEraFreeForSport('football', 'super_bowl_era')).toBe(false);
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

  describe('isCustomEraYearValidForSport', () => {
    it('accepts the inclusive min year and the current year for each sport', () => {
      const currentYear = new Date().getFullYear();
      expect(isCustomEraYearValidForSport('baseball', 1871)).toBe(true);
      expect(isCustomEraYearValidForSport('baseball', currentYear)).toBe(true);
      expect(isCustomEraYearValidForSport('football', 1920)).toBe(true);
      expect(isCustomEraYearValidForSport('football', currentYear)).toBe(true);
    });

    it('rejects years before MLB/NFL existed (CLB-017: 1800 silently accepted before this fix)', () => {
      expect(isCustomEraYearValidForSport('baseball', 1800)).toBe(false);
      expect(isCustomEraYearValidForSport('baseball', 1870)).toBe(false);
      expect(isCustomEraYearValidForSport('football', 1919)).toBe(false);
    });

    it('rejects years past the current year (CLB-017: 3000 silently accepted before this fix)', () => {
      const currentYear = new Date().getFullYear();
      expect(isCustomEraYearValidForSport('baseball', 3000)).toBe(false);
      expect(isCustomEraYearValidForSport('baseball', currentYear + 1)).toBe(
        false,
      );
      expect(isCustomEraYearValidForSport('football', currentYear + 1)).toBe(
        false,
      );
    });

    it('matches CUSTOM_ERA_MIN_YEAR_BY_SPORT for both sports', () => {
      expect(CUSTOM_ERA_MIN_YEAR_BY_SPORT.baseball).toBe(1871);
      expect(CUSTOM_ERA_MIN_YEAR_BY_SPORT.football).toBe(1920);
    });
  });
});

/**
 * The guard that keeps the era vocabulary from splitting in three (LS-9914).
 *
 * `eraFilter` reaches the database as a value of the `era_filter` Postgres
 * enum, so three name spaces have to agree: the enum itself, this validator
 * (the server-side authority for what a client may send), and the client
 * option lists. They drifted quietly under LS-4633 — the validator learned
 * football's eras as `super_bowl` / `salary_cap` while the enum and the
 * client config used `super_bowl_era` / `salary_cap_era`. Neither spelling
 * could complete a round trip: the suffixed form was rejected by
 * `isEraValidForSport`, and the unsuffixed form passed validation and then
 * failed to persist, because it is not an enum member. Both eras are
 * premium, so the whole failure sat behind the paywall where nothing
 * exercised it.
 *
 * The invariant below needs no hand-maintained per-sport list: `all` and
 * `custom` are shared, every other enum member belongs to exactly one sport,
 * and between them the two validator sets must account for the enum exactly.
 * Adding an era to the enum without teaching this validator about it — or
 * misspelling it on the way — now fails the build instead of failing a
 * paying customer's league creation.
 */
describe('VALID_ERAS_BY_SPORT pins the era_filter Postgres enum (LS-9914)', () => {
  const ERA_FILTER_ENUM_VALUES: readonly string[] =
    PublicSchema.eraFilter.enumValues;

  /** Eras that are meaningful for every sport, so they appear in both sets. */
  const SHARED_ERAS = ['all', 'custom'] as const;

  it('exposes the enum through the drizzle schema', () => {
    // Guards the import itself: an empty list would make every assertion
    // below vacuously pass.
    expect(ERA_FILTER_ENUM_VALUES.length).toBeGreaterThan(0);
    expect(new Set(ERA_FILTER_ENUM_VALUES).size).toBe(
      ERA_FILTER_ENUM_VALUES.length,
    );
  });

  it('covers the enum exactly — every member is valid for some sport', () => {
    const union = new Set([
      ...VALID_ERAS_BY_SPORT.baseball,
      ...VALID_ERAS_BY_SPORT.football,
    ]);
    expect([...union].sort()).toEqual([...ERA_FILTER_ENUM_VALUES].sort());
  });

  it('admits no era the enum cannot store, per sport', () => {
    const enumMembers = new Set(ERA_FILTER_ENUM_VALUES);
    for (const sport of ['baseball', 'football'] as const) {
      for (const era of VALID_ERAS_BY_SPORT[sport]) {
        // A value that passes validation but is not an enum member reaches
        // the INSERT and dies there.
        expect({ sport, era, storable: enumMembers.has(era) }).toEqual({
          sport,
          era,
          storable: true,
        });
      }
    }
  });

  it('shares exactly `all` and `custom` between the sports', () => {
    const shared = [...VALID_ERAS_BY_SPORT.baseball].filter((era) =>
      VALID_ERAS_BY_SPORT.football.has(era),
    );
    expect(shared.sort()).toEqual([...SHARED_ERAS].sort());
  });

  it('assigns every sport-specific enum member to exactly one sport', () => {
    const shared = new Set<string>(SHARED_ERAS);
    for (const era of ERA_FILTER_ENUM_VALUES) {
      if (shared.has(era)) continue;
      const owners = (['baseball', 'football'] as const).filter((sport) =>
        VALID_ERAS_BY_SPORT[sport].has(era),
      );
      expect({ era, owners }).toEqual({ era, owners: [owners[0]] });
    }
  });

  it('only marks storable eras as free', () => {
    const enumMembers = new Set(ERA_FILTER_ENUM_VALUES);
    for (const sport of ['baseball', 'football'] as const) {
      for (const era of FREE_ERA_IDS_BY_SPORT[sport]) {
        expect({ sport, era, storable: enumMembers.has(era) }).toEqual({
          sport,
          era,
          storable: true,
        });
        expect(VALID_ERAS_BY_SPORT[sport].has(era)).toBe(true);
      }
    }
  });
});

describe('isDefensiveFormatAvailable (LS-10727)', () => {
  it('rejects a D/ST football league while no team-defense data exists', () => {
    expect(isDefensiveFormatAvailable('football', 'dst', false)).toBe(false);
  });

  it('allows a D/ST football league once team-defense data exists', () => {
    expect(isDefensiveFormatAvailable('football', 'dst', true)).toBe(true);
  });

  it('always allows IDP or an unspecified format (server defaults to IDP)', () => {
    for (const dstAvailable of [true, false]) {
      expect(isDefensiveFormatAvailable('football', 'idp', dstAvailable)).toBe(
        true,
      );
      expect(isDefensiveFormatAvailable('football', null, dstAvailable)).toBe(
        true,
      );
      expect(
        isDefensiveFormatAvailable('football', undefined, dstAvailable),
      ).toBe(true);
    }
  });

  it('ignores the defensive format for baseball leagues', () => {
    expect(isDefensiveFormatAvailable('baseball', 'dst', false)).toBe(true);
  });
});
