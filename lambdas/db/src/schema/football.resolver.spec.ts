import type { GraphQLSchema } from 'graphql';

type FootballPlayersResult = {
  nodes: Array<{
    id: number;
    firstName: string;
    lastName: string;
    pfrId: string | null;
    isDst: boolean;
    nflTeam: string | null;
    position: string | null;
  }>;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

type FootballPlayerResult = {
  id: number;
  firstName: string;
  lastName: string;
  pfrId: string | null;
  isDst: boolean;
  nflTeam: string | null;
  position: string | null;
} | null;

describe('football resolvers', () => {
  let schema: GraphQLSchema;
  let mockDb: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    orderBy: jest.Mock;
    limit: jest.Mock;
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
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
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
        players: {
          id: 'id',
          firstName: 'firstName',
          lastName: 'lastName',
          sport: 'sport',
          isDst: 'isDst',
          nflTeam: 'nflTeam',
          pfrId: 'pfrId',
          position: 'position',
        },
        footballSeasonPassing: { playerId: 'playerId', season: 'season' },
        footballSeasonRushing: { playerId: 'playerId', season: 'season' },
        footballSeasonReceiving: { playerId: 'playerId', season: 'season' },
        footballSeasonKicking: { playerId: 'playerId', season: 'season' },
        footballSeasonDefense: { playerId: 'playerId', season: 'season' },
        footballSeasonDefenseIdp: {
          playerId: 'playerId',
          season: 'season',
          team: 'team',
          g: 'g',
          gs: 'gs',
          soloTkl: 'soloTkl',
          astTkl: 'astTkl',
          totalTkl: 'totalTkl',
          sacks: 'sacks',
          int: 'int',
          pd: 'pd',
          ff: 'ff',
          fr: 'fr',
          defTd: 'defTd',
          safeties: 'safeties',
        },
        careerFootballPassing: { playerId: 'playerId' },
        careerFootballRushing: { playerId: 'playerId' },
        careerFootballReceiving: { playerId: 'playerId' },
        careerFootballKicking: { playerId: 'playerId' },
        careerFootballDefense: { playerId: 'playerId' },
        careerFootballDefenseIdp: {
          playerId: 'playerId',
          g: 'g',
          soloTkl: 'soloTkl',
          astTkl: 'astTkl',
          sacks: 'sacks',
          int: 'int',
          pd: 'pd',
          ff: 'ff',
          fr: 'fr',
          defTd: 'defTd',
          safeties: 'safeties',
        },
        leagues: { id: 'id', name: 'name', defensiveFormat: 'defensiveFormat' },
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
    const schemaModule = require('../schema') as { schema: GraphQLSchema };
    schema = schemaModule.schema;

    mockContext = {
      user: { id: 1, isAdmin: false },
      db: mockDb,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── footballPlayers ──────────────────────────────────────────────────────────

  describe('footballPlayers query', () => {
    function getResolver() {
      const queryType = schema.getQueryType();
      const field = queryType?.getFields().footballPlayers;
      if (!field?.resolve)
        throw new Error('footballPlayers resolver not found');
      return field.resolve.bind(field);
    }

    it('throws UNAUTHENTICATED when no user in context', async () => {
      mockContext.user = null;

      await expect(
        getResolver()(
          {},
          { position: null, search: null, after: null },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
    });

    it('returns empty connection when no players found', async () => {
      mockDb.then.mockImplementationOnce((resolve) => resolve([]));

      const result = (await getResolver()(
        {},
        { position: null, search: null, after: null },
        mockContext,
        undefined as never,
      )) as FootballPlayersResult;

      expect(result).toEqual({
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      });
    });

    it('maps player rows to FootballPlayer shape', async () => {
      const playerRow = {
        id: 1,
        firstName: 'Patrick',
        lastName: 'Mahomes',
        pfrId: 'MahoP00',
        isDst: false,
        nflTeam: 'KC',
        position: 'QB',
      };
      mockDb.then.mockImplementationOnce((resolve) => resolve([playerRow]));

      const result = (await getResolver()(
        {},
        { position: null, search: null, after: null },
        mockContext,
        undefined as never,
      )) as FootballPlayersResult;

      expect(result).toMatchObject({
        nodes: [
          {
            id: 1,
            firstName: 'Patrick',
            lastName: 'Mahomes',
            pfrId: 'MahoP00',
            isDst: false,
            nflTeam: 'KC',
            position: 'QB',
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      });
    });

    it('returns position from player row', async () => {
      mockDb.then.mockImplementationOnce((resolve) =>
        resolve([
          {
            id: 2,
            firstName: 'Kansas City',
            lastName: 'DST',
            pfrId: null,
            isDst: true,
            nflTeam: 'KC',
            position: 'DST',
          },
        ]),
      );

      const result = (await getResolver()(
        {},
        { position: 'DST', search: null, after: null },
        mockContext,
        undefined as never,
      )) as FootballPlayersResult;

      expect(result.nodes[0].position).toBe('DST');
    });

    it('sets hasNextPage=true and sets endCursor when more rows exist', async () => {
      const pageSize = 25;
      const rows = Array.from({ length: pageSize + 1 }, (_, i) => ({
        id: i + 1,
        firstName: 'Player',
        lastName: `Last${i}`,
        pfrId: null,
        isDst: false,
        nflTeam: null,
        position: 'WR',
      }));
      mockDb.then.mockImplementationOnce((resolve) => resolve(rows));

      const result = (await getResolver()(
        {},
        { position: null, search: null, after: null },
        mockContext,
        undefined as never,
      )) as FootballPlayersResult;

      expect(result.pageInfo.hasNextPage).toBe(true);
      expect(result.pageInfo.endCursor).not.toBeNull();
      expect(result.nodes).toHaveLength(pageSize);
      // endCursor is the string id of the last included row
      expect(result.pageInfo.endCursor).toBe(String(pageSize));
    });

    it('passes after cursor as id filter condition', async () => {
      mockDb.then.mockImplementationOnce((resolve) => resolve([]));

      await getResolver()(
        {},
        { position: null, search: null, after: '42' },
        mockContext,
        undefined as never,
      );

      expect(mockDb.where).toHaveBeenCalled();
    });
  });

  // ── footballPlayer ───────────────────────────────────────────────────────────

  describe('footballPlayer query', () => {
    function getResolver() {
      const queryType = schema.getQueryType();
      const field = queryType?.getFields().footballPlayer;
      if (!field?.resolve) throw new Error('footballPlayer resolver not found');
      return field.resolve.bind(field);
    }

    it('throws UNAUTHENTICATED when no user in context', async () => {
      mockContext.user = null;

      await expect(
        getResolver()({}, { id: 1 }, mockContext, undefined as never),
      ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
    });

    it('returns null when player not found', async () => {
      mockDb.then.mockImplementationOnce((resolve) => resolve([]));

      const result = (await getResolver()(
        {},
        { id: 999 },
        mockContext,
        undefined as never,
      )) as FootballPlayerResult;

      expect(result).toBeNull();
    });

    it('returns mapped FootballPlayer when found', async () => {
      mockDb.then.mockImplementationOnce((resolve) =>
        resolve([
          {
            id: 5,
            firstName: 'Travis',
            lastName: 'Kelce',
            pfrId: 'KelcT00',
            isDst: false,
            nflTeam: 'KC',
            position: 'TE',
          },
        ]),
      );

      const result = (await getResolver()(
        {},
        { id: 5 },
        mockContext,
        undefined as never,
      )) as FootballPlayerResult;

      expect(result).toMatchObject({
        id: 5,
        firstName: 'Travis',
        lastName: 'Kelce',
        pfrId: 'KelcT00',
        isDst: false,
        nflTeam: 'KC',
        position: 'TE',
      });
    });
  });
});
