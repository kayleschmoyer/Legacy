/**
 * Unit tests for getFootballScoringSettingsForLeague (LS-9041).
 *
 * Covers:
 *   - No active profile → default settings (byte-identical to the pre-change
 *     hardcoded DEFAULT_*_SCORING constants)
 *   - Active profile with an override → the override wins for that stat,
 *     everything else still falls back to default
 *   - Disabled entry → the stat contributes nothing (excluded, not defaulted)
 *   - DST points-allowed band overrides map from the DB's `pts_band_*`
 *     source columns to the scoring lib's `pts_*` band keys
 */

import type { PublicDb } from '@legacy-sports/db-client';
import { getFootballScoringSettingsForLeague } from './football-scoring-settings';
import { getDefaultFootballScoringSettings } from '../football/DefaultScoring';

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
  it('falls back to defaults when the league has no active profile (AC3)', async () => {
    const db = makeDb([[]]); // getActiveScoringProfileForLeague → no rows

    const settings = await getFootballScoringSettingsForLeague(db, 42);

    expect(settings).toEqual(getDefaultFootballScoringSettings());
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
