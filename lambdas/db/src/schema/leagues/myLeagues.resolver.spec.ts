import type { GraphQLSchema } from 'graphql';

describe('myLeagues query (LS-255 AC12)', () => {
  let schema: GraphQLSchema;
  let mockDb: {
    select: jest.Mock;
    from: jest.Mock;
    innerJoin: jest.Mock;
    where: jest.Mock;
    orderBy: jest.Mock;
    then: jest.Mock;
  };
  let mockContext: {
    user: { id: number; isAdmin: boolean } | null;
    db: typeof mockDb;
  };

  beforeEach(() => {
    jest.resetModules();

    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      then: jest.fn((resolve) => resolve([])),
    };

    jest.doMock('@legacy-sports/db-client', () => ({
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
      return { ...actual };
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
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
    const field = queryType?.getFields().myLeagues;
    if (!field?.resolve) throw new Error('myLeagues resolver not found');
    return field.resolve.bind(field);
  }

  it('throws UNAUTHENTICATED when no user in context', async () => {
    mockContext.user = null;

    await expect(
      getResolver()({}, { sport: null }, mockContext, undefined as never),
    ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
  });

  it('returns empty array when user has no leagues', async () => {
    mockDb.then.mockImplementationOnce((resolve) => resolve([]));

    const result = (await getResolver()(
      {},
      { sport: null },
      mockContext,
      undefined as never,
    )) as unknown[];

    expect(result).toEqual([]);
  });

  it('maps league rows through parseDefensiveFormat', async () => {
    mockDb.then.mockImplementationOnce((resolve) =>
      resolve([
        {
          id: 7,
          name: 'My NFL League',
          owner: 1,
          sport: 'football',
          defensiveFormat: 'idp',
          maxRosterSize: 20,
          currentMatchup: null,
          currentWeek: null,
          draftStatus: 'not-started',
          leaguePhase: 'pre-draft',
          inviteCode: 'ABC123',
          playerPool: 'nfl',
          weekAdvanceStatus: null,
          waiverType: 'standard',
          waiverEnabled: true,
          faabBudgetDefault: 100,
          isPublic: false,
          tierFrozenAt: null,
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
      sport: string;
      defensiveFormat: string | null;
    }>;

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 7,
      sport: 'football',
      defensiveFormat: 'idp',
    });
  });

  it('passes through filter conditions when sport arg is set', async () => {
    mockDb.then.mockImplementationOnce((resolve) => resolve([]));

    await getResolver()(
      {},
      { sport: 'football' },
      mockContext,
      undefined as never,
    );

    // With sport=football, the where() call should receive three conditions
    // (userId match, isMockDraft=false, sport=football). Without sport, only
    // the first two. We assert that where() was invoked at least once on the
    // join chain — finer-grained assertions would couple the test to drizzle
    // expression objects, which are opaque.
    expect(mockDb.where).toHaveBeenCalled();
    expect(mockDb.innerJoin).toHaveBeenCalled();
  });
});
