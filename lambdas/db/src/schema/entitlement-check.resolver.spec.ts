import type { GraphQLSchema } from 'graphql';

describe('hasEntitlement query', () => {
  let schema: GraphQLSchema;
  let mockDb: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    limit: jest.Mock;
  };

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

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
    const schemaModule = require('../schema') as { schema: GraphQLSchema };
    schema = schemaModule.schema;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function getResolver() {
    const queryType = schema.getQueryType();
    const field = queryType?.getFields().hasEntitlement;
    if (!field?.resolve) {
      throw new Error('hasEntitlement resolver not found');
    }
    return field.resolve.bind(field);
  }

  it('throws UNAUTHENTICATED when user is null', async () => {
    const resolve = getResolver();
    await expect(
      resolve(
        {},
        { key: 'advanced_football_stats' },
        { user: null, db: mockDb },
        undefined as never,
      ),
    ).rejects.toThrow(/Authentication required|UNAUTHENTICATED/i);
  });

  it('returns true for admin users without a DB call', async () => {
    const resolve = getResolver();
    const adminContext = { user: { id: 1, isAdmin: true }, db: mockDb };
    const result = await resolve(
      {},
      { key: 'advanced_football_stats' },
      adminContext,
      undefined as never,
    );
    expect(result).toBe(true);
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('returns true for a premium user holding the entitlement', async () => {
    mockDb.limit = jest.fn().mockResolvedValue([{ tier: 'premium' }]);
    mockDb.where = jest.fn(() => ({ limit: mockDb.limit }));
    mockDb.from = jest.fn(() => ({ where: mockDb.where }));
    mockDb.select = jest.fn(() => ({ from: mockDb.from }));

    const resolve = getResolver();
    const premiumContext = { user: { id: 2, isAdmin: false }, db: mockDb };
    const result = await resolve(
      {},
      { key: 'advanced_football_stats' },
      premiumContext,
      undefined as never,
    );
    expect(result).toBe(true);
  });

  it('returns false for a free user', async () => {
    mockDb.limit = jest.fn().mockResolvedValue([{ tier: 'free' }]);
    mockDb.where = jest.fn(() => ({ limit: mockDb.limit }));
    mockDb.from = jest.fn(() => ({ where: mockDb.where }));
    mockDb.select = jest.fn(() => ({ from: mockDb.from }));

    const resolve = getResolver();
    const freeContext = { user: { id: 3, isAdmin: false }, db: mockDb };
    const result = await resolve(
      {},
      { key: 'advanced_football_stats' },
      freeContext,
      undefined as never,
    );
    expect(result).toBe(false);
  });

  it('returns false for an unknown entitlement key', async () => {
    mockDb.limit = jest.fn().mockResolvedValue([{ tier: 'premium' }]);
    mockDb.where = jest.fn(() => ({ limit: mockDb.limit }));
    mockDb.from = jest.fn(() => ({ where: mockDb.where }));
    mockDb.select = jest.fn(() => ({ from: mockDb.from }));

    const resolve = getResolver();
    const premiumContext = { user: { id: 2, isAdmin: false }, db: mockDb };
    const result = await resolve(
      {},
      { key: 'nonexistent_entitlement' },
      premiumContext,
      undefined as never,
    );
    expect(result).toBe(false);
  });
});
