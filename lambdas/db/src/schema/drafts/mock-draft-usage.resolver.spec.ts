/**
 * Resolver-level tests for getMyMockDraftUsage (LS-5178).
 *
 * The query surfaces the current user's mock-draft usage against the free-tier
 * weekly cap so the web UI can reflect the limit *before* submit. These tests
 * exercise the three branches that drive the UI:
 *   1. Unauthenticated → UNAUTHENTICATED.
 *   2. Unlimited entitlement → isUnlimited=true, remaining null (LS-10463).
 *   3. Free tier → remaining = max(0, limit - used).
 * Plus `resetsAt` (LS-10455): the next-slot instant for free users, null for
 * unlimited users.
 */

const hasEntitlement = jest.fn();
const countRecentMockDrafts = jest.fn();
const getNextMockDraftSlotAt = jest.fn();

async function captureGetMyMockDraftUsageResolver(): Promise<
  (...args: unknown[]) => Promise<unknown>
> {
  jest.resetModules();
  const captured: Record<string, (...args: unknown[]) => Promise<unknown>> = {};

  jest.doMock('../builder', () => ({
    builder: {
      queryField: jest.fn((name: string, fn: (t: unknown) => void) => {
        fn({
          field: (opts: {
            resolve: (...args: unknown[]) => Promise<unknown>;
          }) => {
            captured[name] = opts.resolve;
          },
          arg: {
            int: () => ({}),
            string: () => ({}),
          },
        });
      }),
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

  jest.doMock('@legacy-sports/db-client', () =>
    mockDbClientModule({
      PublicSchema: {},
      careerGamesCondition: jest.fn(),
      careerSeasonsCondition: jest.fn(),
    }),
  );

  jest.doMock('drizzle-orm', () =>
    mockDrizzleOrm({
      and: jest.fn(),
      asc: jest.fn(),
      desc: jest.fn(),
      eq: jest.fn(),
    }),
  );

  jest.doMock('./types', () => ({
    CurrentDraftPick: {},
    Draft: {},
    DraftPick: {},
    DraftPlayer: {},
    DraftQueueEntry: {},
    DraftRecommendation: {},
    DraftTeamAutoPickStatus: {},
    DraftTeamOrderEntry: {},
    MockDraftUsage: {},
  }));

  jest.doMock('./helpers', () => ({
    getCurrentDraftPickInfo: jest.fn(),
    countRecentMockDrafts,
    getNextMockDraftSlotAt,
    MOCK_DRAFT_FREE_WEEKLY_LIMIT: 2,
  }));

  jest.doMock('../authorization', () => ({
    hasEntitlement,
    isCommissionerOrOwner: jest.fn(),
    verifyLeagueMembership: jest.fn(),
  }));

  jest.doMock('../entitlements', () => ({
    ENTITLEMENTS: { unlimited_mock_drafts: 'unlimited_mock_drafts' },
  }));

  jest.doMock('../graphql-errors', () => ({
    AuthenticationError: jest.fn((msg?: string) => {
      const err = new Error(msg ?? 'Unauthenticated') as Error & {
        extensions: { code: string };
      };
      err.extensions = { code: 'UNAUTHENTICATED' };
      return err;
    }),
    ForbiddenError: jest.fn(),
    UserInputError: jest.fn(),
  }));

  await import('./queries');
  const resolve = captured.getMyMockDraftUsage;
  if (!resolve)
    throw new Error('getMyMockDraftUsage resolver was not captured');
  return resolve;
}

describe('getMyMockDraftUsage resolver — LS-5178', () => {
  beforeEach(() => {
    hasEntitlement.mockReset();
    countRecentMockDrafts.mockReset();
    getNextMockDraftSlotAt.mockReset();
    getNextMockDraftSlotAt.mockResolvedValue(null);
  });

  it('rejects unauthenticated callers with UNAUTHENTICATED', async () => {
    const resolve = await captureGetMyMockDraftUsageResolver();
    await expect(
      resolve({}, {}, { user: null, db: {} }, undefined),
    ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
  });

  it('reports unlimited usage with full headroom for entitled users', async () => {
    const resolve = await captureGetMyMockDraftUsageResolver();
    hasEntitlement.mockResolvedValue(true);
    countRecentMockDrafts.mockResolvedValue(5);

    const result = await resolve(
      {},
      {},
      { user: { id: 42, isAdmin: false }, db: {} },
      undefined,
    );

    // Even when the user has created more drafts than the free cap, an
    // unlimited user is never gated: remaining is null so no client can
    // render it as a cap (LS-10463).
    expect(result).toEqual({
      used: 5,
      limit: 2,
      remaining: null,
      isUnlimited: true,
      resetsAt: null,
    });
    // Unlimited users never wait on a slot — no lookup.
    expect(getNextMockDraftSlotAt).not.toHaveBeenCalled();
  });

  it('reports remaining drafts for a free user below the cap', async () => {
    const resolve = await captureGetMyMockDraftUsageResolver();
    hasEntitlement.mockResolvedValue(false);
    countRecentMockDrafts.mockResolvedValue(1);

    const result = await resolve(
      {},
      {},
      { user: { id: 7, isAdmin: false }, db: {} },
      undefined,
    );

    expect(result).toEqual({
      used: 1,
      limit: 2,
      remaining: 1,
      isUnlimited: false,
      resetsAt: null,
    });
  });

  it('clamps remaining to 0 for a free user at (or over) the cap', async () => {
    const resolve = await captureGetMyMockDraftUsageResolver();
    hasEntitlement.mockResolvedValue(false);
    countRecentMockDrafts.mockResolvedValue(2);
    getNextMockDraftSlotAt.mockResolvedValue(
      new Date('2026-10-09T16:00:00.000Z'),
    );

    const result = await resolve(
      {},
      {},
      { user: { id: 7, isAdmin: false }, db: {} },
      undefined,
    );

    expect(result).toEqual({
      used: 2,
      limit: 2,
      remaining: 0,
      isUnlimited: false,
      resetsAt: '2026-10-09T16:00:00.000Z',
    });
    expect(getNextMockDraftSlotAt).toHaveBeenCalledWith({}, 7, 2, 2);
  });
});

export {};
