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

jest.mock('@legacy-sports/db-client', () => ({
  createDatabaseService: jest.fn(),
  InternalSchema: {
    usersInAppInternal: {
      id: 'app_internal.users.id',
      subscriptionTier: 'app_internal.users.subscription_tier',
    },
  },
  PublicDb: {},
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
}));

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
    return { user, db: mockDb, loaders: {}, isSystemRequest: false };
  }

  beforeEach(async () => {
    jest.resetModules();
    // Re-import after mocks to ensure mocks are applied
    const auth = await import('./authorization');
    getSubscriptionTier = auth.getSubscriptionTier;
    requirePremium = auth.requirePremium;
    authorized = auth.authorized;
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
});
