/**
 * Tests for premium subscription gating helpers in authorization.ts.
 *
 * Covers:
 *  - getSubscriptionTier: returns 'free' or 'premium' from DB
 *  - requirePremium: passes for premium users, throws PREMIUM_REQUIRED for free
 *  - authorized() with premium: true flag
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/db-client', () =>
  mockDbClientModule({
    createDatabaseService: jest.fn(),
    InternalSchema: {
      usersInAppInternal: {
        id: 'app_internal.users.id',
        subscriptionTier: 'app_internal.users.subscription_tier',
        entitlementsUpdatedAt: 'app_internal.users.entitlements_updated_at',
      },
    },
    PublicSchema: {
      leagueMembers: {
        leagueId: 'league_members.league_id',
        userId: 'league_members.user_id',
        teamId: 'league_members.team_id',
        permissionLevel: 'league_members.permission_level',
      },
      leagues: {
        id: 'leagues.id',
        currentMatchup: 'leagues.current_matchup',
      },
      teamMembers: {
        id: 'team_members.id',
        teamId: 'team_members.team_id',
        leagueId: 'team_members.league_id',
        playerId: 'team_members.player_id',
      },
      matchupPlayerGames: {
        matchupPlayerId: 'matchup_player_games.matchup_player_id',
      },
      matchupPlayers: {
        id: 'matchup_players.id',
        matchupId: 'matchup_players.matchup_id',
        playerId: 'matchup_players.player_id',
        teamId: 'matchup_players.team_id',
      },
      matchups: {
        id: 'matchups.id',
        weekNumber: 'matchups.week_number',
        leagueId: 'matchups.league_id',
        team1Id: 'matchups.team1_id',
        team2Id: 'matchups.team2_id',
      },
    },
  }),
);

// Build a chainable mock DB that returns a configurable result
function makeMockDb(result: unknown[] = []) {
  const chain: Record<string, jest.Mock> = {};
  const methods = ['select', 'from', 'where', 'limit', 'innerJoin'];
  methods.forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  // The final awaited call returns the result array
  chain['then'] = jest.fn((resolve) => resolve(result));
  // Make the chain thenable for await
  Object.defineProperty(chain, Symbol.iterator, { value: undefined });
  // Override: make each method return a real Promise at the end
  const mockDb = {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn().mockResolvedValue(result),
          innerJoin: jest.fn().mockReturnThis(),
        })),
        limit: jest.fn().mockResolvedValue(result),
      })),
    })),
  };
  return mockDb;
}

describe('Premium authorization helpers', () => {
  let getSubscriptionTier: typeof import('./authorization').getSubscriptionTier;
  let requirePremium: typeof import('./authorization').requirePremium;
  let authorized: typeof import('./authorization').authorized;
  let hasEntitlement: typeof import('./authorization').hasEntitlement;

  const freeUser = {
    id: 1,
    email: 'free@test.com',
    username: 'free',
    isAdmin: false,
  };
  const premiumUser = {
    id: 2,
    email: 'premium@test.com',
    username: 'premium',
    isAdmin: false,
  };
  const adminUser = {
    id: 3,
    email: 'admin@test.com',
    username: 'admin',
    isAdmin: true,
  };

  function makeContext(
    user: typeof freeUser | null,
    subscriptionTierRow: string,
    impersonatedTier?: 'free',
  ) {
    const mockDb = {
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(() => ({
            limit: jest.fn().mockResolvedValue([{ tier: subscriptionTierRow }]),
          })),
        })),
      })),
    };
    return {
      user,
      db: mockDb,
      loaders: {},
      isSystemRequest: false,
      impersonatedTier,
    };
  }

  beforeEach(async () => {
    jest.resetModules();
    // Re-import after mocks to ensure mocks are applied
    const auth = await import('./authorization');
    getSubscriptionTier = auth.getSubscriptionTier;
    requirePremium = auth.requirePremium;
    authorized = auth.authorized;
    hasEntitlement = auth.hasEntitlement;
  });

  describe('getSubscriptionTier', () => {
    it('returns "premium" when user has premium subscription', async () => {
      const ctx = makeContext(premiumUser, 'premium');
      const tier = await getSubscriptionTier(ctx as any);
      expect(tier).toBe('premium');
    });

    it('returns "free" when user has free subscription', async () => {
      const ctx = makeContext(freeUser, 'free');
      const tier = await getSubscriptionTier(ctx as any);
      expect(tier).toBe('free');
    });

    it('returns "free" as default when no DB row found', async () => {
      const mockDb = {
        select: jest.fn(() => ({
          from: jest.fn(() => ({
            where: jest.fn(() => ({
              limit: jest.fn().mockResolvedValue([]),
            })),
          })),
        })),
      };
      const ctx = {
        user: freeUser,
        db: mockDb,
        loaders: {},
        isSystemRequest: false,
      };
      const tier = await getSubscriptionTier(ctx as any);
      expect(tier).toBe('free');
    });

    it('returns "premium" for admin users without querying the DB', async () => {
      const ctx = makeContext(adminUser, 'free');
      const selectSpy = jest.spyOn(ctx.db, 'select');
      const tier = await getSubscriptionTier(ctx as any);
      expect(tier).toBe('premium');
      expect(selectSpy).not.toHaveBeenCalled();
    });

    it('returns "free" for admin with impersonatedTier=free', async () => {
      const ctx = makeContext(adminUser, 'free', 'free');
      const tier = await getSubscriptionTier(ctx as any);
      expect(tier).toBe('free');
    });

    it('queries DB for admin with impersonatedTier=free', async () => {
      const ctx = makeContext(adminUser, 'free', 'free');
      const selectSpy = jest.spyOn(ctx.db, 'select');
      await getSubscriptionTier(ctx as any);
      expect(selectSpy).toHaveBeenCalled();
    });

    it('throws AuthenticationError when user is not authenticated', async () => {
      const ctx = makeContext(null, 'free');
      await expect(getSubscriptionTier(ctx as any)).rejects.toThrow();
      await expect(getSubscriptionTier(ctx as any)).rejects.toMatchObject({
        extensions: { code: 'UNAUTHENTICATED' },
      });
    });
  });

  describe('requirePremium', () => {
    it('resolves without throwing for premium users', async () => {
      const ctx = makeContext(premiumUser, 'premium');
      await expect(requirePremium(ctx as any)).resolves.toBeUndefined();
    });

    it('throws PREMIUM_REQUIRED for free users', async () => {
      const ctx = makeContext(freeUser, 'free');
      await expect(requirePremium(ctx as any)).rejects.toMatchObject({
        extensions: { code: 'PREMIUM_REQUIRED' },
      });
    });

    it('includes the feature description in the error message', async () => {
      const ctx = makeContext(freeUser, 'free');
      await expect(
        requirePremium(ctx as any, 'Player comparison'),
      ).rejects.toMatchObject({
        message: expect.stringContaining('Player comparison'),
        extensions: { code: 'PREMIUM_REQUIRED' },
      });
    });

    it('throws AuthenticationError for unauthenticated users', async () => {
      const ctx = makeContext(null, 'free');
      await expect(requirePremium(ctx as any)).rejects.toMatchObject({
        extensions: { code: 'UNAUTHENTICATED' },
      });
    });

    it('resolves without throwing for admin users on free tier', async () => {
      const ctx = makeContext(adminUser, 'free');
      const selectSpy = jest.spyOn(ctx.db, 'select');
      await expect(requirePremium(ctx as any)).resolves.toBeUndefined();
      expect(selectSpy).not.toHaveBeenCalled();
    });

    it('throws PREMIUM_REQUIRED for admin with impersonatedTier=free', async () => {
      const ctx = makeContext(adminUser, 'free', 'free');
      await expect(requirePremium(ctx as any)).rejects.toMatchObject({
        extensions: { code: 'PREMIUM_REQUIRED' },
      });
    });
  });

  describe('authorized() with premium flag', () => {
    it('calls the handler when user is premium', async () => {
      const ctx = makeContext(premiumUser, 'premium');
      const handler = jest.fn().mockResolvedValue('result');
      const wrapped = authorized({ premium: true }, handler);
      const result = await wrapped(null, {}, ctx as any);
      expect(result).toBe('result');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('throws PREMIUM_REQUIRED when user is free tier', async () => {
      const ctx = makeContext(freeUser, 'free');
      const handler = jest.fn().mockResolvedValue('result');
      const wrapped = authorized({ premium: true }, handler);
      await expect(wrapped(null, {}, ctx as any)).rejects.toMatchObject({
        extensions: { code: 'PREMIUM_REQUIRED' },
      });
      expect(handler).not.toHaveBeenCalled();
    });

    it('does not check subscription tier when premium flag is absent', async () => {
      // makeContext sets up the DB mock — ensure it is NOT called when premium is not required
      const ctx = makeContext(freeUser, 'free');
      const selectSpy = jest.spyOn(ctx.db, 'select');
      const handler = jest.fn().mockResolvedValue('result');
      const wrapped = authorized({}, handler);
      await wrapped(null, {}, ctx as any);
      expect(selectSpy).not.toHaveBeenCalled();
    });
  });

  // LS-8643 — hasEntitlement now enforces the token's Stripe-minted entitlement
  // claim (ctx.user.entitlements) and force-expires tokens issued before the
  // user's last entitlement change (token iat < entitlements_updated_at →
  // ENTITLEMENTS_STALE). It no longer fans a cached tier out through a code-side
  // tier→entitlement map. The single DB read is the memoized gating-row lookup
  // (subscription_tier + entitlements_updated_at), keyed on the Context.
  describe('hasEntitlement — token claim + staleness (LS-8643)', () => {
    const NOW = 1_700_000_000_000; // fixed epoch ms
    const MARKER = new Date(NOW);
    const FRESH_IAT = Math.floor(NOW / 1000) + 60; // token minted after marker
    const STALE_IAT = Math.floor(NOW / 1000) - 60; // token minted before marker

    // Build a context whose gating-row read yields the given marker (or no row
    // when entitlementsUpdatedAt === null), letting each test set the token's
    // entitlement claim + iat on context.user.
    function makeGatingContext(
      user: Record<string, unknown> | null,
      opts: {
        entitlementsUpdatedAt?: Date | null;
        impersonatedTier?: 'free';
      } = {},
    ) {
      const row =
        opts.entitlementsUpdatedAt === null
          ? []
          : [
              {
                tier: 'free',
                entitlementsUpdatedAt: opts.entitlementsUpdatedAt ?? MARKER,
              },
            ];
      const mockDb = {
        select: jest.fn(() => ({
          from: jest.fn(() => ({
            where: jest.fn(() => ({
              limit: jest.fn().mockResolvedValue(row),
            })),
          })),
        })),
      };
      return {
        user,
        db: mockDb,
        loaders: {},
        isSystemRequest: false,
        impersonatedTier: opts.impersonatedTier,
      };
    }

    it('returns true when the key is in the token claim and the token is fresh', async () => {
      const ctx = makeGatingContext({
        id: 1,
        isAdmin: false,
        entitlements: ['unlimited_leagues'],
        iat: FRESH_IAT,
      });
      await expect(
        hasEntitlement(ctx as any, 'unlimited_leagues' as any),
      ).resolves.toBe(true);
    });

    it('returns false when the key is NOT in the token claim (fresh token)', async () => {
      const ctx = makeGatingContext({
        id: 1,
        isAdmin: false,
        entitlements: ['salary_cap_leagues'],
        iat: FRESH_IAT,
      });
      await expect(
        hasEntitlement(ctx as any, 'unlimited_leagues' as any),
      ).resolves.toBe(false);
    });

    it('gates a free user with an empty claim out of every feature', async () => {
      const ctx = makeGatingContext({
        id: 1,
        isAdmin: false,
        entitlements: [],
        iat: FRESH_IAT,
      });
      await expect(
        hasEntitlement(ctx as any, 'unlimited_leagues' as any),
      ).resolves.toBe(false);
    });

    it('throws ENTITLEMENTS_STALE when the token iat predates the marker', async () => {
      const ctx = makeGatingContext({
        id: 1,
        isAdmin: false,
        // The claim WOULD grant, but the token predates the last change.
        entitlements: ['unlimited_leagues'],
        iat: STALE_IAT,
      });
      await expect(
        hasEntitlement(ctx as any, 'unlimited_leagues' as any),
      ).rejects.toMatchObject({ extensions: { code: 'ENTITLEMENTS_STALE' } });
    });

    it('treats a token with no iat as stale (fail-safe)', async () => {
      const ctx = makeGatingContext({
        id: 1,
        isAdmin: false,
        entitlements: ['unlimited_leagues'],
        // no iat claim
      });
      await expect(
        hasEntitlement(ctx as any, 'unlimited_leagues' as any),
      ).rejects.toMatchObject({ extensions: { code: 'ENTITLEMENTS_STALE' } });
    });

    it('skips the staleness check when the user has no marker row', async () => {
      const ctx = makeGatingContext(
        {
          id: 1,
          isAdmin: false,
          entitlements: ['unlimited_leagues'],
          iat: STALE_IAT, // would be stale, but there is no marker to compare
        },
        { entitlementsUpdatedAt: null },
      );
      await expect(
        hasEntitlement(ctx as any, 'unlimited_leagues' as any),
      ).resolves.toBe(true);
    });

    it('admins are all-entitled without reading the claim or marker', async () => {
      const ctx = makeGatingContext({ id: 3, isAdmin: true });
      const selectSpy = jest.spyOn(ctx.db, 'select');
      await expect(
        hasEntitlement(ctx as any, 'salary_cap_leagues' as any),
      ).resolves.toBe(true);
      expect(selectSpy).not.toHaveBeenCalled();
    });

    it('admin impersonating the free tier falls back to the claim path', async () => {
      const ctx = makeGatingContext(
        { id: 3, isAdmin: true, entitlements: [], iat: FRESH_IAT },
        { impersonatedTier: 'free' },
      );
      await expect(
        hasEntitlement(ctx as any, 'unlimited_leagues' as any),
      ).resolves.toBe(false);
    });

    it('memoizes the gating-row read across concurrent calls in one request', async () => {
      const ctx = makeGatingContext({
        id: 1,
        isAdmin: false,
        entitlements: ['unlimited_leagues', 'salary_cap_leagues'],
        iat: FRESH_IAT,
      });
      const selectSpy = jest.spyOn(ctx.db, 'select');
      await Promise.all([
        hasEntitlement(ctx as any, 'unlimited_leagues' as any),
        hasEntitlement(ctx as any, 'salary_cap_leagues' as any),
      ]);
      expect(selectSpy).toHaveBeenCalledTimes(1);
    });
  });
});

export {};
