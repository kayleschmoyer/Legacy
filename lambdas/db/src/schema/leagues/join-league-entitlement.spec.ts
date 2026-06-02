/**
 * Unit tests for the free-tier active-league cap on the three join mutations
 * (`joinLeagueByCode`, `joinLeague`, `joinPublicLeague`) — LS-5172.
 *
 * Before LS-5172 the `unlimited_leagues` entitlement was enforced only on
 * league creation/renewal, so a free user already at their cap could join
 * unlimited additional leagues via invite code or public join. These tests
 * verify the new `requireJoinLeagueCapacity` guard at the resolver level
 * without a live Postgres connection, mirroring the harness used by
 * `renew-league.spec.ts`.
 *
 * The guard runs after the resolver confirms the user is not already a member
 * and before the atomic team claim. When the user is below the cap (or holds
 * the `unlimited_leagues` entitlement) the resolver proceeds to the claim,
 * which — with no unassigned team in the mocked DB — reports the league as
 * full. The "league is full" outcome therefore proves the entitlement gate was
 * passed rather than throwing the premium error.
 */
import type { GraphQLSchema } from 'graphql';

describe('join mutations — free-tier active-league cap (LS-5172)', () => {
  let schema: GraphQLSchema;

  /**
   * Build a drizzle-style chainable proxy that:
   *  - returns itself from every chained call (select/from/where/innerJoin/limit/…)
   *  - resolves to the next queued value whenever awaited (one per read)
   *  - supports `transaction(cb)` by invoking the callback with the proxy
   *  - returns an empty `execute()` result so the team-claim transaction reports
   *    a full league (used to prove the cap gate was passed on the allowed path)
   */
  function makeChainableDb(readQueue: unknown[]): Record<string, unknown> {
    const handler: ProxyHandler<object> = {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void) =>
            resolve(readQueue.shift() ?? []);
        }
        if (prop === 'transaction') {
          return async (cb: (tx: unknown) => unknown) => cb(proxy);
        }
        if (prop === 'execute') {
          // Raw SELECT ... FOR UPDATE in claimUnassignedTeamForUser. No rows →
          // claim reports a full league.
          return async () => ({ rows: [] as unknown[] });
        }
        // Any other method is chainable.
        return () => proxy;
      },
    };
    const proxy: Record<string, unknown> = new Proxy({}, handler) as Record<
      string,
      unknown
    >;
    return proxy;
  }

  beforeEach(async () => {
    jest.resetModules();

    jest.doMock('@legacy-sports/logging', () => ({
      LOGGER: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    }));
    // ENTITLEMENTS / tierHasEntitlement now live in @legacy-sports/utils
    // (LS-5229) and are re-exported by ../entitlements, so keep the real
    // exports and only override getDbOptions.
    jest.doMock('@legacy-sports/utils', () => ({
      ...jest.requireActual('@legacy-sports/utils'),
      getDbOptions: jest.fn(() => ({})),
    }));
    jest.doMock('@legacy-sports/utils/node', () => ({
      getDbOptions: jest.fn(() => ({})),
    }));

    const sentinelTable = (name: string) =>
      name as unknown as Record<string, unknown>;

    jest.doMock('@legacy-sports/db-client', () => ({
      createDatabaseService: jest.fn(),
      runWithPublicClient: jest.fn(),
      createLeagueService: jest.fn(() => ({ createLeague: jest.fn() })),
      createDraftForLeague: jest.fn(),
      DraftService: jest.fn().mockImplementation(() => ({
        startDraft: jest.fn(),
        getDraftStatus: jest.fn(),
      })),
      createBadgeService: jest.fn(() => ({
        getUserBadges: jest.fn().mockResolvedValue([]),
        getTeamBadges: jest.fn().mockResolvedValue([]),
        getUserBadgeProgress: jest.fn().mockResolvedValue([]),
        evaluateDraftBadges: jest.fn().mockResolvedValue([]),
        evaluateMatchupBadges: jest.fn().mockResolvedValue([]),
        awardLeagueChampion: jest.fn().mockResolvedValue(undefined),
        awardPlayoffAppearances: jest.fn().mockResolvedValue(undefined),
      })),
      PublicSchema: {
        leagues: sentinelTable('leagues'),
        teams: sentinelTable('teams'),
        leagueMembers: sentinelTable('leagueMembers'),
        leaguePosition: sentinelTable('leaguePosition'),
        teamMembers: sentinelTable('teamMembers'),
        leagueMessages: sentinelTable('leagueMessages'),
      },
      InternalSchema: {
        usersInAppInternal: sentinelTable('usersInAppInternal'),
      },
    }));

    // Dynamic import (not require) so the module loads against the mocks
    // registered above while keeping the file free of lint suppressions.
    const schemaModule = (await import('../../schema')) as {
      schema: GraphQLSchema;
    };
    schema = schemaModule.schema;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function resolverFor(name: string) {
    const field = schema.getMutationType()?.getFields()[name];
    if (!field?.resolve) throw new Error(`${name} resolver not found`);
    return field.resolve.bind(field);
  }

  // ── joinLeagueByCode ──────────────────────────────────────────────────────
  describe('joinLeagueByCode', () => {
    // Reads in order: league lookup, existing-membership, subscription tier,
    // active-league count.
    function setup(tier: 'free' | 'premium', leagueCount: number) {
      const readQueue: unknown[] = [
        [{ id: 7, name: 'Test League', owner: 99, faabBudgetDefault: 100 }],
        [], // not already a member
        [{ tier }],
        [{ leagueCount }],
      ];
      const db = makeChainableDb(readQueue);
      return {
        resolve: resolverFor('joinLeagueByCode'),
        context: { user: { id: 1, isAdmin: false }, db },
      };
    }

    it('blocks a free user already in 3 active leagues', async () => {
      const { resolve, context } = setup('free', 3);
      await expect(
        resolve(
          {},
          { inviteCode: 'ABC123', teamName: 'My Team' },
          context,
          undefined as never,
        ),
      ).rejects.toThrow(/3-league limit/);
    });

    it('allows a free user below the cap to proceed past the gate', async () => {
      const { resolve, context } = setup('free', 2);
      // Past the gate → claim runs → no unassigned team → reported full.
      await expect(
        resolve(
          {},
          { inviteCode: 'ABC123', teamName: 'My Team' },
          context,
          undefined as never,
        ),
      ).rejects.toThrow(/league is full/i);
    });

    it('never blocks a premium (unlimited_leagues) user', async () => {
      // No count read queued — the entitlement short-circuits before it.
      const readQueue: unknown[] = [
        [{ id: 7, name: 'Test League', owner: 99, faabBudgetDefault: 100 }],
        [],
        [{ tier: 'premium' }],
      ];
      const db = makeChainableDb(readQueue);
      const resolve = resolverFor('joinLeagueByCode');
      const context = { user: { id: 1, isAdmin: false }, db };
      await expect(
        resolve(
          {},
          { inviteCode: 'ABC123', teamName: 'My Team' },
          context,
          undefined as never,
        ),
      ).rejects.toThrow(/league is full/i);
    });
  });

  // ── joinLeague ────────────────────────────────────────────────────────────
  describe('joinLeague', () => {
    function setup(tier: 'free' | 'premium', leagueCount: number) {
      const readQueue: unknown[] = [
        [
          {
            id: 7,
            name: 'Test League',
            maxRosterSize: 25,
            faabBudgetDefault: 100,
          },
        ],
        [], // not already a member
        [{ tier }],
        [{ leagueCount }],
      ];
      const db = makeChainableDb(readQueue);
      return {
        resolve: resolverFor('joinLeague'),
        context: { user: { id: 1, isAdmin: false }, db },
      };
    }

    it('blocks a free user already in 3 active leagues', async () => {
      const { resolve, context } = setup('free', 3);
      await expect(
        resolve(
          {},
          { inviteCode: 'ABC123', teamName: 'My Team' },
          context,
          undefined as never,
        ),
      ).rejects.toThrow(/3-league limit/);
    });

    it('allows a free user below the cap to proceed past the gate', async () => {
      const { resolve, context } = setup('free', 2);
      // joinLeague returns a payload (does not throw) when the league is full.
      const result = (await resolve(
        {},
        { inviteCode: 'ABC123', teamName: 'My Team' },
        context,
        undefined as never,
      )) as { success: boolean; message: string };
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/full/i);
    });

    it('never blocks a premium (unlimited_leagues) user', async () => {
      // Premium short-circuits before the count query; resolver proceeds to the
      // claim and reports the league full rather than blocking on the cap.
      const { resolve, context } = setup('premium', 0);
      const result = (await resolve(
        {},
        { inviteCode: 'ABC123', teamName: 'My Team' },
        context,
        undefined as never,
      )) as { success: boolean; message: string };
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/full/i);
    });
  });

  // ── joinPublicLeague ──────────────────────────────────────────────────────
  describe('joinPublicLeague', () => {
    function setup(tier: 'free' | 'premium', leagueCount: number) {
      const readQueue: unknown[] = [
        [
          {
            id: 7,
            name: 'Test League',
            isPublic: true,
            faabBudgetDefault: 100,
          },
        ],
        [], // not already a member
        [{ tier }],
        [{ leagueCount }],
      ];
      const db = makeChainableDb(readQueue);
      return {
        resolve: resolverFor('joinPublicLeague'),
        context: { user: { id: 1, isAdmin: false }, db },
      };
    }

    it('blocks a free user already in 3 active leagues', async () => {
      const { resolve, context } = setup('free', 3);
      await expect(
        resolve(
          {},
          { leagueId: 7, teamName: 'My Team' },
          context,
          undefined as never,
        ),
      ).rejects.toThrow(/3-league limit/);
    });

    it('allows a free user below the cap to proceed past the gate', async () => {
      const { resolve, context } = setup('free', 2);
      await expect(
        resolve(
          {},
          { leagueId: 7, teamName: 'My Team' },
          context,
          undefined as never,
        ),
      ).rejects.toThrow(/league is full/i);
    });

    it('never blocks a premium (unlimited_leagues) user', async () => {
      // Premium short-circuits before the count query; resolver proceeds to the
      // claim and reports the league full rather than blocking on the cap.
      const { resolve, context } = setup('premium', 0);
      await expect(
        resolve(
          {},
          { leagueId: 7, teamName: 'My Team' },
          context,
          undefined as never,
        ),
      ).rejects.toThrow(/league is full/i);
    });
  });
});
