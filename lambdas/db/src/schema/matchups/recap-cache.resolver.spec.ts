/**
 * Resolver-level caching tests for the Matchup.recap field (LS-5878).
 *
 * Before this fix, every fetch of a completed matchup's recap re-ran the full
 * ~75-DataLoader fan-out (teams, matchupPlayers, players, positions, seasons,
 * batting/pitching stats) and regenerated the narrative from scratch — even
 * when nothing about the matchup had changed. The fix persists the generated
 * recap to `matchups.recap_json` the first time it's computed, and serves the
 * cached value on subsequent fetches without touching any of those loaders.
 */

const hasEntitlement = jest.fn();
const generateMatchupRecap = jest.fn();

/** Capture the Matchup object type's field resolvers (incl. `recap`). */
async function captureRecapResolver(): Promise<
  (...args: unknown[]) => Promise<unknown>
> {
  jest.resetModules();
  const captured: Record<string, { resolve?: (...a: unknown[]) => unknown }> =
    {};

  // `t` stub: every method returns its first argument, so `t.field(opts)`
  // yields the opts object (with `.resolve`) and the fields function's return
  // value is a map of fieldName → opts.
  const tStub = new Proxy({}, { get: () => (arg: unknown) => arg });

  const captureFields = (opts?: { fields?: (t: unknown) => unknown }) => {
    if (opts?.fields) {
      Object.assign(captured, opts.fields(tStub) as Record<string, unknown>);
    }
  };

  jest.doMock('../builder', () => ({
    builder: {
      enumType: () => ({}),
      inputType: () => ({}),
      objectRef: () => ({ implement: (opts: never) => captureFields(opts) }),
      objectType: (_ref: unknown, opts: never) => captureFields(opts),
    },
  }));

  jest.doMock('@legacy-sports/logging', () => ({
    LOGGER: {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  }));

  jest.doMock('@legacy-sports/narrative', () => ({ generateMatchupRecap }));

  jest.doMock('@legacy-sports/db-client', () => ({
    PublicSchema: {
      matchupPlayers: { matchupId: 'matchupId' },
      matchups: { id: 'id' },
    },
  }));

  jest.doMock('drizzle-orm', () => ({ eq: jest.fn() }));

  jest.doMock('../leagues/types', () => ({ Team: {} }));

  jest.doMock('../statistics', () => ({
    GameBattingRef: {},
    GameFieldingRef: {},
    GamePitchingRef: {},
    SeasonBattingRef: {},
    SeasonFieldingRef: {},
    SeasonPitchingRef: {},
  }));

  jest.doMock('../authorization', () => ({ hasEntitlement }));

  jest.doMock('../entitlements', () => ({
    ENTITLEMENTS: { ai_matchup_recap: 'ai_matchup_recap' },
  }));

  await import('./types');
  const recap = captured.recap?.resolve;
  if (!recap) throw new Error('recap field resolver was not captured');
  return recap as (...args: unknown[]) => Promise<unknown>;
}

const COMPLETED = {
  id: 1,
  status: 'completed',
  team1Id: 1,
  team2Id: 2,
  leagueId: 5,
  weekNumber: 3,
};

const GENERATED_RECAP = {
  headline: 'Team A stomps Team B',
  narrative: 'A dominant week from Team A.',
  highlights: ['Player X hit 3 HRs'],
  matchupType: 'blowout',
  winnerId: 1,
};

describe('Matchup.recap field — persisted cache', () => {
  beforeEach(() => {
    hasEntitlement.mockReset();
    generateMatchupRecap.mockReset();
  });

  it('returns the persisted recap without loading teams, players, or regenerating', async () => {
    const recap = await captureRecapResolver();
    hasEntitlement.mockResolvedValue(true);

    const teamsLoad = jest.fn();
    const selectMock = jest.fn();
    const ctx = {
      user: { id: 7 },
      loaders: { teams: { load: teamsLoad } },
      db: { select: selectMock, update: jest.fn() },
    };

    await expect(
      recap({ ...COMPLETED, recapJson: GENERATED_RECAP }, {}, ctx),
    ).resolves.toEqual(GENERATED_RECAP);

    expect(teamsLoad).not.toHaveBeenCalled();
    expect(selectMock).not.toHaveBeenCalled();
    expect(generateMatchupRecap).not.toHaveBeenCalled();
  });

  it('regenerates when the persisted recapJson fails schema validation', async () => {
    const recap = await captureRecapResolver();
    hasEntitlement.mockResolvedValue(true);
    generateMatchupRecap.mockReturnValue(GENERATED_RECAP);

    const teamsLoad = jest
      .fn()
      .mockResolvedValueOnce({ id: 1, name: 'Team A' })
      .mockResolvedValueOnce({ id: 2, name: 'Team B' });

    const matchupPlayerRow = { playerId: 10, teamId: 1, positionId: null };
    const whereSelect = jest.fn().mockResolvedValue([matchupPlayerRow]);
    const fromSelect = jest.fn().mockReturnValue({ where: whereSelect });
    const selectMock = jest.fn().mockReturnValue({ from: fromSelect });

    const whereUpdate = jest.fn().mockResolvedValue(undefined);
    const setUpdate = jest.fn().mockReturnValue({ where: whereUpdate });
    const updateMock = jest.fn().mockReturnValue({ set: setUpdate });

    const ctx = {
      user: { id: 7 },
      loaders: {
        teams: { load: teamsLoad },
        players: {
          load: jest
            .fn()
            .mockResolvedValue({ firstName: 'Joe', lastName: 'Slugger' }),
        },
        leaguePositionById: { load: jest.fn() },
        leagueWeekPlayerSeasons: { load: jest.fn().mockResolvedValue(1998) },
        seasonBatting: {
          load: jest
            .fn()
            .mockResolvedValue({ hr: 1, rbi: 2, h: 3, sb: 0, bb: 1, ab: 4 }),
        },
        seasonPitching: { load: jest.fn() },
      },
      db: { select: selectMock, update: updateMock },
    };

    // Malformed cache entry: matchupType isn't one of the known values.
    const malformedCache = { ...GENERATED_RECAP, matchupType: 'not-a-type' };

    await expect(
      recap({ ...COMPLETED, recapJson: malformedCache }, {}, ctx),
    ).resolves.toEqual(GENERATED_RECAP);

    expect(teamsLoad).toHaveBeenCalled();
    expect(generateMatchupRecap).toHaveBeenCalledTimes(1);
  });

  it('generates and persists a recap on cache miss, then returns it', async () => {
    const recap = await captureRecapResolver();
    hasEntitlement.mockResolvedValue(true);
    generateMatchupRecap.mockReturnValue(GENERATED_RECAP);

    const teamsLoad = jest
      .fn()
      .mockResolvedValueOnce({ id: 1, name: 'Team A' })
      .mockResolvedValueOnce({ id: 2, name: 'Team B' });

    const matchupPlayerRow = { playerId: 10, teamId: 1, positionId: null };
    const whereSelect = jest.fn().mockResolvedValue([matchupPlayerRow]);
    const fromSelect = jest.fn().mockReturnValue({ where: whereSelect });
    const selectMock = jest.fn().mockReturnValue({ from: fromSelect });

    const whereUpdate = jest.fn().mockResolvedValue(undefined);
    const setUpdate = jest.fn().mockReturnValue({ where: whereUpdate });
    const updateMock = jest.fn().mockReturnValue({ set: setUpdate });

    const ctx = {
      user: { id: 7 },
      loaders: {
        teams: { load: teamsLoad },
        players: {
          load: jest
            .fn()
            .mockResolvedValue({ firstName: 'Joe', lastName: 'Slugger' }),
        },
        leaguePositionById: { load: jest.fn() },
        leagueWeekPlayerSeasons: { load: jest.fn().mockResolvedValue(1998) },
        seasonBatting: {
          load: jest
            .fn()
            .mockResolvedValue({ hr: 1, rbi: 2, h: 3, sb: 0, bb: 1, ab: 4 }),
        },
        seasonPitching: { load: jest.fn() },
      },
      db: { select: selectMock, update: updateMock },
    };

    await expect(
      recap({ ...COMPLETED, recapJson: null }, {}, ctx),
    ).resolves.toEqual(GENERATED_RECAP);

    expect(generateMatchupRecap).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({ id: 'id' });
    expect(setUpdate).toHaveBeenCalledWith({ recapJson: GENERATED_RECAP });
    expect(whereUpdate).toHaveBeenCalled();
  });

  it('still returns the recap even if persisting it fails (non-fatal)', async () => {
    const recap = await captureRecapResolver();
    hasEntitlement.mockResolvedValue(true);
    generateMatchupRecap.mockReturnValue(GENERATED_RECAP);

    const teamsLoad = jest
      .fn()
      .mockResolvedValueOnce({ id: 1, name: 'Team A' })
      .mockResolvedValueOnce({ id: 2, name: 'Team B' });

    const matchupPlayerRow = { playerId: 10, teamId: 1, positionId: null };
    const whereSelect = jest.fn().mockResolvedValue([matchupPlayerRow]);
    const fromSelect = jest.fn().mockReturnValue({ where: whereSelect });
    const selectMock = jest.fn().mockReturnValue({ from: fromSelect });

    const whereUpdate = jest.fn().mockRejectedValue(new Error('db down'));
    const setUpdate = jest.fn().mockReturnValue({ where: whereUpdate });
    const updateMock = jest.fn().mockReturnValue({ set: setUpdate });

    const ctx = {
      user: { id: 7 },
      loaders: {
        teams: { load: teamsLoad },
        players: {
          load: jest
            .fn()
            .mockResolvedValue({ firstName: 'Joe', lastName: 'Slugger' }),
        },
        leaguePositionById: { load: jest.fn() },
        leagueWeekPlayerSeasons: { load: jest.fn().mockResolvedValue(1998) },
        seasonBatting: {
          load: jest
            .fn()
            .mockResolvedValue({ hr: 1, rbi: 2, h: 3, sb: 0, bb: 1, ab: 4 }),
        },
        seasonPitching: { load: jest.fn() },
      },
      db: { select: selectMock, update: updateMock },
    };

    await expect(
      recap({ ...COMPLETED, recapJson: null }, {}, ctx),
    ).resolves.toEqual(GENERATED_RECAP);
  });
});

export {};
