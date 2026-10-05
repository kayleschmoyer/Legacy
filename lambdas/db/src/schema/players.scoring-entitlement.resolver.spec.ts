/**
 * Resolver-level entitlement tests for the Player.scoring field (LS-7015 / PCM-022).
 *
 * Fantasy scoring projections are a Premium feature (ENTITLEMENTS.player_comparison).
 * The field is nullable and gated server-side as defense-in-depth behind the UI
 * PremiumGate: an unauthenticated or free-tier caller gets `null` instead of the
 * scoring payload (vs. throwing, so the parent `players` query stays intact).
 *
 * Gate order in the resolver:
 *   1. No authenticated user → null.
 *   2. Lacks player_comparison entitlement → null (no scoring data returned).
 *   3. Entitled → returns full scoring payload.
 */

const hasEntitlement = jest.fn();

const MOCK_SCORING = {
  totalScore: 312.5,
  avgPointsPerGame: 8.2,
  hitterScore: 280.0,
  pitchingScore: 0.0,
  fieldingScore: 32.5,
  battingScore: 280.0,
};

const MOCK_PLAYER = {
  id: 1,
  firstName: 'Aaron',
  lastName: 'Judge',
  brefId: 'judgeaa01',
  mlbPlayerId: null,
  statsLastFetchedAt: null,
  scoring: MOCK_SCORING,
  allStarSelections: 5,
  goldGloves: 0,
  silverSluggers: 3,
  mvpAwards: 2,
  cyYoungAwards: 0,
  worldSeriesRings: 1,
  hallOfFame: false,
  rookieOfTheYear: false,
};

async function captureScoringResolver(): Promise<
  (...args: unknown[]) => Promise<unknown>
> {
  jest.resetModules();
  const captured: Record<string, { resolve?: (...a: unknown[]) => unknown }> =
    {};

  const tStub = new Proxy({}, { get: () => (arg: unknown) => arg });

  const captureFields = (opts?: { fields?: (t: unknown) => unknown }) => {
    if (opts?.fields) {
      Object.assign(captured, opts.fields(tStub) as Record<string, unknown>);
    }
  };

  jest.doMock('./builder', () => ({
    builder: {
      enumType: () => ({}),
      inputType: () => ({}),
      objectRef: () => ({ implement: (opts: never) => captureFields(opts) }),
      objectType: (_ref: unknown, opts: never) => captureFields(opts),
      queryField: jest.fn(),
    },
  }));

  jest.doMock('@legacy-sports/utils/node', () => ({
    ...jest.requireActual('@legacy-sports/utils/node'),
    getDbOptions: jest.fn(() => ({})),
  }));

  jest.doMock('@legacy-sports/db-client', () =>
    mockDbClientModule({
      createDatabaseService: jest.fn(() => ({
        players: {
          getPlayers: jest.fn(),
          getPlayerById: jest.fn(),
          getPlayerByBrefId: jest.fn(),
          getPlayerByMlbId: jest.fn(),
          searchPlayers: jest.fn(),
        },
      })),
      PublicSchema: {
        leagues: {
          id: 'id',
          minCareerGames: 'minCareerGames',
          minCareerSeasons: 'minCareerSeasons',
          baseballEraFilter: 'baseballEraFilter',
          baseballHofOnly: 'baseballHofOnly',
          customEraStartYear: 'customEraStartYear',
          customEraEndYear: 'customEraEndYear',
          sport: 'sport',
        },
      },
    }),
  );

  jest.doMock('drizzle-orm', () =>
    mockDrizzleOrm({
      eq: jest.fn(),
    }),
  );

  jest.doMock('./authorization', () => ({ hasEntitlement }));

  jest.doMock('./entitlements', () => ({
    ENTITLEMENTS: { player_comparison: 'player_comparison' },
  }));

  jest.doMock('./graphql-errors', () => ({
    UserInputError: (msg: string) => new Error(msg),
    AuthenticationError: () => new Error('Unauthenticated'),
    ForbiddenError: (msg: string) => new Error(msg),
  }));

  jest.doMock('./leagues/types', () => ({ SportKindEnum: {} }));

  jest.doMock('./statistics', () => ({
    CareerBattingRef: {},
    CareerPitchingRef: {},
  }));

  await import('./players');
  const field = captured.scoring;
  if (!field?.resolve) {
    throw new Error('scoring field resolver was not captured');
  }
  return field.resolve as (...args: unknown[]) => Promise<unknown>;
}

function makeContext(user: unknown) {
  return {
    user,
    loaders: {},
    db: {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    },
    isSystemRequest: false,
    authSource: null,
  };
}

describe('Player.scoring field — entitlement gate (PCM-022)', () => {
  beforeEach(() => {
    hasEntitlement.mockReset();
  });

  it('returns null for unauthenticated callers without calling hasEntitlement', async () => {
    const resolve = await captureScoringResolver();
    const ctx = makeContext(null);

    await expect(resolve(MOCK_PLAYER, {}, ctx)).resolves.toBeNull();
    expect(hasEntitlement).not.toHaveBeenCalled();
  });

  it('returns null for free-tier callers and never returns scoring data', async () => {
    const resolve = await captureScoringResolver();
    hasEntitlement.mockResolvedValue(false);
    const ctx = makeContext({ id: 7 });

    await expect(resolve(MOCK_PLAYER, {}, ctx)).resolves.toBeNull();
    expect(hasEntitlement).toHaveBeenCalledWith(ctx, 'player_comparison');
  });

  it('returns full scoring payload for entitled callers', async () => {
    const resolve = await captureScoringResolver();
    hasEntitlement.mockResolvedValue(true);
    const ctx = makeContext({ id: 7 });

    const result = await resolve(MOCK_PLAYER, {}, ctx);
    expect(hasEntitlement).toHaveBeenCalledWith(ctx, 'player_comparison');
    expect(result).toEqual(MOCK_SCORING);
  });

  it('returns null when player has no scoring data even for entitled callers', async () => {
    const resolve = await captureScoringResolver();
    hasEntitlement.mockResolvedValue(true);
    const ctx = makeContext({ id: 7 });

    const playerWithoutScoring = { ...MOCK_PLAYER, scoring: null };
    await expect(resolve(playerWithoutScoring, {}, ctx)).resolves.toBeNull();
  });
});

export {};
