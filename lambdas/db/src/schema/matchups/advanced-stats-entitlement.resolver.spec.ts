/**
 * Resolver-level entitlement tests for MatchupPlayer.advancedStats
 * (LS-6398).
 *
 * Premium-gated schema/UI plumbing for snap count %, target share %, and air
 * yards. The underlying ingest for these metrics does not exist yet (no
 * source table/field for snap counts, target share, or air yards anywhere in
 * the data pipeline), so every metric always resolves to `null` for entitled
 * callers — this only asserts the gate itself (auth + entitlement +
 * football-only), mirroring the footballSeasonFppg gate tests.
 *
 * Gate order in the resolver:
 *   1. No authenticated user → null.
 *   2. Player fails to load, or isn't a football player → null.
 *   3. Lacks football_projections entitlement → null.
 *   4. Entitled football player → object with every metric null.
 */

const hasEntitlement = jest.fn();

/** Capture the MatchupPlayer object type's field resolvers (incl. `advancedStats`). */
async function captureAdvancedStatsResolver(): Promise<
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

  jest.doMock('@legacy-sports/narrative', () => ({
    generateMatchupRecap: jest.fn(),
  }));

  jest.doMock('@legacy-sports/db-client', () => ({
    PublicSchema: { matchupPlayers: { matchupId: 'matchupId' } },
  }));

  jest.doMock('drizzle-orm', () => ({ eq: jest.fn() }));

  // `types.ts` imports `./winProbability`, which pulls in `../scoring` and its
  // module-level `createDatabaseService(getDbOptions())` call. Stub the module
  // so importing the type definitions does not try to build a real DB service.
  jest.doMock('./winProbability', () => ({
    MatchupWinProbabilityType: {},
    resolveMatchupWinProbability: jest.fn(),
  }));

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
    ENTITLEMENTS: { football_projections: 'football_projections' },
  }));

  jest.doMock('./football-season-projection', () => ({
    getFootballPlayerSeasonAverage: jest.fn(),
  }));

  await import('./types');
  const advancedStats = captured.advancedStats?.resolve;
  if (!advancedStats)
    throw new Error('advancedStats field resolver was not captured');
  return advancedStats as (...args: unknown[]) => Promise<unknown>;
}

const MATCHUP_PLAYER = {
  id: 1,
  matchupId: 55,
  playerId: 901,
  teamId: 10,
  positionId: 1,
  season: 2026,
};

function makeContext(
  user: unknown,
  overrides: { player?: Record<string, unknown> | null } = {},
) {
  const player =
    overrides.player === undefined
      ? { id: 901, sport: 'football', position: 'QB', isDst: false }
      : overrides.player;

  const playersLoad = jest.fn().mockResolvedValue(player);

  return {
    ctx: {
      user,
      db: {},
      loaders: {
        players: { load: playersLoad },
      },
    },
    playersLoad,
  };
}

describe('MatchupPlayer.advancedStats field — entitlement gate', () => {
  beforeEach(() => {
    hasEntitlement.mockReset();
  });

  it('returns null for unauthenticated callers, without loading the player', async () => {
    const advancedStats = await captureAdvancedStatsResolver();
    const { ctx, playersLoad } = makeContext(null);
    await expect(advancedStats(MATCHUP_PLAYER, {}, ctx)).resolves.toBeNull();
    expect(playersLoad).not.toHaveBeenCalled();
    expect(hasEntitlement).not.toHaveBeenCalled();
  });

  it('returns null when the player fails to load', async () => {
    const advancedStats = await captureAdvancedStatsResolver();
    const { ctx } = makeContext({ id: 7 }, { player: null });
    await expect(advancedStats(MATCHUP_PLAYER, {}, ctx)).resolves.toBeNull();
    expect(hasEntitlement).not.toHaveBeenCalled();
  });

  it('returns null for a baseball player, without checking entitlement', async () => {
    const advancedStats = await captureAdvancedStatsResolver();
    const { ctx } = makeContext(
      { id: 7 },
      { player: { id: 901, sport: 'baseball', position: null, isDst: false } },
    );
    await expect(advancedStats(MATCHUP_PLAYER, {}, ctx)).resolves.toBeNull();
    expect(hasEntitlement).not.toHaveBeenCalled();
  });

  it('returns null for free-tier callers viewing a football player', async () => {
    const advancedStats = await captureAdvancedStatsResolver();
    hasEntitlement.mockResolvedValue(false);
    const { ctx } = makeContext({ id: 7 });

    await expect(advancedStats(MATCHUP_PLAYER, {}, ctx)).resolves.toBeNull();
    expect(hasEntitlement).toHaveBeenCalledWith(ctx, 'football_projections');
  });

  it('resolves an all-null metrics object for an entitled caller viewing a football player', async () => {
    const advancedStats = await captureAdvancedStatsResolver();
    hasEntitlement.mockResolvedValue(true);
    const { ctx } = makeContext({ id: 7 });

    await expect(advancedStats(MATCHUP_PLAYER, {}, ctx)).resolves.toEqual({
      snapCountPercentage: null,
      targetSharePercentage: null,
      airYards: null,
    });
    expect(hasEntitlement).toHaveBeenCalledWith(ctx, 'football_projections');
  });
});

export {};
