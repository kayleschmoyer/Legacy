/**
 * Resolver-level entitlement tests for MatchupPlayer.footballSeasonFppg
 * (FMD-028 / LS-6385).
 *
 * Powers the client "Matchup Edge" grade chip — the player's own real
 * season-average fantasy points per game, gated as defense-in-depth behind
 * the UI PremiumGate (ENTITLEMENTS.football_projections): an unauthenticated
 * or free-tier caller gets `null` rather than the computed value (vs.
 * throwing, so the rest of the `getMatchupPlayers` query stays intact).
 *
 * Gate order in the resolver:
 *   1. No assigned season → null (before any auth/entitlement work).
 *   2. No authenticated user → null.
 *   3. Lacks football_projections entitlement → null (no player/matchup loads happen).
 *   4. Entitled but the player isn't a football player (or is missing) → null.
 *   5. Entitled football player → resolves via getFootballPlayerSeasonAverage.
 */

const hasEntitlement = jest.fn();
const getFootballPlayerSeasonAverage = jest.fn();

/** Capture the MatchupPlayer object type's field resolvers (incl. `footballSeasonFppg`). */
async function captureFppgResolver(): Promise<
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
    getFootballPlayerSeasonAverage,
  }));

  await import('./types');
  const fppg = captured.footballSeasonFppg?.resolve;
  if (!fppg)
    throw new Error('footballSeasonFppg field resolver was not captured');
  return fppg as (...args: unknown[]) => Promise<unknown>;
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
  overrides: {
    player?: Record<string, unknown> | null;
    matchup?: Record<string, unknown> | null;
  } = {},
) {
  const player = overrides.player ?? {
    id: 901,
    sport: 'football',
    position: 'QB',
    isDst: false,
  };
  const matchup = overrides.matchup ?? { leagueId: 5, weekNumber: 3 };

  const playersLoad = jest.fn().mockResolvedValue(player);
  const matchupsByIdLoad = jest.fn().mockResolvedValue(matchup);
  const scoringSettingsLoad = jest.fn().mockResolvedValue({});

  return {
    ctx: {
      user,
      db: {},
      loaders: {
        players: { load: playersLoad },
        matchupsById: { load: matchupsByIdLoad },
        footballScoringSettingsByLeagueId: { load: scoringSettingsLoad },
      },
    },
    playersLoad,
    matchupsByIdLoad,
    scoringSettingsLoad,
  };
}

describe('MatchupPlayer.footballSeasonFppg field — entitlement gate', () => {
  beforeEach(() => {
    hasEntitlement.mockReset();
    getFootballPlayerSeasonAverage.mockReset();
  });

  it('returns null when the player has no assigned season, without checking entitlement', async () => {
    const fppg = await captureFppgResolver();
    const { ctx } = makeContext({ id: 1 });
    await expect(
      fppg({ ...MATCHUP_PLAYER, season: null }, {}, ctx),
    ).resolves.toBeNull();
    expect(hasEntitlement).not.toHaveBeenCalled();
  });

  it('returns null for unauthenticated callers', async () => {
    const fppg = await captureFppgResolver();
    const { ctx, playersLoad } = makeContext(null);
    await expect(fppg(MATCHUP_PLAYER, {}, ctx)).resolves.toBeNull();
    expect(hasEntitlement).not.toHaveBeenCalled();
    expect(playersLoad).not.toHaveBeenCalled();
  });

  it('returns null for free-tier callers and never loads player/matchup data', async () => {
    const fppg = await captureFppgResolver();
    hasEntitlement.mockResolvedValue(false);
    const { ctx, playersLoad } = makeContext({ id: 7 });

    await expect(fppg(MATCHUP_PLAYER, {}, ctx)).resolves.toBeNull();
    expect(hasEntitlement).toHaveBeenCalledWith(ctx, 'football_projections');
    expect(playersLoad).not.toHaveBeenCalled();
    expect(getFootballPlayerSeasonAverage).not.toHaveBeenCalled();
  });

  it('returns null for a baseball player even when entitled', async () => {
    const fppg = await captureFppgResolver();
    hasEntitlement.mockResolvedValue(true);
    const { ctx } = makeContext(
      { id: 7 },
      { player: { id: 901, sport: 'baseball', position: null, isDst: false } },
    );

    await expect(fppg(MATCHUP_PLAYER, {}, ctx)).resolves.toBeNull();
    expect(getFootballPlayerSeasonAverage).not.toHaveBeenCalled();
  });

  it('resolves the season average for an entitled caller viewing a football player', async () => {
    const fppg = await captureFppgResolver();
    hasEntitlement.mockResolvedValue(true);
    getFootballPlayerSeasonAverage.mockResolvedValue(18.5);
    const { ctx, scoringSettingsLoad } = makeContext({ id: 7 });

    await expect(fppg(MATCHUP_PLAYER, {}, ctx)).resolves.toBe(18.5);
    expect(hasEntitlement).toHaveBeenCalledWith(ctx, 'football_projections');
    expect(scoringSettingsLoad).toHaveBeenCalledWith(5);
    expect(getFootballPlayerSeasonAverage).toHaveBeenCalledWith(
      ctx.db,
      901,
      2026,
      false,
      false,
      {},
      'QB',
    );
  });

  it('derives isIdp from the player position for DL/LB/DB/DP', async () => {
    const fppg = await captureFppgResolver();
    hasEntitlement.mockResolvedValue(true);
    getFootballPlayerSeasonAverage.mockResolvedValue(9.2);
    const { ctx } = makeContext(
      { id: 7 },
      { player: { id: 901, sport: 'football', position: 'LB', isDst: false } },
    );

    await expect(fppg(MATCHUP_PLAYER, {}, ctx)).resolves.toBe(9.2);
    expect(getFootballPlayerSeasonAverage).toHaveBeenCalledWith(
      ctx.db,
      901,
      2026,
      false,
      true,
      {},
      'LB',
    );
  });
});

export {};
