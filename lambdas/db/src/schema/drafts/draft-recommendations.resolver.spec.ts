/**
 * Resolver-level entitlement tests for getDraftRecommendations.
 *
 * Draft recommendations are a Premium feature (ENTITLEMENTS.draft_recommendations).
 * These tests assert the resolver's gate ordering:
 *   1. Unauthenticated → UNAUTHENTICATED (before any entitlement/DB work).
 *   2. Free tier → requireEntitlement throws PREMIUM_REQUIRED, before any DB read.
 *   3. Premium tier → passes the entitlement gate and proceeds (reaching the
 *      "Draft not found" branch with an empty mock DB proves the gate let it
 *      through).
 */

const requireEntitlement = jest.fn();

async function captureGetDraftRecommendationsResolver(): Promise<
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

  jest.doMock('@legacy-sports/db-client', () => ({
    PublicSchema: {
      drafts: { id: 'id', leagueId: 'leagueId' },
      draftPicks: {
        draftId: 'draftId',
        playerId: 'playerId',
        teamId: 'teamId',
      },
    },
    careerGamesCondition: jest.fn(),
    careerSeasonsCondition: jest.fn(),
  }));

  jest.doMock('drizzle-orm', () => ({
    and: jest.fn(),
    asc: jest.fn(),
    desc: jest.fn(),
    eq: jest.fn(),
    inArray: jest.fn(),
    sql: jest.fn(),
  }));

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
    countRecentMockDrafts: jest.fn(),
    MOCK_DRAFT_FREE_WEEKLY_LIMIT: 2,
  }));

  jest.doMock('../authorization', () => ({
    hasEntitlement: jest.fn(),
    requireEntitlement,
    isCommissionerOrOwner: jest.fn(),
    verifyLeagueMembership: jest.fn(),
  }));

  jest.doMock('../entitlements', () => ({
    ENTITLEMENTS: {
      unlimited_mock_drafts: 'unlimited_mock_drafts',
      draft_recommendations: 'draft_recommendations',
    },
  }));

  jest.doMock('../graphql-errors', () => ({
    AuthenticationError: jest.fn((msg?: string) => {
      const err = new Error(msg ?? 'Unauthenticated') as Error & {
        extensions: { code: string };
      };
      err.extensions = { code: 'UNAUTHENTICATED' };
      return err;
    }),
    ForbiddenError: jest.fn((msg?: string) => new Error(msg ?? 'Forbidden')),
    UserInputError: jest.fn((msg?: string) => new Error(msg ?? 'UserInput')),
  }));

  await import('./queries');
  const resolve = captured.getDraftRecommendations;
  if (!resolve)
    throw new Error('getDraftRecommendations resolver was not captured');
  return resolve;
}

/** Chainable DB stub whose initial `.limit(1)` draft lookup returns []. */
function emptyDb() {
  const chain: Record<string, unknown> = {};
  chain.select = jest.fn(() => chain);
  chain.from = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.limit = jest.fn(() => Promise.resolve([]));
  return chain;
}

describe('getDraftRecommendations resolver — entitlement gate', () => {
  beforeEach(() => {
    requireEntitlement.mockReset();
  });

  it('rejects unauthenticated callers before checking entitlement', async () => {
    const resolve = await captureGetDraftRecommendationsResolver();
    await expect(
      resolve({}, { draftId: 1, teamId: 1 }, { user: null, db: emptyDb() }),
    ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
    expect(requireEntitlement).not.toHaveBeenCalled();
  });

  it('rejects free-tier callers with PREMIUM_REQUIRED before any DB read', async () => {
    const resolve = await captureGetDraftRecommendationsResolver();
    const premiumErr = Object.assign(new Error('Upgrade required'), {
      extensions: { code: 'PREMIUM_REQUIRED' },
    });
    requireEntitlement.mockRejectedValue(premiumErr);
    const db = emptyDb();

    await expect(
      resolve({}, { draftId: 1, teamId: 1 }, { user: { id: 7 }, db }),
    ).rejects.toMatchObject({ extensions: { code: 'PREMIUM_REQUIRED' } });

    expect(requireEntitlement).toHaveBeenCalledWith(
      expect.objectContaining({ user: { id: 7 } }),
      'draft_recommendations',
    );
    // Gate must run before any DB work.
    expect(db.select).not.toHaveBeenCalled();
  });

  it('lets premium callers past the gate (reaches the draft lookup)', async () => {
    const resolve = await captureGetDraftRecommendationsResolver();
    requireEntitlement.mockResolvedValue(undefined);
    const db = emptyDb();

    // Empty DB → draft lookup returns [] → "Draft not found"; reaching this
    // branch proves the entitlement gate allowed the request through.
    await expect(
      resolve({}, { draftId: 1, teamId: 1 }, { user: { id: 7 }, db }),
    ).rejects.toThrow(/Draft not found/);

    expect(requireEntitlement).toHaveBeenCalledWith(
      expect.objectContaining({ user: { id: 7 } }),
      'draft_recommendations',
    );
    expect(db.select).toHaveBeenCalled();
  });
});
