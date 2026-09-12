/**
 * Unit tests for getFootballScoringSettingsForLeague (LS-9041, LS-6395).
 *
 * Covers:
 *   - No active profile → throws MissingScoringProfileError and logs a
 *     CRITICAL alert, rather than silently defaulting to PPR-style scoring
 *     (LS-6395)
 *   - Active profile with an override → the override wins for that stat,
 *     everything else still falls back to default
 *   - Disabled entry → the stat contributes nothing (excluded, not defaulted)
 *   - DST points-allowed band overrides map from the DB's `pts_band_*`
 *     source columns to the scoring lib's `pts_*` band keys
 */

import type { PublicDb } from '@legacy-sports/db-client';
import { LOGGER as REAL_LOGGER } from '@legacy-sports/logging';
import {
  getFootballScoringSettingsForLeague,
  MissingScoringProfileError,
} from './football-scoring-settings';
import { getDefaultFootballScoringSettings } from '../football/DefaultScoring';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
  },
}));

// Cast through `unknown` to a plain function-valued-property type: the real
// `ILogger` declares its methods with shorthand syntax, which trips
// @typescript-eslint/unbound-method when a method is referenced (not called)
// as in `expect(LOGGER.fatal)` below.
const LOGGER = REAL_LOGGER as unknown as {
  info: jest.Mock;
  debug: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
  fatal: jest.Mock;
};

type QueryRow = Record<string, unknown>;

interface QueryChain {
  from: () => QueryChain;
  where: () => QueryChain;
  limit: () => QueryChain;
  then: (resolve: (rows: QueryRow[]) => unknown) => unknown;
}

// Drizzle queries are thenables: select().from().where().limit().then(cb).
// This helper returns a chainable mock that resolves to a queued result set
// each time db.select() is called, in call order.
function makeDb(resultQueue: QueryRow[][]): PublicDb {
  let callIndex = 0;

  const db = {
    select: jest.fn((): QueryChain => {
      const results = resultQueue[callIndex++] ?? [];
      const chain: QueryChain = {
        from: () => chain,
        where: () => chain,
        limit: () => chain,
        then: (resolve) => resolve(results),
      };
      return chain;
    }),
  };

  return db as unknown as PublicDb;
}

const activeProfile = {
  id: 7,
  leagueId: 42,
  profileName: 'Custom',
  seasonYear: 2026,
  status: 'active',
  isDefault: true,
  copiedFromProfileId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  activatedAt: '2026-01-01T00:00:00.000Z',
};

function definition(overrides: Record<string, unknown>) {
  return {
    id: 1,
    statKey: 'x',
    statGroup: 'passing',
    sourceTable: 'game_football_passing',
    sourceColumn: 'yds',
    displayName: 'X',
    description: null,
    defaultMultiplier: '1',
    minMultiplier: '0',
    maxMultiplier: '10',
    stepSize: '0.5',
    isRequired: false,
    enforcePositive: false,
    enforceNegative: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function entry(overrides: Record<string, unknown>) {
  return {
    id: 1,
    profileId: activeProfile.id,
    statDefinitionId: 1,
    multiplier: '1',
    isEnabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('getFootballScoringSettingsForLeague', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('throws MissingScoringProfileError and logs CRITICAL when the league has no active profile (LS-6395)', async () => {
    const db = makeDb([[]]); // getActiveScoringProfileForLeague → no rows

    await expect(getFootballScoringSettingsForLeague(db, 42)).rejects.toThrow(
      MissingScoringProfileError,
    );
    await expect(getFootballScoringSettingsForLeague(db, 42)).rejects.toThrow(
      /League 42 has no active scoring profile/,
    );

    expect(LOGGER.fatal).toHaveBeenCalledWith(
      expect.stringContaining('CRITICAL'),
      expect.any(MissingScoringProfileError),
      { leagueId: 42 },
    );
  });

  it('applies a custom multiplier override on top of the defaults (AC4)', async () => {
    const passingTdDef = definition({
      id: 10,
      statKey: 'passing_td',
      statGroup: 'passing',
      sourceColumn: 'td',
      defaultMultiplier: '4',
    });

    const db = makeDb([
      [activeProfile], // getActiveScoringProfileForLeague
      [passingTdDef], // getScoringStatDefinitions
      [entry({ id: 501, statDefinitionId: 10, multiplier: '6' })], // getScoringProfileEntriesForProfile
    ]);

    const settings = await getFootballScoringSettingsForLeague(db, 42);

    const defaults = getDefaultFootballScoringSettings();
    expect(settings.passing.td).toBe(6);
    // Everything else stays at default.
    expect(settings.passing.yds).toBe(defaults.passing.yds);
    expect(settings.rushing).toEqual(defaults.rushing);
  });

  it('excludes a disabled stat entirely rather than falling back to default', async () => {
    const passingTdDef = definition({
      id: 10,
      statKey: 'passing_td',
      statGroup: 'passing',
      sourceColumn: 'td',
      defaultMultiplier: '4',
    });

    const db = makeDb([
      [activeProfile],
      [passingTdDef],
      [
        entry({
          id: 501,
          statDefinitionId: 10,
          multiplier: '6',
          isEnabled: false,
        }),
      ],
    ]);

    const settings = await getFootballScoringSettingsForLeague(db, 42);

    expect(settings.passing.td).toBeUndefined();
  });

  it('maps DST points-allowed band overrides from pts_band_* columns to pts_* band keys', async () => {
    const bandDef = definition({
      id: 20,
      statKey: 'defense_pts_band_0',
      statGroup: 'defense',
      sourceColumn: 'pts_band_0',
      defaultMultiplier: '10',
    });

    const db = makeDb([
      [activeProfile],
      [bandDef],
      [entry({ id: 502, statDefinitionId: 20, multiplier: '15' })],
    ]);

    const settings = await getFootballScoringSettingsForLeague(db, 42);

    expect(settings.defenseBands.pts_0).toBe(15);
    const defaults = getDefaultFootballScoringSettings();
    expect(settings.defenseBands.pts_1_6).toBe(defaults.defenseBands.pts_1_6);
  });
});
