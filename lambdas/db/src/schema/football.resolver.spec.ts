import {
  type GraphQLObjectType,
  type GraphQLSchema,
  isNonNullType,
} from 'graphql';

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
  injuriesLastSyncedAt: Date | null;
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
          jerseyNumber: 'jerseyNumber',
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
      const syncedAt = new Date('2026-06-11T12:00:00.000Z');
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
            injuriesLastSyncedAt: syncedAt,
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
        injuriesLastSyncedAt: syncedAt,
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

  // ── injuriesLastSyncedAt field (LS-6251 / FPD-027) ──────────────────────────

  describe('FootballPlayer.injuriesLastSyncedAt field', () => {
    function getField() {
      const type = schema.getType('FootballPlayer') as GraphQLObjectType;
      const field = type.getFields().injuriesLastSyncedAt;
      if (!field?.resolve) {
        throw new Error('injuriesLastSyncedAt resolver not found');
      }
      return field;
    }

    it('is exposed on the FootballPlayer type', () => {
      expect(getField()).toBeDefined();
    });

    it('serializes a Date to an ISO-8601 string', () => {
      const syncedAt = new Date('2026-06-11T12:00:00.000Z');
      const result = getField().resolve!(
        { injuriesLastSyncedAt: syncedAt },
        {},
        mockContext,
        undefined as never,
      );
      expect(result).toBe('2026-06-11T12:00:00.000Z');
    });

    it('resolves to null when never synced', () => {
      const result = getField().resolve!(
        { injuriesLastSyncedAt: null },
        {},
        mockContext,
        undefined as never,
      );
      expect(result).toBeNull();
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

      expect(isNonNullType(fields.week.type)).toBe(true);
      expect(isNonNullType(fields.isBye.type)).toBe(true);
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

    // The IDP career table is the only mocked career table with a distinct
    // shape; the four offensive tables and the team-defense table share the
    // `{ playerId }` mock, so we assert on `from` call counts for those.
    const idpTableMatcher = expect.objectContaining({ soloTkl: 'soloTkl' });

    it('throws UNAUTHENTICATED when no user in context', async () => {
      mockContext.user = null;

      await expect(
        getResolver()(basePlayer, {}, mockContext, undefined as never),
      ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
    });

    it('reads only the four offensive/kicking tables for a QB', async () => {
      await getResolver()(
        { ...basePlayer, position: 'QB' },
        {},
        mockContext,
        undefined as never,
      );

      expect(mockDb.from).toHaveBeenCalledTimes(4);
      expect(mockDb.from).not.toHaveBeenCalledWith(idpTableMatcher);
    });

    it('reads only the four offensive/kicking tables for a kicker', async () => {
      await getResolver()(
        { ...basePlayer, position: 'K' },
        {},
        mockContext,
        undefined as never,
      );

      expect(mockDb.from).toHaveBeenCalledTimes(4);
      expect(mockDb.from).not.toHaveBeenCalledWith(idpTableMatcher);
    });

    it('reads only the team-defense table for a DST', async () => {
      await getResolver()(
        { ...basePlayer, isDst: true, position: 'DST' },
        {},
        mockContext,
        undefined as never,
      );

      expect(mockDb.from).toHaveBeenCalledTimes(1);
      expect(mockDb.from).not.toHaveBeenCalledWith(idpTableMatcher);
    });

    it('reads only the IDP table for an individual defender', async () => {
      await getResolver()(
        { ...basePlayer, position: 'DL' },
        {},
        mockContext,
        undefined as never,
      );

      expect(mockDb.from).toHaveBeenCalledTimes(1);
      expect(mockDb.from).toHaveBeenCalledWith(idpTableMatcher);
    });

    it('falls back to the offensive/kicking tables when position is null', async () => {
      await getResolver()(
        { ...basePlayer, position: null },
        {},
        mockContext,
        undefined as never,
      );

      expect(mockDb.from).toHaveBeenCalledTimes(4);
      expect(mockDb.from).not.toHaveBeenCalledWith(idpTableMatcher);
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
});
