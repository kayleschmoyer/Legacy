import { PgDialect } from 'drizzle-orm/pg-core';
import {
  type GraphQLObjectType,
  type GraphQLSchema,
  isNonNullType,
} from 'graphql';
import { ENTITLEMENTS } from '@legacy-sports/utils';

type FootballPlayersResult = {
  nodes: Array<{
    id: number;
    firstName: string;
    lastName: string;
    pfrId: string | null;
    isDst: boolean;
    nflTeam: string | null;
    position: string | null;
    jerseyNumber: number | null;
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
  jerseyNumber: number | null;
} | null;

describe('football resolvers', () => {
  let schema: GraphQLSchema;
  let mockDb: {
    select: jest.Mock;
    from: jest.Mock;
    $dynamic: jest.Mock;
    innerJoin: jest.Mock;
    leftJoin: jest.Mock;
    where: jest.Mock;
    orderBy: jest.Mock;
    limit: jest.Mock;
    offset: jest.Mock;
    then: jest.Mock;
  };
  let mockCareerFootballLoaders: {
    careerFootballPassing: { load: jest.Mock };
    careerFootballRushing: { load: jest.Mock };
    careerFootballReceiving: { load: jest.Mock };
    careerFootballKicking: { load: jest.Mock };
    careerFootballDefense: { load: jest.Mock };
    careerFootballDefenseIdp: { load: jest.Mock };
  };
  let mockContext: {
    user: {
      id: number;
      isAdmin: boolean;
      entitlements?: string[];
    } | null;
    db: typeof mockDb;
    loaders: typeof mockCareerFootballLoaders;
  };

  beforeEach(() => {
    jest.resetModules();

    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      $dynamic: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
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
          jerseyNumber: 'jerseyNumber',
          news: 'news',
          projectedFantasyPoints: 'projectedFantasyPoints',
          adpRank: 'adpRank',
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
        gameFootballPassing: {
          playerId: 'playerId',
          season: 'season',
          gameNum: 'gameNum',
        },
        gameFootballRushing: {
          playerId: 'playerId',
          season: 'season',
          gameNum: 'gameNum',
        },
        gameFootballReceiving: {
          playerId: 'playerId',
          season: 'season',
          gameNum: 'gameNum',
        },
        gameFootballKicking: {
          playerId: 'playerId',
          season: 'season',
          gameNum: 'gameNum',
        },
        gameFootballDefense: {
          playerId: 'playerId',
          season: 'season',
          gameNum: 'gameNum',
        },
        gameFootballDefenseIdp: {
          playerId: 'playerId',
          season: 'season',
          gameNum: 'gameNum',
        },
        footballPlayerEligiblePositions: {
          playerId: 'playerId',
          position: 'position',
        },
        // Career tables carry per-table-prefixed sentinel values so LS-8566
        // stat-sort assertions can tell which table a sort expression or join
        // target came from (the plain-string mocks are compiled into bind
        // params by PgDialect in the assertions).
        careerFootballPassing: {
          playerId: 'careerPassing.playerId',
          g: 'careerPassing.g',
          cmp: 'careerPassing.cmp',
          att: 'careerPassing.att',
          yds: 'careerPassing.yds',
          td: 'careerPassing.td',
          int: 'careerPassing.int',
          sacked: 'careerPassing.sacked',
          rating: 'careerPassing.rating',
        },
        careerFootballRushing: {
          playerId: 'careerRushing.playerId',
          g: 'careerRushing.g',
          att: 'careerRushing.att',
          yds: 'careerRushing.yds',
          td: 'careerRushing.td',
          lng: 'careerRushing.lng',
          fumbles: 'careerRushing.fumbles',
        },
        careerFootballReceiving: {
          playerId: 'careerReceiving.playerId',
          g: 'careerReceiving.g',
          rec: 'careerReceiving.rec',
          tgt: 'careerReceiving.tgt',
          yds: 'careerReceiving.yds',
          td: 'careerReceiving.td',
          lng: 'careerReceiving.lng',
          fumbles: 'careerReceiving.fumbles',
        },
        careerFootballKicking: {
          playerId: 'careerKicking.playerId',
          g: 'careerKicking.g',
          fgm: 'careerKicking.fgm',
          fga: 'careerKicking.fga',
          fg50m: 'careerKicking.fg50m',
          xpm: 'careerKicking.xpm',
          xpa: 'careerKicking.xpa',
          lng: 'careerKicking.lng',
        },
        careerFootballDefense: {
          playerId: 'careerDefense.playerId',
          g: 'careerDefense.g',
          sacks: 'careerDefense.sacks',
          int: 'careerDefense.int',
          fumRec: 'careerDefense.fumRec',
          defTd: 'careerDefense.defTd',
          safeties: 'careerDefense.safeties',
          ptsAllowedPerG: 'careerDefense.ptsAllowedPerG',
          ydsAllowedPerG: 'careerDefense.ydsAllowedPerG',
        },
        careerFootballDefenseIdp: {
          playerId: 'playerId',
          g: 'g',
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
        footballTeamSeasonMetadata: {
          season: 'season',
          teamAbbreviation: 'teamAbbreviation',
          byeWeek: 'byeWeek',
          tier: 'tier',
        },
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
      // Override asc/desc with readable sentinels so orderBy assertions can
      // check the exact column + direction the resolver requested. The mocked
      // PublicSchema columns are plain strings (e.g. 'id', 'lastName'), so
      // these produce values like 'asc:id'.
      return {
        ...actual,
        asc: (col: unknown) => `asc:${String(col)}`,
        desc: (col: unknown) => `desc:${String(col)}`,
      };
    });

    const schemaModule = require('../schema') as { schema: GraphQLSchema };
    schema = schemaModule.schema;

    mockCareerFootballLoaders = {
      careerFootballPassing: { load: jest.fn().mockResolvedValue(null) },
      careerFootballRushing: { load: jest.fn().mockResolvedValue(null) },
      careerFootballReceiving: { load: jest.fn().mockResolvedValue(null) },
      careerFootballKicking: { load: jest.fn().mockResolvedValue(null) },
      careerFootballDefense: { load: jest.fn().mockResolvedValue(null) },
      careerFootballDefenseIdp: { load: jest.fn().mockResolvedValue(null) },
    };

    mockContext = {
      user: { id: 1, isAdmin: false },
      db: mockDb,
      loaders: mockCareerFootballLoaders,
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

      expect(result).toMatchObject({
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
        pageInfo: { hasNextPage: false, endCursor: '1' },
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

    it('applies the after cursor as an offset', async () => {
      mockDb.then.mockImplementationOnce((resolve) => resolve([]));

      await getResolver()(
        {},
        { position: null, search: null, after: '42' },
        mockContext,
        undefined as never,
      );

      expect(mockDb.offset).toHaveBeenCalledWith(42);
    });

    it('defaults the offset to 0 when no cursor is provided', async () => {
      mockDb.then.mockImplementationOnce((resolve) => resolve([]));

      await getResolver()(
        {},
        { position: null, search: null, after: null },
        mockContext,
        undefined as never,
      );

      expect(mockDb.offset).toHaveBeenCalledWith(0);
    });

    it('advances endCursor by the page offset', async () => {
      mockDb.then.mockImplementationOnce((resolve) =>
        resolve([
          {
            id: 99,
            firstName: 'Justin',
            lastName: 'Jefferson',
            pfrId: null,
            isDst: false,
            nflTeam: 'MIN',
            position: 'WR',
          },
        ]),
      );

      const result = (await getResolver()(
        {},
        { position: null, search: null, after: '25' },
        mockContext,
        undefined as never,
      )) as FootballPlayersResult;

      // offset (25) + nodes on this page (1) → next offset cursor is 26,
      // not the row's id (99).
      expect(result.pageInfo.endCursor).toBe('26');
    });

    it('orders by id when no sortBy is provided', async () => {
      mockDb.then.mockImplementationOnce((resolve) => resolve([]));

      await getResolver()(
        {},
        { position: null, search: null, after: null, sortBy: null },
        mockContext,
        undefined as never,
      );

      // Default order: a single id ordering term.
      expect(mockDb.orderBy).toHaveBeenCalledWith('asc:id');
    });

    it('orders by lastName, firstName, id for sortBy=name', async () => {
      mockDb.then.mockImplementationOnce((resolve) => resolve([]));

      await getResolver()(
        {},
        { position: null, search: null, after: null, sortBy: 'name' },
        mockContext,
        undefined as never,
      );

      expect(mockDb.orderBy).toHaveBeenCalledWith(
        'asc:lastName',
        'asc:firstName',
        'asc:id',
      );
    });

    it('applies descending direction to the sort column', async () => {
      mockDb.then.mockImplementationOnce((resolve) => resolve([]));

      await getResolver()(
        {},
        {
          position: null,
          search: null,
          after: null,
          sortBy: 'team',
          sortDir: 'desc',
        },
        mockContext,
        undefined as never,
      );

      // Sort column descends; id tiebreaker stays ascending for stability.
      expect(mockDb.orderBy).toHaveBeenCalledWith('desc:nflTeam', 'asc:id');
    });

    it('throws BAD_USER_INPUT for invalid sortBy value', async () => {
      await expect(
        getResolver()(
          {},
          { position: null, search: null, after: null, sortBy: 'nonsense' },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    });

    it('throws BAD_USER_INPUT for invalid sortDir value', async () => {
      await expect(
        getResolver()(
          {},
          {
            position: null,
            search: null,
            after: null,
            sortBy: 'name',
            sortDir: 'sideways',
          },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    });

    it('accepts FLEX position and returns matching players', async () => {
      const rbRow = {
        id: 10,
        firstName: 'Christian',
        lastName: 'McCaffrey',
        pfrId: null,
        isDst: false,
        nflTeam: 'SF',
        position: 'RB',
      };
      mockDb.then.mockImplementationOnce((resolve) => resolve([rbRow]));

      const result = (await getResolver()(
        {},
        { position: 'FLEX', nflTeam: null, search: null, after: null },
        mockContext,
        undefined as never,
      )) as FootballPlayersResult;

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].position).toBe('RB');
    });

    it('accepts SUPERFLEX position and returns QB/RB/WR/TE players', async () => {
      const qbRow = {
        id: 11,
        firstName: 'Patrick',
        lastName: 'Mahomes',
        pfrId: null,
        isDst: false,
        nflTeam: 'KC',
        position: 'QB',
      };
      mockDb.then.mockImplementationOnce((resolve) => resolve([qbRow]));

      const result = (await getResolver()(
        {},
        { position: 'SUPERFLEX', nflTeam: null, search: null, after: null },
        mockContext,
        undefined as never,
      )) as FootballPlayersResult;

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].position).toBe('QB');
    });

    it('accepts IDP position and returns DL/LB/DB players', async () => {
      const dlRow = {
        id: 12,
        firstName: 'Myles',
        lastName: 'Garrett',
        pfrId: null,
        isDst: false,
        nflTeam: 'CLE',
        position: 'DL',
      };
      mockDb.then.mockImplementationOnce((resolve) => resolve([dlRow]));

      const result = (await getResolver()(
        {},
        { position: 'IDP', nflTeam: null, search: null, after: null },
        mockContext,
        undefined as never,
      )) as FootballPlayersResult;

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].position).toBe('DL');
    });

    it('uses EXISTS subquery against eligible-positions view for specific position filter', async () => {
      mockDb.then.mockImplementationOnce((resolve) => resolve([]));

      await getResolver()(
        {},
        { position: 'RB', nflTeam: null, search: null, after: null },
        mockContext,
        undefined as never,
      );

      const { sql: compiledSql } = new PgDialect().sqlToQuery(
        mockDb.where.mock.calls[0][0],
      );
      expect(compiledSql).toContain('football_player_eligible_positions');
      expect(compiledSql).toContain('EXISTS');
    });

    it('uses EXISTS subquery against eligible-positions view for FLEX position filter', async () => {
      mockDb.then.mockImplementationOnce((resolve) => resolve([]));

      await getResolver()(
        {},
        { position: 'FLEX', nflTeam: null, search: null, after: null },
        mockContext,
        undefined as never,
      );

      const { sql: compiledSql } = new PgDialect().sqlToQuery(
        mockDb.where.mock.calls[0][0],
      );
      expect(compiledSql).toContain('football_player_eligible_positions');
      expect(compiledSql).toContain('EXISTS');
    });

    it('throws BAD_USER_INPUT for invalid position value', async () => {
      await expect(
        getResolver()(
          {},
          { position: 'INVALID_POS', nflTeam: null, search: null, after: null },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    });

    it('throws BAD_USER_INPUT for invalid nflTeam value', async () => {
      await expect(
        getResolver()(
          {},
          { position: null, nflTeam: 'BADTEAM', search: null, after: null },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    });

    describe('nflTeam filter — relocated franchise expansion (LS-6492)', () => {
      function compileWhereParams(): unknown[] {
        const whereArg = mockDb.where.mock.calls[0][0];
        return new PgDialect().sqlToQuery(whereArg).params;
      }

      it('includes OAK alongside LV when filtering by LV (Raiders relocation)', async () => {
        mockDb.then.mockImplementationOnce((resolve) => resolve([]));

        await getResolver()(
          {},
          { position: null, nflTeam: 'LV', search: null, after: null },
          mockContext,
          undefined as never,
        );

        const params = compileWhereParams();
        expect(params).toContain('LV');
        expect(params).toContain('OAK');
      });

      it('includes SD alongside LAC when filtering by LAC (Chargers relocation)', async () => {
        mockDb.then.mockImplementationOnce((resolve) => resolve([]));

        await getResolver()(
          {},
          { position: null, nflTeam: 'LAC', search: null, after: null },
          mockContext,
          undefined as never,
        );

        const params = compileWhereParams();
        expect(params).toContain('LAC');
        expect(params).toContain('SD');
      });

      it('includes STL alongside LAR when filtering by LAR (Rams relocation)', async () => {
        mockDb.then.mockImplementationOnce((resolve) => resolve([]));

        await getResolver()(
          {},
          { position: null, nflTeam: 'LAR', search: null, after: null },
          mockContext,
          undefined as never,
        );

        const params = compileWhereParams();
        expect(params).toContain('LAR');
        expect(params).toContain('STL');
      });

      it('uses only the current abbreviation for non-relocated teams (KC)', async () => {
        mockDb.then.mockImplementationOnce((resolve) => resolve([]));

        await getResolver()(
          {},
          { position: null, nflTeam: 'KC', search: null, after: null },
          mockContext,
          undefined as never,
        );

        const params = compileWhereParams();
        expect(params).toContain('KC');
        expect(params).not.toContain('OAK');
        expect(params).not.toContain('SD');
        expect(params).not.toContain('STL');
      });
    });

    describe('positions multi-select (LS-6464)', () => {
      // Serialize the WHERE SQL passed to db.where() into bind params using
      // drizzle's own dialect so we can assert the real compiled query.
      function compileWhereParams(): unknown[] {
        const whereArg = mockDb.where.mock.calls[0][0];
        return new PgDialect().sqlToQuery(whereArg).params;
      }

      it('filters with inArray over multiple positions', async () => {
        mockDb.then.mockImplementationOnce((resolve) => resolve([]));

        await getResolver()(
          {},
          { positions: ['QB', 'RB'], search: null, after: null },
          mockContext,
          undefined as never,
        );

        const params = compileWhereParams();
        expect(params).toContain('QB');
        expect(params).toContain('RB');
      });

      it('still supports the legacy single position arg', async () => {
        mockDb.then.mockImplementationOnce((resolve) => resolve([]));

        await getResolver()(
          {},
          { position: 'WR', search: null, after: null },
          mockContext,
          undefined as never,
        );

        expect(compileWhereParams()).toContain('WR');
      });

      it('merges the single position and positions array into one filter', async () => {
        mockDb.then.mockImplementationOnce((resolve) => resolve([]));

        await getResolver()(
          {},
          {
            position: 'TE',
            positions: ['QB', 'RB'],
            search: null,
            after: null,
          },
          mockContext,
          undefined as never,
        );

        expect(compileWhereParams()).toEqual(
          expect.arrayContaining(['QB', 'RB', 'TE']),
        );
      });

      it('throws BAD_USER_INPUT when any position in the array is invalid', async () => {
        await expect(
          getResolver()(
            {},
            { positions: ['QB', 'INVALID_POS'], search: null, after: null },
            mockContext,
            undefined as never,
          ),
        ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
      });
    });

    describe('search parameter handling', () => {
      // Serialize the WHERE SQL passed to db.where() into { sql, params }
      // using drizzle's own dialect, so assertions read the real compiled
      // query rather than poking at SQL-object internals.
      function compileWhere(): { sql: string; params: unknown[] } {
        const whereArg = mockDb.where.mock.calls[0][0];
        const { sql, params } = new PgDialect().sqlToQuery(whereArg);
        return { sql, params };
      }

      it('full-name search splits on whitespace and produces per-token ILIKE params', async () => {
        mockDb.then.mockImplementationOnce((resolve) =>
          resolve([
            {
              id: 1,
              firstName: 'Patrick',
              lastName: 'Mahomes',
              pfrId: null,
              isDst: false,
              nflTeam: 'KC',
              position: 'QB',
            },
          ]),
        );

        const result = (await getResolver()(
          {},
          { position: null, search: 'Patrick Mahomes', after: null },
          mockContext,
          undefined as never,
        )) as FootballPlayersResult;

        expect(result.nodes).toHaveLength(1);
        expect(result.nodes[0].firstName).toBe('Patrick');

        const { params } = compileWhere();
        // Each token is matched across firstName OR lastName, AND-ed together,
        // so both tokens appear as ILIKE bind params.
        expect(params).toContain('%Patrick%');
        expect(params).toContain('%Mahomes%');
      });

      it('single-token search produces one ILIKE pattern (unchanged behavior)', async () => {
        await getResolver()(
          {},
          { position: null, search: 'Mahomes', after: null },
          mockContext,
          undefined as never,
        );

        const { params } = compileWhere();
        expect(params).toContain('%Mahomes%');
        expect(params).not.toContain('%Patrick%');
      });

      it('escapes underscore so a single _ does not act as a wildcard', async () => {
        await getResolver()(
          {},
          { position: null, search: '_', after: null },
          mockContext,
          undefined as never,
        );

        const { sql, params } = compileWhere();
        // The underscore is escaped, so it matches a literal '_' rather than
        // any single character (which would return the whole table).
        expect(params).toContain('%\\_%');
        expect(params).not.toContain('%_%');
        expect(sql).toContain('ESCAPE');
      });

      it('escapes percent sign so a single % does not match all players', async () => {
        await getResolver()(
          {},
          { position: null, search: '%', after: null },
          mockContext,
          undefined as never,
        );

        const { sql, params } = compileWhere();
        // The percent is escaped, so it matches a literal '%' rather than any
        // sequence (which would return the whole table).
        expect(params).toContain('%\\%%');
        expect(params).not.toContain('%%%');
        expect(sql).toContain('ESCAPE');
      });

      it('wraps columns with unaccent() for accent-insensitive search (LS-6484)', async () => {
        await getResolver()(
          {},
          { position: null, search: 'Pena', after: null },
          mockContext,
          undefined as never,
        );

        const { sql } = compileWhere();
        expect(sql).toContain('unaccent(');
      });

      it('parameterizes the search term — user input never appears in raw SQL text (LS-6484)', async () => {
        const injection = "O'Malley";
        await getResolver()(
          {},
          { position: null, search: injection, after: null },
          mockContext,
          undefined as never,
        );

        const { sql, params } = compileWhere();
        expect(sql).not.toContain(injection);
        expect(params).toEqual(expect.arrayContaining([`%${injection}%`]));
      });
    });

    it('throws BAD_USER_INPUT for invalid conference value', async () => {
      await expect(
        getResolver()(
          {},
          { position: null, conference: 'BADCONF', search: null, after: null },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    });

    it('applies inArray condition when conference=AFC is passed', async () => {
      mockDb.then.mockImplementationOnce((resolve) => resolve([]));

      await getResolver()(
        {},
        { position: null, conference: 'AFC', search: null, after: null },
        mockContext,
        undefined as never,
      );

      expect(mockDb.where).toHaveBeenCalled();
    });

    it('applies inArray condition when conference=NFC is passed', async () => {
      mockDb.then.mockImplementationOnce((resolve) => resolve([]));

      await getResolver()(
        {},
        { position: null, conference: 'NFC', search: null, after: null },
        mockContext,
        undefined as never,
      );

      expect(mockDb.where).toHaveBeenCalled();
    });

    // ── Premium advanced filters (LS-6489 / FPL-008) ──────────────────────────
    describe('premium advanced filters', () => {
      it('does NOT perform a tier lookup when no advanced filter is supplied', async () => {
        // Only the players query should run — a single awaited query. The basic
        // list stays open to all tiers (no entitlement enforcement).
        mockDb.then.mockImplementationOnce((resolve) => resolve([]));

        await getResolver()(
          {},
          { position: null, search: null, after: null },
          mockContext,
          undefined as never,
        );

        expect(mockDb.then).toHaveBeenCalledTimes(1);
      });

      it('throws PREMIUM_REQUIRED when a free user filters by minProjectedPoints', async () => {
        mockDb.then.mockImplementationOnce((resolve) =>
          resolve([{ tier: 'free' }]),
        );

        await expect(
          getResolver()(
            {},
            {
              position: null,
              search: null,
              after: null,
              minProjectedPoints: 150,
            },
            mockContext,
            undefined as never,
          ),
        ).rejects.toMatchObject({ extensions: { code: 'PREMIUM_REQUIRED' } });
      });

      it('throws PREMIUM_REQUIRED when a free user filters by maxAdpRank', async () => {
        mockDb.then.mockImplementationOnce((resolve) =>
          resolve([{ tier: 'free' }]),
        );

        await expect(
          getResolver()(
            {},
            { position: null, search: null, after: null, maxAdpRank: 50 },
            mockContext,
            undefined as never,
          ),
        ).rejects.toMatchObject({ extensions: { code: 'PREMIUM_REQUIRED' } });
      });

      it('applies the filters for a premium user', async () => {
        // First awaited query: tier lookup → premium. Second: players query.
        mockDb.then
          .mockImplementationOnce((resolve) => resolve([{ tier: 'premium' }]))
          .mockImplementationOnce((resolve) => resolve([]));
        // requireEntitlement(advanced_search_filters) reads the JWT-claim
        // entitlements array (LS-8643), not the DB tier row mocked above.
        mockContext.user = {
          id: 1,
          isAdmin: false,
          entitlements: [ENTITLEMENTS.advanced_search_filters],
        };

        const result = (await getResolver()(
          {},
          {
            position: null,
            search: null,
            after: null,
            minProjectedPoints: 100,
            maxAdpRank: 75,
          },
          mockContext,
          undefined as never,
        )) as FootballPlayersResult;

        expect(result).toMatchObject({
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        });
        // Tier lookup + players query both ran.
        expect(mockDb.then).toHaveBeenCalledTimes(2);
        expect(mockDb.where).toHaveBeenCalled();
      });

      it('treats an admin as premium without a tier lookup', async () => {
        mockContext.user = { id: 1, isAdmin: true };
        // No tier-lookup row queued — only the players query runs.
        mockDb.then.mockImplementationOnce((resolve) => resolve([]));

        const result = (await getResolver()(
          {},
          { position: null, search: null, after: null, maxAdpRank: 50 },
          mockContext,
          undefined as never,
        )) as FootballPlayersResult;

        expect(result.nodes).toEqual([]);
        // Admin short-circuit means a single query (players), no tier lookup.
        expect(mockDb.then).toHaveBeenCalledTimes(1);
      });
    });

    // ── Stat sorting + category joins + totalCount (LS-8566) ─────────────────
    describe('stat sorting and category (LS-8566)', () => {
      function compileSql(arg: unknown): { sql: string; params: unknown[] } {
        return new PgDialect().sqlToQuery(arg as never);
      }

      it('emits a NULLS LAST stat ordering with the id tiebreaker for a stat sortBy', async () => {
        mockDb.then.mockImplementationOnce((resolve) => resolve([]));

        await getResolver()(
          {},
          {
            position: null,
            search: null,
            after: null,
            sortBy: 'passing.yds',
            sortDir: 'desc',
            category: 'passing',
          },
          mockContext,
          undefined as never,
        );

        const orderByCall = mockDb.orderBy.mock.calls[0];
        const { sql: orderSql, params } = compileSql(orderByCall[0]);
        expect(orderSql).toContain('DESC NULLS LAST');
        expect(params).toContain('careerPassing.yds');
        expect(orderByCall[1]).toBe('asc:id');
      });

      it('ascending stat sort also pushes NULLs last', async () => {
        mockDb.then.mockImplementationOnce((resolve) => resolve([]));

        await getResolver()(
          {},
          {
            position: null,
            search: null,
            after: null,
            sortBy: 'idp.totalTkl',
            sortDir: 'asc',
            category: 'idp',
          },
          mockContext,
          undefined as never,
        );

        const { sql: orderSql, params } = compileSql(
          mockDb.orderBy.mock.calls[0][0],
        );
        expect(orderSql).toContain('ASC NULLS LAST');
        expect(params).toContain('totalTkl');
      });

      it('inner-joins the matching career table for the category', async () => {
        mockDb.then.mockImplementationOnce((resolve) => resolve([]));

        await getResolver()(
          {},
          {
            position: null,
            search: null,
            after: null,
            category: 'rushing',
          },
          mockContext,
          undefined as never,
        );

        expect(mockDb.innerJoin).toHaveBeenCalledTimes(1);
        expect(mockDb.innerJoin).toHaveBeenCalledWith(
          expect.objectContaining({ yds: 'careerRushing.yds' }),
          expect.anything(),
        );
      });

      it("category 'idp' joins the IDP aggregate view", async () => {
        mockDb.then.mockImplementationOnce((resolve) => resolve([]));

        await getResolver()(
          {},
          { position: null, search: null, after: null, category: 'idp' },
          mockContext,
          undefined as never,
        );

        expect(mockDb.innerJoin).toHaveBeenCalledWith(
          expect.objectContaining({ soloTkl: 'soloTkl' }),
          expect.anything(),
        );
      });

      it("category 'defense' joins the DST career table and pins isDst", async () => {
        mockDb.then.mockImplementationOnce((resolve) => resolve([]));

        await getResolver()(
          {},
          { position: null, search: null, after: null, category: 'defense' },
          mockContext,
          undefined as never,
        );

        expect(mockDb.innerJoin).toHaveBeenCalledWith(
          expect.objectContaining({ fumRec: 'careerDefense.fumRec' }),
          expect.anything(),
        );
        // isDst=true guard rides along in the WHERE conditions.
        const { params } = compileSql(mockDb.where.mock.calls[0][0]);
        expect(params).toContain(true);
      });

      it('does not join any career table without a category', async () => {
        mockDb.then.mockImplementationOnce((resolve) => resolve([]));

        await getResolver()(
          {},
          { position: null, search: null, after: null, sortBy: 'name' },
          mockContext,
          undefined as never,
        );

        expect(mockDb.innerJoin).not.toHaveBeenCalled();
      });

      it('players-table sorts remain valid alongside a category', async () => {
        mockDb.then.mockImplementationOnce((resolve) => resolve([]));

        await getResolver()(
          {},
          {
            position: null,
            search: null,
            after: null,
            sortBy: 'name',
            category: 'passing',
          },
          mockContext,
          undefined as never,
        );

        expect(mockDb.innerJoin).toHaveBeenCalledTimes(1);
        expect(mockDb.orderBy).toHaveBeenCalledWith(
          'asc:lastName',
          'asc:firstName',
          'asc:id',
        );
      });

      it('keeps the offset cursor semantics with a category join', async () => {
        mockDb.then.mockImplementationOnce((resolve) => resolve([]));

        await getResolver()(
          {},
          {
            position: null,
            search: null,
            after: '42',
            sortBy: 'passing.td',
            sortDir: 'desc',
            category: 'passing',
          },
          mockContext,
          undefined as never,
        );

        expect(mockDb.offset).toHaveBeenCalledWith(42);
      });

      it('throws BAD_USER_INPUT for an unknown stat sortBy key', async () => {
        await expect(
          getResolver()(
            {},
            {
              position: null,
              search: null,
              after: null,
              sortBy: 'passing.nope',
              category: 'passing',
            },
            mockContext,
            undefined as never,
          ),
        ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
      });

      it('throws BAD_USER_INPUT for a stat sortBy without a category', async () => {
        await expect(
          getResolver()(
            {},
            {
              position: null,
              search: null,
              after: null,
              sortBy: 'passing.yds',
            },
            mockContext,
            undefined as never,
          ),
        ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
      });

      it('throws BAD_USER_INPUT for a stat sortBy whose prefix mismatches the category', async () => {
        await expect(
          getResolver()(
            {},
            {
              position: null,
              search: null,
              after: null,
              sortBy: 'passing.yds',
              category: 'rushing',
            },
            mockContext,
            undefined as never,
          ),
        ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
      });

      it('throws BAD_USER_INPUT for an invalid category', async () => {
        await expect(
          getResolver()(
            {},
            {
              position: null,
              search: null,
              after: null,
              category: 'special-teams',
            },
            mockContext,
            undefined as never,
          ),
        ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
      });

      describe('totalCount (lazy)', () => {
        type ConnectionWithCount = FootballPlayersResult & {
          getTotalCount: () => Promise<number>;
        };

        it('does not run the COUNT query unless getTotalCount is invoked', async () => {
          mockDb.then.mockImplementationOnce((resolve) => resolve([]));

          const result = (await getResolver()(
            {},
            { position: null, search: null, after: null },
            mockContext,
            undefined as never,
          )) as ConnectionWithCount;

          expect(typeof result.getTotalCount).toBe('function');
          // Only the players query ran.
          expect(mockDb.then).toHaveBeenCalledTimes(1);
        });

        it('runs the COUNT with the same category join and memoizes it', async () => {
          mockDb.then
            .mockImplementationOnce((resolve) => resolve([])) // players query
            .mockImplementation((resolve) => resolve([{ count: 321 }])); // count query

          const result = (await getResolver()(
            {},
            {
              position: null,
              search: null,
              after: null,
              category: 'kicking',
            },
            mockContext,
            undefined as never,
          )) as ConnectionWithCount;

          await expect(result.getTotalCount()).resolves.toBe(321);
          await expect(result.getTotalCount()).resolves.toBe(321);

          // players query + exactly one COUNT despite two invocations.
          expect(mockDb.then).toHaveBeenCalledTimes(2);
          // Both the rows query and the COUNT joined the kicking table.
          expect(mockDb.innerJoin).toHaveBeenCalledTimes(2);
          expect(mockDb.innerJoin).toHaveBeenLastCalledWith(
            expect.objectContaining({ fgm: 'careerKicking.fgm' }),
            expect.anything(),
          );
        });
      });
    });

    describe('fantasy points pool sort (LS-9071)', () => {
      function compileSql(arg: unknown): { sql: string; params: unknown[] } {
        return new PgDialect().sqlToQuery(arg as never);
      }

      it('sorts by fpts across the full pool without requiring a category', async () => {
        mockDb.then.mockImplementationOnce((resolve) => resolve([]));

        await expect(
          getResolver()(
            {},
            {
              position: null,
              search: null,
              after: null,
              sortBy: 'fpts',
              sortDir: 'desc',
            },
            mockContext,
            undefined as never,
          ),
        ).resolves.toBeDefined();

        const { sql: orderSql } = compileSql(mockDb.orderBy.mock.calls[0][0]);
        expect(orderSql).toContain('CASE');
        expect(orderSql).toContain('DESC NULLS LAST');
        expect(mockDb.orderBy.mock.calls[0][1]).toBe('asc:id');
      });

      it('applies ascending direction with NULLS LAST for fpts', async () => {
        mockDb.then.mockImplementationOnce((resolve) => resolve([]));

        await getResolver()(
          {},
          {
            position: null,
            search: null,
            after: null,
            sortBy: 'fpts',
            sortDir: 'asc',
          },
          mockContext,
          undefined as never,
        );

        const { sql: orderSql } = compileSql(mockDb.orderBy.mock.calls[0][0]);
        expect(orderSql).toContain('ASC NULLS LAST');
      });

      it('sorts by fpg (fantasy points per game) alongside fpts', async () => {
        mockDb.then.mockImplementationOnce((resolve) => resolve([]));

        await expect(
          getResolver()(
            {},
            {
              position: null,
              search: null,
              after: null,
              sortBy: 'fpg',
              sortDir: 'desc',
            },
            mockContext,
            undefined as never,
          ),
        ).resolves.toBeDefined();

        const { sql: orderSql } = compileSql(mockDb.orderBy.mock.calls[0][0]);
        expect(orderSql).toContain('NULLIF');
        expect(orderSql).toContain('DESC NULLS LAST');
      });

      it('left-joins every career category table for a pool sort with no category filter', async () => {
        mockDb.then.mockImplementationOnce((resolve) => resolve([]));

        await getResolver()(
          {},
          { position: null, search: null, after: null, sortBy: 'fpts' },
          mockContext,
          undefined as never,
        );

        expect(mockDb.innerJoin).not.toHaveBeenCalled();
        expect(mockDb.leftJoin).toHaveBeenCalledTimes(6);
      });

      it('combines a category filter with the fpts sort via one inner join and left joins for the rest', async () => {
        mockDb.then.mockImplementationOnce((resolve) => resolve([]));

        await getResolver()(
          {},
          {
            position: null,
            search: null,
            after: null,
            sortBy: 'fpts',
            category: 'passing',
          },
          mockContext,
          undefined as never,
        );

        expect(mockDb.innerJoin).toHaveBeenCalledTimes(1);
        expect(mockDb.innerJoin).toHaveBeenCalledWith(
          expect.objectContaining({ yds: 'careerPassing.yds' }),
          expect.anything(),
        );
        // Every other category table is left-joined so fpts still reflects
        // the player's full stat line, not just the filtered category.
        expect(mockDb.leftJoin).toHaveBeenCalledTimes(5);
      });
    });

    it('resolves successfully with freeAgent:true (no nflTeam validation triggered)', async () => {
      mockDb.then.mockImplementationOnce((resolve) => resolve([]));

      await expect(
        getResolver()(
          {},
          {
            position: null,
            freeAgent: true,
            nflTeam: null,
            search: null,
            after: null,
          },
          mockContext,
          undefined as never,
        ),
      ).resolves.toMatchObject({
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      });
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

  // ── careerStats field (LS-6248 / FPD-024) ───────────────────────────────────
  // Career stats are gated on authentication ONLY — never on premium tier.
  // These tests lock in that deliberate product decision so a future change
  // cannot silently add (or remove) the auth gate without failing here.
  describe('careerStats field', () => {
    function getResolver() {
      const type = schema.getType('FootballPlayer') as GraphQLObjectType;
      const field = type.getFields().careerStats;
      if (!field?.resolve) throw new Error('careerStats resolver not found');
      return field.resolve.bind(field);
    }

    const player = {
      id: 7,
      firstName: 'Patrick',
      lastName: 'Mahomes',
      pfrId: 'MahoPa00',
      isDst: false,
      nflTeam: 'KC',
      position: 'QB',
    };

    it('throws UNAUTHENTICATED when no user in context', async () => {
      mockContext.user = null;

      await expect(
        getResolver()(player, {}, mockContext, undefined as never),
      ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
    });

    it('resolves for a free (non-premium) authenticated user — no premium gate', async () => {
      // A non-admin, free-tier user must reach the data. If a premium
      // entitlement gate were ever added, this would reject with
      // PREMIUM_REQUIRED instead of resolving.
      mockContext.user = { id: 1, isAdmin: false };

      const result = await getResolver()(
        player,
        {},
        mockContext,
        undefined as never,
      );

      expect(result).toMatchObject({ playerId: 7 });
    });
  });

  // ── FootballWeeklyGameLog (LS-6233) ─────────────────────────────────────────

  describe('FootballWeeklyGameLog type', () => {
    it('exists in schema with isBye and week fields', () => {
      const type = schema.getType('FootballWeeklyGameLog');
      expect(type).toBeDefined();

      const fields = (type as GraphQLObjectType).getFields();
      expect(fields.week).toBeDefined();
      expect(fields.isBye).toBeDefined();
      expect(fields.opponent).toBeDefined();
      expect(fields.gameDate).toBeDefined();
      expect(fields.fantasyPoints).toBeDefined();
      expect(fields.passing).toBeDefined();
      expect(fields.rushing).toBeDefined();
      expect(fields.receiving).toBeDefined();
      expect(fields.kicking).toBeDefined();
      expect(fields.defense).toBeDefined();
      expect(fields.idp).toBeDefined();
    });

    it('week and isBye are non-nullable', () => {
      const type = schema.getType('FootballWeeklyGameLog') as GraphQLObjectType;
      const fields = type.getFields();

      // Use duck-typing to avoid false negatives from duplicate graphql module
      // instances in the jest module registry (two copies of graphql cause
      // isNonNullType's instanceof check to return false even for valid NonNull).
      expect('ofType' in fields.week.type).toBe(true);
      expect('ofType' in fields.isBye.type).toBe(true);
    });

    it('weeklyGameLogs field exists on FootballPlayer and returns empty array stub', async () => {
      const type = schema.getType('FootballPlayer') as GraphQLObjectType;
      const field = type.getFields().weeklyGameLogs;
      expect(field).toBeDefined();
      expect(field?.resolve).toBeDefined();

      const result = await field.resolve!(
        {
          id: 1,
          firstName: 'Travis',
          lastName: 'Kelce',
          pfrId: null,
          isDst: false,
          nflTeam: 'KC',
          position: 'TE',
        },
        { season: 2024 },
        mockContext,
        undefined as never,
      );
      expect(result).toEqual([]);
    });
  });

  // ── FootballPlayer.careerStats position-aware reads (LS-6245) ────────────────

  describe('FootballPlayer.careerStats', () => {
    function getResolver() {
      const type = schema.getType('FootballPlayer') as GraphQLObjectType;
      const field = type.getFields().careerStats;
      if (!field?.resolve) throw new Error('careerStats resolver not found');
      return field.resolve.bind(field);
    }

    const basePlayer = {
      id: 1,
      firstName: 'Patrick',
      lastName: 'Mahomes',
      pfrId: 'MahoP00',
      isDst: false,
      nflTeam: 'KC',
      position: 'QB',
    };

    // LS-8567: the resolver now reads through per-category DataLoaders keyed
    // by playerId instead of issuing its own db.select() per row, so these
    // assertions check which loaders were `.load()`-ed for a given position
    // rather than counting raw `mockDb.from` calls.
    function loaderCallCounts() {
      return Object.fromEntries(
        Object.entries(mockCareerFootballLoaders).map(([name, loader]) => [
          name,
          loader.load.mock.calls.length,
        ]),
      );
    }

    it('throws UNAUTHENTICATED when no user in context', async () => {
      mockContext.user = null;

      await expect(
        getResolver()(basePlayer, {}, mockContext, undefined as never),
      ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
    });

    it('loads only the four offensive/kicking loaders for a QB', async () => {
      await getResolver()(
        { ...basePlayer, position: 'QB' },
        {},
        mockContext,
        undefined as never,
      );

      expect(loaderCallCounts()).toEqual({
        careerFootballPassing: 1,
        careerFootballRushing: 1,
        careerFootballReceiving: 1,
        careerFootballKicking: 1,
        careerFootballDefense: 0,
        careerFootballDefenseIdp: 0,
      });
      expect(
        mockCareerFootballLoaders.careerFootballPassing.load,
      ).toHaveBeenCalledWith(basePlayer.id);
    });

    it('loads only the four offensive/kicking loaders for a kicker', async () => {
      await getResolver()(
        { ...basePlayer, position: 'K' },
        {},
        mockContext,
        undefined as never,
      );

      expect(loaderCallCounts()).toEqual({
        careerFootballPassing: 1,
        careerFootballRushing: 1,
        careerFootballReceiving: 1,
        careerFootballKicking: 1,
        careerFootballDefense: 0,
        careerFootballDefenseIdp: 0,
      });
    });

    it('loads only the team-defense loader for a DST', async () => {
      await getResolver()(
        { ...basePlayer, isDst: true, position: 'DST' },
        {},
        mockContext,
        undefined as never,
      );

      expect(loaderCallCounts()).toEqual({
        careerFootballPassing: 0,
        careerFootballRushing: 0,
        careerFootballReceiving: 0,
        careerFootballKicking: 0,
        careerFootballDefense: 1,
        careerFootballDefenseIdp: 0,
      });
    });

    it('loads only the IDP loader for an individual defender', async () => {
      await getResolver()(
        { ...basePlayer, position: 'DL' },
        {},
        mockContext,
        undefined as never,
      );

      expect(loaderCallCounts()).toEqual({
        careerFootballPassing: 0,
        careerFootballRushing: 0,
        careerFootballReceiving: 0,
        careerFootballKicking: 0,
        careerFootballDefense: 0,
        careerFootballDefenseIdp: 1,
      });
    });

    it('falls back to the offensive/kicking loaders when position is null', async () => {
      await getResolver()(
        { ...basePlayer, position: null },
        {},
        mockContext,
        undefined as never,
      );

      expect(loaderCallCounts()).toEqual({
        careerFootballPassing: 1,
        careerFootballRushing: 1,
        careerFootballReceiving: 1,
        careerFootballKicking: 1,
        careerFootballDefense: 0,
        careerFootballDefenseIdp: 0,
      });
    });

    it('does not touch context.db directly — reads go through loaders only', async () => {
      await getResolver()(
        { ...basePlayer, position: 'QB' },
        {},
        mockContext,
        undefined as never,
      );

      expect(mockDb.select).not.toHaveBeenCalled();
      expect(mockDb.from).not.toHaveBeenCalled();
    });
  });

  // ── FootballPlayer.headshotUrl (LS-6235) ────────────────────────────────────

  describe('FootballPlayer.headshotUrl', () => {
    function getResolver() {
      const type = schema.getType('FootballPlayer') as GraphQLObjectType;
      const field = type.getFields().headshotUrl;
      if (!field?.resolve) throw new Error('headshotUrl resolver not found');
      return field.resolve.bind(field);
    }

    it('returns null when pfrId is null', () => {
      const result = getResolver()(
        { id: 1, pfrId: null },
        {},
        mockContext,
        undefined as never,
      );
      expect(result).toBeNull();
    });

    it('returns null when pfrId is an empty string', () => {
      const result = getResolver()(
        { id: 1, pfrId: '' },
        {},
        mockContext,
        undefined as never,
      );
      expect(result).toBeNull();
    });

    it('constructs the PFR headshot URL from pfrId with the current year', () => {
      const year = new Date().getFullYear();
      const result = getResolver()(
        { id: 1, pfrId: 'MahoPa00' },
        {},
        mockContext,
        undefined as never,
      );
      expect(result).toBe(
        `https://www.pro-football-reference.com/req/20240117/images/headshots/MahoPa00_${year}.jpg`,
      );
    });
  });

  describe('gameLogs field (LS-6456)', () => {
    type GameLogRow = {
      season: number;
      gameNum: number;
      gameIdentifier: string;
      passing: {
        cmp: number;
        att: number;
        yds: number;
        td: number;
        int: number;
      } | null;
      rushing: { att: number; yds: number; td: number } | null;
      receiving: { rec: number; tgt: number; yds: number; td: number } | null;
      kicking: { fgm: number; fga: number; xpm: number; xpa: number } | null;
      defense: object | null;
      idp: {
        soloTkl: number | null;
        astTkl: number | null;
        sacks: number | null;
        int: number | null;
        pd: number | null;
        ff: number | null;
        fr: number | null;
        defTd: number | null;
        safeties: number | null;
      } | null;
    };

    function getResolver() {
      const type = schema.getType('FootballPlayer') as GraphQLObjectType;
      const field = type.getFields().gameLogs;
      if (!field?.resolve) throw new Error('gameLogs resolver not found');
      return field.resolve.bind(field);
    }

    const player = {
      id: 7,
      firstName: 'Patrick',
      lastName: 'Mahomes',
      pfrId: 'MahoPa00',
      isDst: false,
      nflTeam: 'KC',
      position: 'QB',
    };

    // Mock the 6 parallel DB queries in Promise.all order:
    // passing, rushing, receiving, kicking, defense, idp
    function mockGameQueries(
      passing: object[] = [],
      rushing: object[] = [],
      receiving: object[] = [],
      kicking: object[] = [],
      defense: object[] = [],
      idp: object[] = [],
    ) {
      mockDb.then
        .mockImplementationOnce((resolve: (v: object[]) => void) =>
          resolve(passing),
        )
        .mockImplementationOnce((resolve: (v: object[]) => void) =>
          resolve(rushing),
        )
        .mockImplementationOnce((resolve: (v: object[]) => void) =>
          resolve(receiving),
        )
        .mockImplementationOnce((resolve: (v: object[]) => void) =>
          resolve(kicking),
        )
        .mockImplementationOnce((resolve: (v: object[]) => void) =>
          resolve(defense),
        )
        .mockImplementationOnce((resolve: (v: object[]) => void) =>
          resolve(idp),
        );
    }

    it('throws UNAUTHENTICATED when no user in context', async () => {
      mockContext.user = null;

      await expect(
        getResolver()(
          player,
          { season: 2024 },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
    });

    it('returns empty array when player has no game data for the season', async () => {
      mockGameQueries();

      const result = await getResolver()(
        player,
        { season: 2024 },
        mockContext,
        undefined as never,
      );

      expect(result).toEqual([]);
    });

    it('returns one row with only passing stats when only passing data exists', async () => {
      mockGameQueries([
        {
          gameNum: 1,
          gameIdentifier: '202409080kc',
          cmp: 30,
          att: 45,
          yds: 350,
          td: 3,
          interceptions: 1,
        },
      ]);

      const result = (await getResolver()(
        player,
        { season: 2024 },
        mockContext,
        undefined as never,
      )) as GameLogRow[];

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        season: 2024,
        gameNum: 1,
        gameIdentifier: '202409080kc',
        passing: { cmp: 30, att: 45, yds: 350, td: 3, int: 1 },
        rushing: null,
        receiving: null,
        kicking: null,
        defense: null,
        idp: null,
      });
    });

    it('merges passing and rushing into one row when they share a gameNum', async () => {
      mockGameQueries(
        [
          {
            gameNum: 5,
            gameIdentifier: '202410060kc',
            cmp: 22,
            att: 30,
            yds: 280,
            td: 2,
            interceptions: 0,
          },
        ],
        [{ gameNum: 5, gameIdentifier: '202410060kc', att: 4, yds: 20, td: 0 }],
      );

      const result = (await getResolver()(
        player,
        { season: 2024 },
        mockContext,
        undefined as never,
      )) as GameLogRow[];

      expect(result).toHaveLength(1);
      expect(result[0].passing).toMatchObject({
        cmp: 22,
        att: 30,
        yds: 280,
        td: 2,
        int: 0,
      });
      expect(result[0].rushing).toMatchObject({ att: 4, yds: 20, td: 0 });
    });

    it('sorts results by gameNum ascending', async () => {
      mockGameQueries([
        {
          gameNum: 3,
          gameIdentifier: '202409220kc',
          cmp: 25,
          att: 38,
          yds: 300,
          td: 2,
          interceptions: 0,
        },
        {
          gameNum: 1,
          gameIdentifier: '202409080kc',
          cmp: 30,
          att: 45,
          yds: 350,
          td: 3,
          interceptions: 1,
        },
      ]);

      const result = (await getResolver()(
        player,
        { season: 2024 },
        mockContext,
        undefined as never,
      )) as GameLogRow[];

      expect(result).toHaveLength(2);
      expect(result[0].gameNum).toBe(1);
      expect(result[1].gameNum).toBe(3);
    });

    it('converts IDP sacks from numeric string to float', async () => {
      mockGameQueries(
        [],
        [],
        [],
        [],
        [],
        [
          {
            gameNum: 2,
            gameIdentifier: '202409150buf',
            soloTkl: 5,
            astTkl: 2,
            sacks: '2.5',
            interceptions: 1,
            pd: 0,
            ff: 0,
            fr: 0,
            defTd: 0,
            safeties: 0,
          },
        ],
      );

      const result = (await getResolver()(
        player,
        { season: 2024 },
        mockContext,
        undefined as never,
      )) as GameLogRow[];

      expect(result).toHaveLength(1);
      expect(result[0].idp).toMatchObject({
        soloTkl: 5,
        astTkl: 2,
        sacks: 2.5,
        int: 1,
      });
    });
  });

  describe('FootballCareerStats.fantasyPoints (LS-6469)', () => {
    function getField() {
      const type = schema.getType('FootballCareerStats') as GraphQLObjectType;
      const field = type.getFields().fantasyPoints;
      if (!field?.resolve) throw new Error('fantasyPoints resolver not found');
      return field;
    }

    const nullStats = {
      passing: null,
      rushing: null,
      receiving: null,
      kicking: null,
      defense: null,
      idp: null,
    };

    it('is defined on the FootballCareerStats type', () => {
      expect(getField()).toBeDefined();
    });

    it('returns null when all stat categories are null', () => {
      expect(
        getField().resolve!(nullStats, {}, mockContext, undefined as never),
      ).toBeNull();
    });

    it('computes DST fantasy points from defense stats', () => {
      // 2 sacks × 1 + 1 INT × 2 + 1 fumRec × 2 + 1 defTd × 6 = 12
      const result = getField().resolve!(
        {
          ...nullStats,
          defense: {
            g: 16,
            sacks: 2,
            int: 1,
            fumRec: 1,
            defTd: 1,
            safeties: 0,
            ptsAllowedPerG: 18,
            ydsAllowedPerG: 320,
          },
        },
        {},
        mockContext,
        undefined as never,
      );
      expect(result).toBe(12);
    });

    it('returns 0 (not null) for a DST row with no scoring plays', () => {
      // A present defense row with zero scoring stats is a valid 0-point total,
      // not missing data — it must render as 0, not collapse to null.
      const result = getField().resolve!(
        {
          ...nullStats,
          defense: {
            g: 16,
            sacks: 0,
            int: 0,
            fumRec: 0,
            defTd: 0,
            safeties: 0,
            ptsAllowedPerG: 18,
            ydsAllowedPerG: 320,
          },
        },
        {},
        mockContext,
        undefined as never,
      );
      expect(result).toBe(0);
    });

    it('returns 0 (not null) for an IDP row with no scoring plays', () => {
      // A present IDP row with zero scoring stats is a valid 0-point total.
      const result = getField().resolve!(
        {
          ...nullStats,
          idp: {
            g: 16,
            soloTkl: 0,
            astTkl: 0,
            totalTkl: 0,
            sacks: 0,
            int: 0,
            pd: 0,
            ff: 0,
            fr: 0,
            defTd: 0,
            safeties: 0,
          },
        },
        {},
        mockContext,
        undefined as never,
      );
      expect(result).toBe(0);
    });

    it('computes IDP fantasy points from idp stats', () => {
      // 10 soloTkl × 1 + 5 astTkl × 0.5 + 2 sacks × 2 + 1 INT × 3 + 1 ff × 1 = 10+2.5+4+3+1 = 20.5
      const result = getField().resolve!(
        {
          ...nullStats,
          idp: {
            g: 16,
            soloTkl: 10,
            astTkl: 5,
            totalTkl: 15,
            sacks: 2,
            int: 1,
            pd: 0,
            ff: 1,
            fr: 0,
            defTd: 0,
            safeties: 0,
          },
        },
        {},
        mockContext,
        undefined as never,
      );
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);
    });

    it('computes offensive fantasy points summing passing, rushing, and receiving', () => {
      // Passing: 4000 yds × 0.04 + 30 td × 4 + (-10) int × -2 = 160 + 120 + 20 = 300
      // Rushing: 100 yds × 0.1 + 1 td × 6 = 16
      const result = getField().resolve!(
        {
          ...nullStats,
          passing: {
            g: 16,
            cmp: 350,
            att: 550,
            yds: 4000,
            td: 30,
            int: 10,
            sacked: null,
            sackYds: null,
            rating: 102,
          },
          rushing: {
            g: 16,
            att: 30,
            yds: 100,
            td: 1,
            lng: null,
            fumbles: null,
          },
        },
        {},
        mockContext,
        undefined as never,
      );
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);
    });

    it('computes kicking fantasy points', () => {
      // 30 fgm × 3 + 5 fg50m × 5 + 28 xpm × 1 = 90 + 25 + 28 = 143
      const result = getField().resolve!(
        {
          ...nullStats,
          kicking: {
            g: 16,
            fgm: 30,
            fga: 32,
            fg019m: 2,
            fg019a: 2,
            fg2029m: 5,
            fg2029a: 5,
            fg3039m: 8,
            fg3039a: 8,
            fg4049m: 10,
            fg4049a: 11,
            fg50m: 5,
            fg50a: 6,
            xpm: 28,
            xpa: 30,
            lng: null,
          },
        },
        {},
        mockContext,
        undefined as never,
      );
      expect(result).toBe(143);
    });
  });

  describe('FootballCareerKicking type (LS-6244)', () => {
    it('exposes a server-computed fgPct field', () => {
      const type = schema.getType('FootballCareerKicking') as GraphQLObjectType;
      const field = type.getFields().fgPct;
      expect(field).toBeDefined();
      expect(field?.resolve).toBeDefined();
    });

    it('computes fgPct from fgm/fga rounded to 1 decimal', () => {
      const type = schema.getType('FootballCareerKicking') as GraphQLObjectType;
      const field = type.getFields().fgPct;

      // 25/30 = 83.33% → 83.3 (single source of truth, no client recompute)
      expect(
        field.resolve!(
          { fgm: 25, fga: 30 },
          {},
          mockContext,
          undefined as never,
        ),
      ).toBe(83.3);
    });

    it('returns null fgPct when there are no attempts', () => {
      const type = schema.getType('FootballCareerKicking') as GraphQLObjectType;
      const field = type.getFields().fgPct;

      expect(
        field.resolve!({ fgm: 0, fga: 0 }, {}, mockContext, undefined as never),
      ).toBeNull();
      expect(
        field.resolve!(
          { fgm: null, fga: null },
          {},
          mockContext,
          undefined as never,
        ),
      ).toBeNull();
    });
  });

  // ── nflTeamSeasonMetadata (LS-8044) ─────────────────────────────────────────

  describe('nflTeamSeasonMetadata query', () => {
    function getResolver() {
      const queryType = schema.getQueryType();
      const field = queryType?.getFields().nflTeamSeasonMetadata;
      if (!field?.resolve)
        throw new Error('nflTeamSeasonMetadata resolver not found');
      return field.resolve.bind(field);
    }

    it('exists in schema with correct return type', () => {
      const queryType = schema.getQueryType();
      const field = queryType?.getFields().nflTeamSeasonMetadata;
      expect(field).toBeDefined();
      // [NflTeamSeasonMetadata!]! — outer NonNull wrapping a list
      expect('ofType' in (field?.type ?? {})).toBe(true);
    });

    it('NflTeamSeasonMetadata type exposes teamAbbreviation, season, byeWeek, sosTier fields', () => {
      const type = schema.getType('NflTeamSeasonMetadata') as GraphQLObjectType;
      expect(type).toBeDefined();
      const fields = type.getFields();
      expect(fields.teamAbbreviation).toBeDefined();
      expect(fields.season).toBeDefined();
      expect(fields.byeWeek).toBeDefined();
      expect(fields.sosTier).toBeDefined();
    });

    it('teamAbbreviation, season, byeWeek, sosTier are all non-nullable', () => {
      const type = schema.getType('NflTeamSeasonMetadata') as GraphQLObjectType;
      const fields = type.getFields();
      // Duck-type NonNull check (avoids duplicate graphql instance false negatives)
      expect('ofType' in fields.teamAbbreviation.type).toBe(true);
      expect('ofType' in fields.season.type).toBe(true);
      expect('ofType' in fields.byeWeek.type).toBe(true);
      expect('ofType' in fields.sosTier.type).toBe(true);
    });

    it('SosTier enum exists with easy, medium, hard values', () => {
      const enumType = schema.getType('SosTier');
      expect(enumType).toBeDefined();
    });

    it('returns team rows for an explicit season', async () => {
      const rows = [
        { teamAbbreviation: 'ARI', season: 2025, byeWeek: 11, tier: 'easy' },
        { teamAbbreviation: 'ATL', season: 2025, byeWeek: 12, tier: 'hard' },
      ];
      mockDb.then.mockImplementationOnce((resolve: (v: unknown) => void) =>
        resolve(rows),
      );

      const result = (await getResolver()(
        {},
        { season: 2025 },
        mockContext,
        undefined as never,
      )) as typeof rows;

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        teamAbbreviation: 'ARI',
        season: 2025,
        byeWeek: 11,
        tier: 'easy',
      });
    });

    it('returns empty array when no rows match the given season', async () => {
      mockDb.then.mockImplementationOnce((resolve: (v: unknown) => void) =>
        resolve([]),
      );

      const result = await getResolver()(
        {},
        { season: 9999 },
        mockContext,
        undefined as never,
      );

      expect(result).toEqual([]);
    });

    it('resolves current season via MAX when season arg is omitted', async () => {
      const rows = [
        { teamAbbreviation: 'BUF', season: 2025, byeWeek: 7, tier: 'medium' },
      ];
      // First query: MAX(season) → 2025
      mockDb.then.mockImplementationOnce((resolve: (v: unknown) => void) =>
        resolve([{ maxSeason: 2025 }]),
      );
      // Second query: rows for season 2025
      mockDb.then.mockImplementationOnce((resolve: (v: unknown) => void) =>
        resolve(rows),
      );

      const result = (await getResolver()(
        {},
        { season: null },
        mockContext,
        undefined as never,
      )) as typeof rows;

      // Two DB round-trips: MAX(season) lookup + data fetch
      expect(mockDb.then).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(1);
      expect(result[0].teamAbbreviation).toBe('BUF');
    });

    it('returns empty array when table is empty and season is omitted', async () => {
      // MAX(season) returns null (table is empty)
      mockDb.then.mockImplementationOnce((resolve: (v: unknown) => void) =>
        resolve([{ maxSeason: null }]),
      );

      const result = await getResolver()(
        {},
        { season: null },
        mockContext,
        undefined as never,
      );

      expect(result).toEqual([]);
      // Only the MAX query should run — no second query for data
      expect(mockDb.then).toHaveBeenCalledTimes(1);
    });

    it('sosTier resolver maps tier field on the parent object', () => {
      const type = schema.getType('NflTeamSeasonMetadata') as GraphQLObjectType;
      const sosTierField = type.getFields().sosTier;
      expect(sosTierField?.resolve).toBeDefined();

      const result = sosTierField.resolve!(
        { teamAbbreviation: 'KC', season: 2025, byeWeek: 6, tier: 'hard' },
        {},
        mockContext,
        undefined as never,
      );
      expect(result).toBe('hard');
    });
  });

  // ── footballPlayerLeagueAvailability (LS-7045) ───────────────────────────────

  describe('footballPlayerLeagueAvailability query', () => {
    function getResolver() {
      const queryType = schema.getQueryType();
      const field = queryType?.getFields().footballPlayerLeagueAvailability;
      if (!field?.resolve)
        throw new Error('footballPlayerLeagueAvailability resolver not found');
      return field.resolve.bind(field);
    }

    it('throws UNAUTHENTICATED when no user in context', async () => {
      mockContext.user = null;

      await expect(
        getResolver()(
          {},
          { playerIds: [1], leagueIds: [1] },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
    });

    it('throws PREMIUM_REQUIRED when called by a free-tier user', async () => {
      mockDb.then.mockImplementationOnce((resolve: (v: unknown[]) => void) =>
        resolve([{ tier: 'free' }]),
      );

      await expect(
        getResolver()(
          {},
          { playerIds: [1], leagueIds: [1] },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({ extensions: { code: 'PREMIUM_REQUIRED' } });
    });

    it('returns empty array when playerIds is empty', async () => {
      // Tier lookup must succeed first
      mockDb.then.mockImplementationOnce((resolve: (v: unknown[]) => void) =>
        resolve([{ tier: 'premium' }]),
      );
      // requireEntitlement(advanced_search_filters) reads the JWT-claim
      // entitlements array (LS-8643), not the DB tier row mocked above.
      mockContext.user = {
        id: 1,
        isAdmin: false,
        entitlements: [ENTITLEMENTS.advanced_search_filters],
      };

      const result = await getResolver()(
        {},
        { playerIds: [], leagueIds: [1] },
        mockContext,
        undefined as never,
      );
      expect(result).toEqual([]);
      // Only the tier lookup DB call should have run
      expect(mockDb.then).toHaveBeenCalledTimes(1);
    });

    it('returns empty array when leagueIds is empty', async () => {
      mockDb.then.mockImplementationOnce((resolve: (v: unknown[]) => void) =>
        resolve([{ tier: 'premium' }]),
      );
      mockContext.user = {
        id: 1,
        isAdmin: false,
        entitlements: [ENTITLEMENTS.advanced_search_filters],
      };

      const result = await getResolver()(
        {},
        { playerIds: [1], leagueIds: [] },
        mockContext,
        undefined as never,
      );
      expect(result).toEqual([]);
      expect(mockDb.then).toHaveBeenCalledTimes(1);
    });

    it('returns empty array when none of the leagueIds belong to the user', async () => {
      // Augment mock with innerJoin for the leagues+leagueMembers join
      (mockDb as Record<string, unknown>).innerJoin = jest
        .fn()
        .mockReturnThis();
      // Tier lookup → premium
      mockDb.then.mockImplementationOnce((resolve: (v: unknown[]) => void) =>
        resolve([{ tier: 'premium' }]),
      );
      // League membership query → none found
      mockDb.then.mockImplementationOnce((resolve: (v: unknown[]) => void) =>
        resolve([]),
      );
      mockContext.user = {
        id: 1,
        isAdmin: false,
        entitlements: [ENTITLEMENTS.advanced_search_filters],
      };

      const result = await getResolver()(
        {},
        { playerIds: [10, 20], leagueIds: [99] },
        mockContext,
        undefined as never,
      );

      expect(result).toEqual([]);
      // Tier lookup + league query; team_members query must not run
      expect(mockDb.then).toHaveBeenCalledTimes(2);
    });

    it('returns availability matrix when user owns leagues', async () => {
      (mockDb as Record<string, unknown>).innerJoin = jest
        .fn()
        .mockReturnThis();

      // Tier lookup → premium
      mockDb.then.mockImplementationOnce((resolve: (v: unknown[]) => void) =>
        resolve([{ tier: 'premium' }]),
      );
      // League membership check → user owns league 5 named "Keeper"
      mockDb.then.mockImplementationOnce((resolve: (v: unknown[]) => void) =>
        resolve([{ id: 5, name: 'Keeper' }]),
      );
      // team_members → player 10 is already rostered in league 5
      mockDb.then.mockImplementationOnce((resolve: (v: unknown[]) => void) =>
        resolve([{ playerId: 10, leagueId: 5 }]),
      );
      mockContext.user = {
        id: 1,
        isAdmin: false,
        entitlements: [ENTITLEMENTS.advanced_search_filters],
      };

      const result = (await getResolver()(
        {},
        { playerIds: [10, 20], leagueIds: [5] },
        mockContext,
        undefined as never,
      )) as Array<{
        playerId: number;
        leagueId: number;
        leagueName: string;
        isAvailable: boolean;
      }>;

      expect(result).toHaveLength(2);
      expect(result).toContainEqual({
        playerId: 10,
        leagueId: 5,
        leagueName: 'Keeper',
        isAvailable: false,
      });
      expect(result).toContainEqual({
        playerId: 20,
        leagueId: 5,
        leagueName: 'Keeper',
        isAvailable: true,
      });
    });
  });
});
