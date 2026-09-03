import type { GraphQLSchema } from 'graphql';

describe('publicLeagues query — sport scoping (LS-7634)', () => {
  let schema: GraphQLSchema;
  let mockDb: {
    select: jest.Mock;
    from: jest.Mock;
    leftJoin: jest.Mock;
    where: jest.Mock;
    groupBy: jest.Mock;
    orderBy: jest.Mock;
    limit: jest.Mock;
    offset: jest.Mock;
    as: jest.Mock;
    then: jest.Mock;
  };
  let mockContext: {
    user: { id: number; isAdmin: boolean } | null;
    db: typeof mockDb;
  };
  let eqSpy: jest.Mock;

  beforeEach(() => {
    jest.resetModules();

    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      as: jest.fn().mockReturnThis(),
      then: jest.fn((resolve) => resolve([])),
    };

    jest.doMock('@legacy-sports/db-client', () => ({
      ...jest.requireActual('@legacy-sports/db-client'),
      createDatabaseService: jest.fn(() => ({})),
      runWithPublicClient: jest.fn(),
      createLeagueService: jest.fn(() => ({})),
      createDraftForLeague: jest.fn(),
      DraftService: jest.fn().mockImplementation(() => ({})),
      createBadgeService: jest.fn(() => ({})),
      PublicSchema: {
        leagues: {
          id: 'id',
          name: 'name',
          owner: 'owner',
          sport: 'sport',
          defensiveFormat: 'defensiveFormat',
          maxRosterSize: 'maxRosterSize',
          currentMatchup: 'currentMatchup',
          currentWeek: 'currentWeek',
          draftStatus: 'draftStatus',
          leaguePhase: 'leaguePhase',
          inviteCode: 'inviteCode',
          playerPool: 'playerPool',
          weekAdvanceStatus: 'weekAdvanceStatus',
          waiverType: 'waiverType',
          waiverEnabled: 'waiverEnabled',
          faabBudgetDefault: 'faabBudgetDefault',
          isPublic: 'isPublic',
          isMockDraft: 'isMockDraft',
          tierFrozenAt: 'tierFrozenAt',
        },
        leagueMembers: {
          leagueId: 'leagueId',
          userId: 'userId',
          teamId: 'teamId',
          permissionLevel: 'permissionLevel',
        },
        players: { id: 'id', sport: 'sport' },
        footballSeasonPassing: { playerId: 'playerId', season: 'season' },
        footballSeasonRushing: { playerId: 'playerId', season: 'season' },
        footballSeasonReceiving: { playerId: 'playerId', season: 'season' },
        footballSeasonKicking: { playerId: 'playerId', season: 'season' },
        footballSeasonDefense: { playerId: 'playerId', season: 'season' },
        footballSeasonDefenseIdp: { playerId: 'playerId', season: 'season' },
        careerFootballPassing: { playerId: 'playerId' },
        careerFootballRushing: { playerId: 'playerId' },
        careerFootballReceiving: { playerId: 'playerId' },
        careerFootballKicking: { playerId: 'playerId' },
        careerFootballDefense: { playerId: 'playerId' },
        careerFootballDefenseIdp: { playerId: 'playerId' },
        teams: { id: 'id', name: 'name', leagueId: 'leagueId' },
        teamMembers: {
          id: 'id',
          teamId: 'teamId',
          leagueId: 'leagueId',
          playerId: 'playerId',
          positionId: 'positionId',
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

    jest.doMock('@legacy-sports/utils/node', () => ({
      ...jest.requireActual('@legacy-sports/utils/node'),
      getDbOptions: jest.fn(() => ({})),
    }));

    jest.doMock('drizzle-orm', () => {
      const actual =
        jest.requireActual<typeof import('drizzle-orm')>('drizzle-orm');
      eqSpy = jest.fn(actual.eq);
      return { ...actual, eq: eqSpy };
    });

    const schemaModule = require('../../schema') as { schema: GraphQLSchema };
    schema = schemaModule.schema;

    mockContext = {
      user: { id: 1, isAdmin: false },
      db: mockDb,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function getResolver() {
    const queryType = schema.getQueryType();
    const field = queryType?.getFields().publicLeagues;
    if (!field?.resolve) throw new Error('publicLeagues resolver not found');
    return field.resolve.bind(field);
  }

  it('throws UNAUTHENTICATED when no user in context', async () => {
    mockContext.user = null;

    await expect(
      getResolver()({}, { sport: null }, mockContext, undefined as never),
    ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
  });

  it('filters by leagues.sport when sport arg is provided (AC1)', async () => {
    mockDb.then.mockImplementationOnce((resolve) => resolve([]));

    await getResolver()(
      {},
      { sport: 'football' },
      mockContext,
      undefined as never,
    );

    expect(eqSpy).toHaveBeenCalledWith('sport', 'football');
  });

  it('omits the sport condition when sport arg is not provided (backward compat)', async () => {
    mockDb.then.mockImplementationOnce((resolve) => resolve([]));

    await getResolver()({}, { sport: null }, mockContext, undefined as never);

    expect(eqSpy).not.toHaveBeenCalledWith('sport', expect.anything());
    // isPublic is always filtered regardless of sport
    expect(eqSpy).toHaveBeenCalledWith('isPublic', true);
  });

  it('maps rows to PublicLeagueInfo shape for a football-scoped query', async () => {
    mockDb.then.mockImplementationOnce((resolve) =>
      resolve([
        {
          id: 42,
          name: 'Gridiron Public League',
          owner: 1,
          sport: 'football',
          maxRosterSize: 16,
          draftStatus: 'not-started',
          playerPool: 'all',
          isPublic: true,
          totalSpots: 10,
          claimedSpots: 4,
          isAlreadyMember: false,
        },
      ]),
    );

    const result = (await getResolver()(
      {},
      { sport: 'football' },
      mockContext,
      undefined as never,
    )) as Array<{
      id: number;
      availableSpots: number;
      isFull: boolean;
    }>;

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 42,
      availableSpots: 6,
      isFull: false,
    });
  });
});
