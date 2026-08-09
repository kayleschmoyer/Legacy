import type { GraphQLSchema } from 'graphql';
import { ENTITLEMENTS } from '@legacy-sports/utils';

describe('myEntitlements query', () => {
  let schema: GraphQLSchema;
  let mockDb: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    limit: jest.Mock;
  };

  /** Point the chained drizzle mock at a specific gating row result. */
  function mockGatingRow(row: Record<string, unknown> | undefined): void {
    mockDb.limit = jest.fn().mockResolvedValue(row ? [row] : []);
    mockDb.where = jest.fn(() => ({ limit: mockDb.limit }));
    mockDb.from = jest.fn(() => ({ where: mockDb.where }));
    mockDb.select = jest.fn(() => ({ from: mockDb.from }));
  }

  beforeEach(() => {
    jest.resetModules();

    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    };

    jest.doMock('@legacy-sports/utils/node', () => ({
      ...jest.requireActual('@legacy-sports/utils/node'),
      getDbOptions: jest.fn(() => ({})),
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
      createDatabaseService: jest.fn(() => ({
        users: {
          getUserById: jest.fn(),
          getUserByEmail: jest.fn(),
          getUsers: jest.fn().mockResolvedValue([]),
          countUsers: jest.fn().mockResolvedValue(0),
          searchUsers: jest.fn().mockResolvedValue([]),
          getUserIdentities: jest.fn().mockResolvedValue([]),
          updateUserAccessLevel: jest.fn(),
          updateUsername: jest.fn(),
          updateUserAvatar: jest.fn(),
          updateUserTheme: jest.fn(),
          deleteLeakedTestUsers: jest.fn(),
          setCanonicalEmail: jest.fn(),
        },
        statistics: { getOnThisDay: jest.fn(), getOnThisDayEvents: jest.fn() },
        badges: {
          getUserBadges: jest.fn().mockResolvedValue([]),
          getTeamBadges: jest.fn().mockResolvedValue([]),
          getUserBadgeProgress: jest.fn().mockResolvedValue([]),
          evaluateDraftBadges: jest.fn().mockResolvedValue([]),
          evaluateMatchupBadges: jest.fn().mockResolvedValue([]),
          awardLeagueChampion: jest.fn().mockResolvedValue(undefined),
          awardPlayoffAppearances: jest.fn().mockResolvedValue(undefined),
        },
      })),
      runWithPublicClient: jest.fn(),
      createLeagueService: jest.fn(() => ({ createLeague: jest.fn() })),
      createDraftForLeague: jest.fn(),
      DraftService: jest.fn().mockImplementation(() => ({
        startDraft: jest.fn(),
        getDraftStatus: jest.fn(),
      })),
      createBadgeService: jest.fn(() => ({
        getUserBadges: jest.fn().mockResolvedValue([]),
      })),
      PublicSchema: {
        leagues: {
          id: 'id',
          name: 'name',
          currentWeek: 'w',
          currentMatchup: 'cm',
        },
        teams: { id: 'id', name: 'name', leagueId: 'leagueId' },
        leagueMembers: {
          leagueId: 'leagueId',
          userId: 'userId',
          teamId: 'teamId',
          permissionLevel: 'permissionLevel',
        },
        teamMembers: {
          id: 'id',
          teamId: 'teamId',
          leagueId: 'leagueId',
          playerId: 'playerId',
          positionId: 'positionId',
        },
        players: {
          id: 'id',
          firstName: 'firstName',
          lastName: 'lastName',
          brefId: 'brefId',
        },
        matchups: {
          id: 'id',
          leagueId: 'leagueId',
          weekNumber: 'weekNumber',
          status: 'status',
          team1Id: 'team1Id',
          team2Id: 'team2Id',
        },
        matchupPlayers: {
          id: 'id',
          matchupId: 'matchupId',
          playerId: 'playerId',
          teamId: 'teamId',
        },
        leagueWeekPlayerSeasons: {
          playerId: 'playerId',
          season: 'season',
          leagueId: 'leagueId',
          weekNumber: 'weekNumber',
        },
        leagueSeasonAwards: {
          id: 'id',
          leagueId: 'leagueId',
          season: 'season',
          playerId: 'playerId',
          awardType: 'awardType',
          notes: 'notes',
          createdAt: 'createdAt',
          updatedAt: 'updatedAt',
        },
        leagueActivityLog: {
          id: 'id',
          leagueId: 'leagueId',
          eventType: 'eventType',
          occurredAt: 'occurredAt',
        },
        leagueActivityEventType: { enumValues: [] },
      },
      InternalSchema: {
        usersInAppInternal: {
          id: 'app_internal.users.id',
          subscriptionTier: 'app_internal.users.subscription_tier',
          entitlementsUpdatedAt: 'app_internal.users.entitlements_updated_at',
        },
      },
      PublicDb: {},
    }));

    jest.doMock('../services/standings-service', () => ({
      StandingsService: {
        getHeadToHead: jest.fn(),
        getSeasonSummary: jest.fn(),
        getStandings: jest.fn(),
        getMatchupStats: jest.fn(),
      },
    }));

    const schemaModule = require('../schema') as { schema: GraphQLSchema };
    schema = schemaModule.schema;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function getResolver() {
    const queryType = schema.getQueryType();
    const field = queryType?.getFields().myEntitlements;
    if (!field?.resolve) {
      throw new Error('myEntitlements resolver not found');
    }
    return field.resolve.bind(field);
  }

  it('throws UNAUTHENTICATED when user is null', async () => {
    const resolve = getResolver();
    await expect(
      resolve({}, {}, { user: null, db: mockDb }, undefined as never),
    ).rejects.toThrow(/Authentication required|UNAUTHENTICATED/i);
  });

  it('returns the full catalog for admin users without a DB call', async () => {
    const resolve = getResolver();
    const adminContext = { user: { id: 1, isAdmin: true }, db: mockDb };
    const result = await resolve({}, {}, adminContext, undefined as never);
    expect(result).toEqual(Object.values(ENTITLEMENTS));
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("returns a premium user's token entitlement claim", async () => {
    // No marker row → the token claim is trusted as-is (nothing to compare iat against).
    mockGatingRow(undefined);

    const resolve = getResolver();
    const entitlements = ['advanced_search_filters', 'player_comparison'];
    const premiumContext = {
      user: { id: 2, isAdmin: false, entitlements, iat: 1_700_000_000 },
      db: mockDb,
    };
    const result = await resolve({}, {}, premiumContext, undefined as never);
    expect(result).toEqual(entitlements);
  });

  it('returns an empty set for a free user (no claim)', async () => {
    mockGatingRow(undefined);

    const resolve = getResolver();
    const freeContext = {
      user: { id: 3, isAdmin: false, entitlements: [], iat: 1_700_000_000 },
      db: mockDb,
    };
    const result = await resolve({}, {}, freeContext, undefined as never);
    expect(result).toEqual([]);
  });

  it('throws ENTITLEMENTS_STALE when the token iat predates the marker', async () => {
    // Marker is newer than the token iat → the claim can no longer be trusted.
    const iatSeconds = 1_700_000_000;
    mockGatingRow({
      tier: 'premium',
      entitlementsUpdatedAt: new Date((iatSeconds + 60) * 1000),
    });

    const resolve = getResolver();
    const staleContext = {
      user: {
        id: 4,
        isAdmin: false,
        entitlements: ['advanced_search_filters'],
        iat: iatSeconds,
      },
      db: mockDb,
    };
    await expect(
      resolve({}, {}, staleContext, undefined as never),
    ).rejects.toThrow(/ENTITLEMENTS_STALE|refreshed/i);
  });
});
