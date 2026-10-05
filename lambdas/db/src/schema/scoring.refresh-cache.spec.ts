/**
 * Tests for refreshLeagueScoringCacheBySport (LS-9484).
 *
 * updateLeagueScoringProfile/updateLeagueScoringPositionBonuses previously
 * always invalidated the baseball-only player_scoring_cache regardless of
 * league sport — harmless-but-wasted work for football leagues before this
 * ticket (their rows there always scored 0), but silently wrong once a real
 * football_player_scoring_cache exists: a football league's edit needs to
 * refresh football_player_scoring_cache instead, or the Draft
 * Intelligence panel and auto-pick would keep ranking on stale scores.
 *
 * This exercises the extracted, exported routing function directly (a plain
 * exported function, not a captured resolver) — GraphQL-level resolver
 * behavior for updateLeagueScoringProfile itself is already covered by
 * scoring.resolver.spec.ts.
 */

async function loadScoringModule(): Promise<typeof import('./scoring')> {
  jest.resetModules();

  jest.doMock('../db/dataloaders', () => ({}), { virtual: true });

  jest.doMock('./builder', () => ({
    builder: {
      queryField: jest.fn(),
      mutationField: jest.fn(),
      enumType: jest.fn(),
      inputType: jest.fn(),
      objectRef: jest.fn(() => ({ implement: jest.fn() })),
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

  jest.doMock('@legacy-sports/utils/node', () => ({
    getDbOptions: jest.fn(() => ({})),
  }));

  const refreshFootballPlayerScoringCache = jest
    .fn()
    .mockResolvedValue(undefined);
  const refreshPlayerScoringCache = jest.fn().mockResolvedValue(undefined);

  jest.doMock('@legacy-sports/db-client', () =>
    mockDbClientModule({
      createDatabaseService: jest.fn(() => ({ scoring: {} })),
      PublicSchema: {
        leagues: { id: 'id', sport: 'sport' },
      },
      refreshFootballPlayerScoringCache,
      refreshPlayerScoringCache,
    }),
  );

  jest.doMock('./authorization', () => ({
    checkAdminInDb: jest.fn(),
  }));

  jest.doMock('./entitlements', () => ({
    ENTITLEMENTS: { custom_scoring_multipliers: 'custom_scoring_multipliers' },
  }));

  jest.doMock('./fresh-entitlements', () => ({
    requireFreshEntitlement: jest.fn(),
  }));

  jest.doMock('./graphql-errors', () => ({
    AuthenticationError: jest.fn(),
    ForbiddenError: jest.fn(),
    UserInputError: jest.fn(),
  }));

  // Real drizzle-orm — eq()/and() are pure and side-effect-free, and the mock
  // db chain below ignores their return value anyway.
  return import('./scoring');
}

/** Chainable db.select stub resolving to a single canned league row. */
function makeDb(leagueRow: { sport: string } | undefined) {
  const chain: Record<string, unknown> = {};
  chain.select = jest.fn(() => chain);
  chain.from = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.limit = jest.fn(() => Promise.resolve(leagueRow ? [leagueRow] : []));
  return chain;
}

describe('refreshLeagueScoringCacheBySport (LS-9484)', () => {
  it('refreshes football_player_scoring_cache for a football league', async () => {
    const { refreshLeagueScoringCacheBySport } = await loadScoringModule();
    const { refreshFootballPlayerScoringCache, refreshPlayerScoringCache } =
      jest.requireMock('@legacy-sports/db-client');
    const db = makeDb({ sport: 'football' });

    await refreshLeagueScoringCacheBySport(db as never, 42, 'test context');

    expect(refreshFootballPlayerScoringCache).toHaveBeenCalledWith(db, 42);
    expect(refreshPlayerScoringCache).not.toHaveBeenCalled();
  });

  it('refreshes player_scoring_cache for a baseball league', async () => {
    const { refreshLeagueScoringCacheBySport } = await loadScoringModule();
    const { refreshFootballPlayerScoringCache, refreshPlayerScoringCache } =
      jest.requireMock('@legacy-sports/db-client');
    const db = makeDb({ sport: 'baseball' });

    await refreshLeagueScoringCacheBySport(db as never, 7, 'test context');

    expect(refreshPlayerScoringCache).toHaveBeenCalledWith(db, 7);
    expect(refreshFootballPlayerScoringCache).not.toHaveBeenCalled();
  });

  it('never rejects — a league lookup failure is caught and logged, not thrown', async () => {
    const { refreshLeagueScoringCacheBySport } = await loadScoringModule();
    const { LOGGER } = jest.requireMock('@legacy-sports/logging');
    const db = {
      select: jest.fn(() => {
        throw new Error('connection lost');
      }),
    };

    await expect(
      refreshLeagueScoringCacheBySport(db as never, 1, 'test context'),
    ).resolves.toBeUndefined();
    expect(LOGGER.warn).toHaveBeenCalledWith(
      expect.stringContaining('test context'),
      expect.objectContaining({ err: expect.any(Error) }),
    );
  });
});

export {};
