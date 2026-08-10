/**
 * Resolver tests for updateLeagueScoringPositionBonuses (LS-9104).
 *
 * Mirrors the tiered test-user convention from
 * lambdas/db/src/schema/authorization.premium.spec.ts and the entitlement-gate
 * resolver spec pattern in
 * lambdas/db/src/schema/drafts/mutations/update-draft-settings.spec.ts:
 * asserts a free-tier commissioner is rejected with PremiumRequiredError, and
 * that a premium commissioner and an admin both pass the entitlement gate.
 *
 * Unlike updateLeagueScoringProfile (free), this mutation is a hard,
 * whole-mutation gate behind ENTITLEMENTS.custom_scoring_multipliers — every
 * caller needs the entitlement, not just specific field values — mirroring
 * the advanced_scheduling hard-gate at leagues/mutations.ts:639-644, which
 * uses requireFreshEntitlement (live Stripe read) rather than the
 * token-claim-based requireEntitlement.
 */
import type { GraphQLSchema } from 'graphql';
import { ENTITLEMENTS } from '@legacy-sports/utils';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockStripeList = jest.fn();
const mockRefreshPlayerScoringCache = jest.fn().mockResolvedValue(undefined);
// Path is relative to fresh-entitlements.ts's own location (lambdas/db/src/schema/),
// which is also this spec file's directory, so '../server/stripe' resolves to
// lambdas/db/src/server/stripe.ts in both cases.
jest.mock('../server/stripe', () => ({
  getStripeClient: jest.fn(() =>
    Promise.resolve({
      entitlements: { activeEntitlements: { list: mockStripeList } },
    }),
  ),
}));

function stripeYields(lookupKeys: Array<string | null>): void {
  mockStripeList.mockImplementation(function* () {
    for (const lookup_key of lookupKeys) yield { lookup_key };
  });
}

describe('updateLeagueScoringPositionBonuses — premium gate (LS-9104)', () => {
  let schemaUnderTest: GraphQLSchema;
  let databaseServiceMock: {
    scoring: {
      getActiveProfileDetails: jest.Mock;
      getPositionBonusesForProfile: jest.Mock;
      updatePositionBonuses: jest.Mock;
      getScoringDefinitions: jest.Mock;
      getDefaultMultipliers: jest.Mock;
      updateActiveProfile: jest.Mock;
    };
  };

  beforeEach(() => {
    jest.resetModules();
    mockStripeList.mockReset();
    mockRefreshPlayerScoringCache.mockReset().mockResolvedValue(undefined);

    databaseServiceMock = {
      scoring: {
        getActiveProfileDetails: jest.fn().mockResolvedValue({
          profileId: 5,
          leagueId: 10,
          profileName: 'Custom',
          definitions: [],
          entries: [],
        }),
        getPositionBonusesForProfile: jest.fn().mockResolvedValue([]),
        updatePositionBonuses: jest.fn().mockResolvedValue([]),
        getScoringDefinitions: jest.fn().mockResolvedValue([]),
        getDefaultMultipliers: jest.fn().mockResolvedValue({}),
        updateActiveProfile: jest.fn(),
      },
    };

    jest.doMock('@legacy-sports/utils', () => ({
      ...jest.requireActual('@legacy-sports/utils'),
      getDbOptions: jest.fn(() => ({})),
    }));

    jest.doMock('@legacy-sports/db-client', () => {
      const actual = jest.requireActual('@legacy-sports/db-client');
      return {
        ...actual,
        createDatabaseService: jest.fn(() => databaseServiceMock),
        refreshPlayerScoringCache: mockRefreshPlayerScoringCache,
      };
    });

    jest.isolateModules(() => {
      const schemaModule = require('../schema') as { schema: GraphQLSchema };
      schemaUnderTest = schemaModule.schema;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function getMutationResolve() {
    const mutationType = schemaUnderTest.getMutationType();
    const field = mutationType?.getFields().updateLeagueScoringPositionBonuses;
    if (!field?.resolve) {
      throw new Error('updateLeagueScoringPositionBonuses resolver not found');
    }
    return field.resolve;
  }

  // Routes db.select(columns) calls by the requested column shape, matching
  // the "route by shape, not call order" convention used elsewhere for
  // resolvers whose guard ordering can shift (LS-8598).
  function makeDb(options: {
    permissionLevel?: string;
    stripeCustomerId?: string | null;
    accessLevel?: string;
  }) {
    const {
      permissionLevel = 'commissioner',
      stripeCustomerId = null,
      accessLevel,
    } = options;

    return {
      select: jest.fn((columns?: Record<string, unknown>) => {
        if (columns && 'stripeCustomerId' in columns) {
          return {
            from: () => ({
              where: () => ({
                limit: () =>
                  Promise.resolve(
                    stripeCustomerId ? [{ stripeCustomerId }] : [],
                  ),
              }),
            }),
          };
        }
        if (columns && 'permissionLevel' in columns) {
          return {
            from: () => ({
              where: () => ({
                limit: () => Promise.resolve([{ permissionLevel }]),
              }),
            }),
          };
        }
        if (columns && 'accessLevel' in columns) {
          return {
            from: () => ({
              where: () => ({
                limit: () =>
                  Promise.resolve(accessLevel ? [{ accessLevel }] : []),
              }),
            }),
          };
        }
        // ensureLeagueAccess's membership existence check.
        return {
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([{ leagueId: 10 }]),
            }),
          }),
        };
      }),
      execute: jest.fn().mockResolvedValue(undefined),
    };
  }

  const validUpdates = [
    { statDefinitionId: 1, position: 'TE', bonusMultiplier: 0.5 },
  ];

  it('throws AuthenticationError when context.user is null', async () => {
    const resolve = getMutationResolve();
    await expect(
      resolve(
        {},
        { leagueId: 10, updates: validUpdates },
        { user: null, db: makeDb({}) },
        undefined as never,
      ),
    ).rejects.toThrow(/Authentication required/i);
  });

  it('rejects a free-tier commissioner with PremiumRequiredError', async () => {
    stripeYields([]); // live Stripe grants nothing
    const resolve = getMutationResolve();

    await expect(
      resolve(
        {},
        { leagueId: 10, updates: validUpdates },
        {
          user: { id: 1, isAdmin: false },
          db: makeDb({
            permissionLevel: 'commissioner',
            stripeCustomerId: 'cus_free',
          }),
        },
        undefined as never,
      ),
    ).rejects.toMatchObject({ extensions: { code: 'PREMIUM_REQUIRED' } });

    expect(
      databaseServiceMock.scoring.updatePositionBonuses,
    ).not.toHaveBeenCalled();
  });

  it('rejects a non-commissioner league member before reaching the entitlement check', async () => {
    const resolve = getMutationResolve();

    await expect(
      resolve(
        {},
        { leagueId: 10, updates: validUpdates },
        {
          user: { id: 1, isAdmin: false },
          db: makeDb({ permissionLevel: 'member' }),
        },
        undefined as never,
      ),
    ).rejects.toThrow(/Commissioner or General Manager/i);

    expect(mockStripeList).not.toHaveBeenCalled();
  });

  it('allows a premium commissioner to update position bonuses', async () => {
    stripeYields([ENTITLEMENTS.custom_scoring_multipliers]);
    const resolve = getMutationResolve();

    const result = await resolve(
      {},
      { leagueId: 10, updates: validUpdates },
      {
        user: { id: 1, isAdmin: false },
        db: makeDb({
          permissionLevel: 'commissioner',
          stripeCustomerId: 'cus_premium',
        }),
      },
      undefined as never,
    );

    expect(result).toMatchObject({ profileId: 5, leagueId: 10 });
    expect(
      databaseServiceMock.scoring.updatePositionBonuses,
    ).toHaveBeenCalledWith(10, [
      {
        statDefinitionId: 1,
        position: 'TE',
        bonusMultiplier: 0.5,
        isEnabled: undefined,
      },
    ]);
    expect(mockRefreshPlayerScoringCache).toHaveBeenCalledWith(
      expect.anything(),
      10,
    );
  });

  it('allows an admin to update position bonuses without a premium subscription', async () => {
    const resolve = getMutationResolve();

    const result = await resolve(
      {},
      { leagueId: 10, updates: validUpdates },
      {
        user: { id: 9, isAdmin: true },
        db: makeDb({ accessLevel: 'admin' }),
      },
      undefined as never,
    );

    expect(result).toMatchObject({ profileId: 5, leagueId: 10 });
    // Admin bypass short-circuits before any Stripe read.
    expect(mockStripeList).not.toHaveBeenCalled();
    expect(
      databaseServiceMock.scoring.updatePositionBonuses,
    ).toHaveBeenCalled();
    expect(mockRefreshPlayerScoringCache).toHaveBeenCalledWith(
      expect.anything(),
      10,
    );
  });

  it('rejects an update with no bonusMultiplier or isEnabled', async () => {
    stripeYields([ENTITLEMENTS.custom_scoring_multipliers]);
    const resolve = getMutationResolve();

    await expect(
      resolve(
        {},
        {
          leagueId: 10,
          updates: [{ statDefinitionId: 1, position: 'TE' }],
        },
        {
          user: { id: 1, isAdmin: false },
          db: makeDb({
            permissionLevel: 'commissioner',
            stripeCustomerId: 'cus_premium',
          }),
        },
        undefined as never,
      ),
    ).rejects.toThrow(/must include a bonusMultiplier or an isEnabled flag/i);
  });

  it('rejects an update with an empty or whitespace-only position', async () => {
    stripeYields([ENTITLEMENTS.custom_scoring_multipliers]);
    const resolve = getMutationResolve();

    await expect(
      resolve(
        {},
        {
          leagueId: 10,
          updates: [
            { statDefinitionId: 1, position: '   ', bonusMultiplier: 0.5 },
          ],
        },
        {
          user: { id: 1, isAdmin: false },
          db: makeDb({
            permissionLevel: 'commissioner',
            stripeCustomerId: 'cus_premium',
          }),
        },
        undefined as never,
      ),
    ).rejects.toThrow(/must include a position/i);
  });

  it('rejects a non-finite bonusMultiplier', async () => {
    stripeYields([ENTITLEMENTS.custom_scoring_multipliers]);
    const resolve = getMutationResolve();

    await expect(
      resolve(
        {},
        {
          leagueId: 10,
          updates: [
            { statDefinitionId: 1, position: 'TE', bonusMultiplier: NaN },
          ],
        },
        {
          user: { id: 1, isAdmin: false },
          db: makeDb({
            permissionLevel: 'commissioner',
            stripeCustomerId: 'cus_premium',
          }),
        },
        undefined as never,
      ),
    ).rejects.toThrow(/must be finite numbers/i);
  });
});

export {};
