/**
 * Resolver-level entitlement tests for the Player.careerBatting field (LS-7004).
 *
 * Career batting statistics are a Premium feature (ENTITLEMENTS.player_comparison).
 * The field is nullable and gated server-side so free/unauthenticated callers
 * receive `null` instead of the full statistics object — the parent `player`
 * query remains intact and the UI PremiumGate handles the blur.
 *
 * Gate order in the resolver:
 *   1. No authenticated user → null (no DB/entitlement work).
 *   2. Lacks player_comparison entitlement → null (loader never called).
 *   3. Entitled → proceeds to load career batting stats.
 */

const hasEntitlement = jest.fn();
const careerBattingLoad = jest.fn();

async function captureCareerBattingResolver(): Promise<
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
      mutationField: jest.fn(),
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

  jest.doMock('@legacy-sports/db-client', () => ({
    createDatabaseService: jest.fn(() => ({ players: {} })),
    PublicSchema: { users: { id: 'id', accessLevel: 'accessLevel' } },
    InternalSchema: {
      usersInAppInternal: { id: 'id', subscriptionTier: 'subscription_tier' },
    },
  }));

  jest.doMock('@legacy-sports/utils/node', () => ({
    getDbOptions: jest.fn(() => ({})),
  }));

  jest.doMock('drizzle-orm', () => ({ eq: jest.fn() }));

  jest.doMock('./leagues/types', () => ({ SportKindEnum: {} }));

  jest.doMock('./statistics', () => ({
    CareerBattingRef: {},
    CareerPitchingRef: {},
  }));

  jest.doMock('./graphql-errors', () => ({
    UserInputError: jest.fn(),
  }));

  jest.doMock('./authorization', () => ({ hasEntitlement }));

  jest.doMock('./entitlements', () => ({
    ENTITLEMENTS: { player_comparison: 'player_comparison' },
  }));

  await import('./players');
  const field = captured.careerBatting?.resolve;
  if (!field) throw new Error('careerBatting field resolver was not captured');
  return field as (...args: unknown[]) => Promise<unknown>;
}

const MOCK_PLAYER = { id: 42 };

function makeContext(user: unknown) {
  careerBattingLoad.mockReset();
  return {
    user,
    loaders: { careerBatting: { load: careerBattingLoad } },
    db: {},
  };
}

describe('Player.careerBatting field — entitlement gate (LS-7004)', () => {
  beforeEach(() => {
    hasEntitlement.mockReset();
  });

  it('returns null for unauthenticated callers without checking entitlement', async () => {
    const resolve = await captureCareerBattingResolver();
    const ctx = makeContext(null);

    await expect(resolve(MOCK_PLAYER, {}, ctx)).resolves.toBeNull();
    expect(hasEntitlement).not.toHaveBeenCalled();
    expect(careerBattingLoad).not.toHaveBeenCalled();
  });

  it('returns null for free-tier callers and never loads career batting data', async () => {
    const resolve = await captureCareerBattingResolver();
    hasEntitlement.mockResolvedValue(false);
    const ctx = makeContext({ id: 7, isAdmin: false });

    await expect(resolve(MOCK_PLAYER, {}, ctx)).resolves.toBeNull();
    expect(hasEntitlement).toHaveBeenCalledWith(ctx, 'player_comparison');
    expect(careerBattingLoad).not.toHaveBeenCalled();
  });

  it('loads and returns career batting data for entitled callers', async () => {
    const resolve = await captureCareerBattingResolver();
    hasEntitlement.mockResolvedValue(true);
    const ctx = makeContext({ id: 7, isAdmin: false });
    const mockStats = { games: 100, hits: 80 };
    careerBattingLoad.mockResolvedValue(mockStats);

    await expect(resolve(MOCK_PLAYER, {}, ctx)).resolves.toEqual(mockStats);
    expect(hasEntitlement).toHaveBeenCalledWith(ctx, 'player_comparison');
    expect(careerBattingLoad).toHaveBeenCalledWith(42);
  });
});

export {};
