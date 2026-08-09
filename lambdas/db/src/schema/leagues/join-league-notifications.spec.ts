/**
 * Tests that push notifications are sent to existing league members when a
 * new user joins via any of the three join mutations (LS-7971).
 *
 * Each test drives the mutation to a successful join by:
 *  - returning a valid league from the DB
 *  - returning an available team row from the raw `FOR UPDATE` claim query
 *  - returning the claimed team from the post-claim SELECT
 *
 * It then asserts that `notificationPublisher.publishToMany` is called with
 * every existing member id (excluding the joiner) and the expected payload.
 */
import type { GraphQLSchema } from 'graphql';
import { ENTITLEMENTS } from '@legacy-sports/utils';

describe('join mutations — push notifications on join (LS-7971)', () => {
  let schema: GraphQLSchema;

  /**
   * A chainable DB proxy that:
   *  - dequeues from `readQueue` whenever a chained call is awaited
   *  - dequeues from `executeQueue` whenever `.execute()` is called
   *  - supports `transaction(cb)` by passing itself as the tx
   */
  function makeDb(
    readQueue: unknown[],
    executeQueue: unknown[],
  ): Record<string, unknown> {
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
          return async () => executeQueue.shift() ?? { rows: [] };
        }
        return () => proxy;
      },
    };
    const proxy: Record<string, unknown> = new Proxy({}, handler);
    return proxy;
  }

  beforeEach(async () => {
    jest.resetModules();

    jest.doMock('@legacy-sports/logging', () => ({
      LOGGER: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      },
    }));
    jest.doMock('@legacy-sports/utils', () => ({
      ...jest.requireActual('@legacy-sports/utils'),
      getDbOptions: jest.fn(() => ({})),
    }));
    jest.doMock('@legacy-sports/utils/node', () => ({
      ...jest.requireActual('@legacy-sports/utils/node'),
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

  /**
   * DB read sequence for a successful join (premium user bypasses the count
   * check, so no 4th leagueCount read is needed):
   *
   *  readQueue:
   *   [0] league row
   *   [1] existing-membership check → []
   *   [2] tier row → [{ tier: 'premium' }]  (hasEntitlement short-circuits)
   *   [3] existing-member check for claimed team inside tx → []
   *   [4] team update inside tx → undefined
   *   [5] leagueMembers insert inside tx → undefined
   *   [6] post-claim team SELECT
   *   [7] chat message insert RETURNING
   *   [8] existing league members for push notification
   *
   *  executeQueue:
   *   [0] FOR UPDATE raw query → { rows: [{ id: 42 }] }
   */
  function makeSuccessDb(
    leagueRow: Record<string, unknown>,
    teamRow: Record<string, unknown>,
  ) {
    const readQueue: unknown[] = [
      [leagueRow],
      [],
      [{ tier: 'premium' }],
      [],
      undefined,
      undefined,
      [teamRow],
      [{ id: 1, timestamp: '2024-01-01T00:00:00.000Z' }],
      [{ userId: 2 }, { userId: 3 }],
    ];
    const executeQueue: unknown[] = [{ rows: [{ id: 42 }] }];
    return makeDb(readQueue, executeQueue);
  }

  // ── joinLeagueByCode ────────────────────────────────────────────────────────

  describe('joinLeagueByCode', () => {
    it('calls publishToMany with existing member ids on successful join', async () => {
      const publishToMany = jest.fn().mockResolvedValue(undefined);
      const db = makeSuccessDb(
        {
          id: 7,
          name: 'Test League',
          owner: 99,
          maxRosterSize: 25,
          faabBudgetDefault: 100,
        },
        {
          id: 42,
          name: 'My Team',
          leagueId: 7,
          divisionId: null,
          createdAt: null,
          updatedAt: null,
          waiverOrder: null,
          faabBudget: 100,
          logoUrl: null,
          primaryColor: null,
          secondaryColor: null,
          isLocked: false,
          avatarUrl: null,
          bannerUrl: null,
        },
      );
      const context = {
        user: {
          id: 1,
          username: 'alice',
          isAdmin: false,
          entitlements: [ENTITLEMENTS.unlimited_leagues],
        },
        db,
        notificationPublisher: { publishToMany },
      };

      await resolverFor('joinLeagueByCode')(
        {},
        { inviteCode: 'ABC123', teamName: 'My Team' },
        context,
        undefined as never,
      );

      expect(publishToMany).toHaveBeenCalledTimes(1);
      expect(publishToMany).toHaveBeenCalledWith(
        [2, 3],
        expect.objectContaining({
          notificationType: 'LEAGUE_MEMBER_JOINED',
          title: 'New Member Joined',
          body: 'alice joined your league!',
          data: { leagueId: 7 },
        }),
      );
    });

    it('skips publishToMany when notificationPublisher is absent', async () => {
      const db = makeSuccessDb(
        {
          id: 7,
          name: 'Test League',
          owner: 99,
          maxRosterSize: 25,
          faabBudgetDefault: 100,
        },
        {
          id: 42,
          name: 'My Team',
          leagueId: 7,
          divisionId: null,
          createdAt: null,
          updatedAt: null,
          waiverOrder: null,
          faabBudget: 100,
          logoUrl: null,
          primaryColor: null,
          secondaryColor: null,
          isLocked: false,
          avatarUrl: null,
          bannerUrl: null,
        },
      );
      const context = {
        user: {
          id: 1,
          username: 'alice',
          isAdmin: false,
          entitlements: [ENTITLEMENTS.unlimited_leagues],
        },
        db,
      };

      await expect(
        resolverFor('joinLeagueByCode')(
          {},
          { inviteCode: 'ABC123', teamName: 'My Team' },
          context,
          undefined as never,
        ),
      ).resolves.toBeDefined();
    });
  });

  // ── joinLeague ──────────────────────────────────────────────────────────────

  describe('joinLeague', () => {
    it('calls publishToMany with existing member ids on successful join', async () => {
      const publishToMany = jest.fn().mockResolvedValue(undefined);
      const db = makeSuccessDb(
        {
          id: 7,
          name: 'Test League',
          maxRosterSize: 25,
          faabBudgetDefault: 100,
        },
        {
          id: 42,
          name: 'My Team',
          leagueId: 7,
          divisionId: null,
          createdAt: null,
          updatedAt: null,
          waiverOrder: null,
          faabBudget: 100,
          logoUrl: null,
          primaryColor: null,
          secondaryColor: null,
          isLocked: false,
          avatarUrl: null,
          bannerUrl: null,
        },
      );
      const context = {
        user: {
          id: 1,
          username: 'bob',
          isAdmin: false,
          entitlements: [ENTITLEMENTS.unlimited_leagues],
        },
        db,
        notificationPublisher: { publishToMany },
      };

      await resolverFor('joinLeague')(
        {},
        { inviteCode: 'XYZ456', teamName: 'My Team' },
        context,
        undefined as never,
      );

      expect(publishToMany).toHaveBeenCalledTimes(1);
      expect(publishToMany).toHaveBeenCalledWith(
        [2, 3],
        expect.objectContaining({
          notificationType: 'LEAGUE_MEMBER_JOINED',
          title: 'New Member Joined',
          body: 'bob joined your league!',
          data: { leagueId: 7 },
        }),
      );
    });

    it('skips publishToMany when notificationPublisher is absent', async () => {
      const db = makeSuccessDb(
        {
          id: 7,
          name: 'Test League',
          maxRosterSize: 25,
          faabBudgetDefault: 100,
        },
        {
          id: 42,
          name: 'My Team',
          leagueId: 7,
          divisionId: null,
          createdAt: null,
          updatedAt: null,
          waiverOrder: null,
          faabBudget: 100,
          logoUrl: null,
          primaryColor: null,
          secondaryColor: null,
          isLocked: false,
          avatarUrl: null,
          bannerUrl: null,
        },
      );
      const context = {
        user: {
          id: 1,
          username: 'bob',
          isAdmin: false,
          entitlements: [ENTITLEMENTS.unlimited_leagues],
        },
        db,
      };

      const result = (await resolverFor('joinLeague')(
        {},
        { inviteCode: 'XYZ456', teamName: 'My Team' },
        context,
        undefined as never,
      )) as { success: boolean };
      expect(result.success).toBe(true);
    });
  });

  // ── joinPublicLeague ────────────────────────────────────────────────────────

  describe('joinPublicLeague', () => {
    it('calls publishToMany with existing member ids on successful join', async () => {
      const publishToMany = jest.fn().mockResolvedValue(undefined);
      const db = makeSuccessDb(
        { id: 7, name: 'Test League', isPublic: true, faabBudgetDefault: 100 },
        { id: 42, leagueId: 7 },
      );
      const context = {
        user: {
          id: 1,
          username: 'carol',
          isAdmin: false,
          entitlements: [ENTITLEMENTS.unlimited_leagues],
        },
        db,
        notificationPublisher: { publishToMany },
      };

      await resolverFor('joinPublicLeague')(
        {},
        { leagueId: 7, teamName: 'My Team' },
        context,
        undefined as never,
      );

      expect(publishToMany).toHaveBeenCalledTimes(1);
      expect(publishToMany).toHaveBeenCalledWith(
        [2, 3],
        expect.objectContaining({
          notificationType: 'LEAGUE_MEMBER_JOINED',
          title: 'New Member Joined',
          body: 'carol joined your league!',
          data: { leagueId: 7 },
        }),
      );
    });

    it('skips publishToMany when notificationPublisher is absent', async () => {
      const db = makeSuccessDb(
        { id: 7, name: 'Test League', isPublic: true, faabBudgetDefault: 100 },
        { id: 42, leagueId: 7 },
      );
      const context = {
        user: {
          id: 1,
          username: 'carol',
          isAdmin: false,
          entitlements: [ENTITLEMENTS.unlimited_leagues],
        },
        db,
      };

      const result = (await resolverFor('joinPublicLeague')(
        {},
        { leagueId: 7, teamName: 'My Team' },
        context,
        undefined as never,
      )) as { success: boolean };
      expect(result.success).toBe(true);
    });
  });
});
