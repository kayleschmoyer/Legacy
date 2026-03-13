/**
 * Unit tests for the leagueActivity GraphQL query resolver (LS-740).
 *
 * Covers:
 *   - Authentication enforcement (unauthenticated request throws)
 *   - League membership enforcement (non-member request throws)
 *   - Returns paginated activity feed for a league member
 *   - Default limit and cap at 100
 *   - Optional eventTypes filter
 */

import type { GraphQLSchema } from 'graphql';

describe('leagueActivity resolver', () => {
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
    loaders: { users: { load: jest.Mock } };
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

    jest.doMock('@legacy-sports/utils', () => ({
      getDbOptions: jest.fn(() => ({})),
    }));

    jest.doMock('@legacy-sports/db-client', () => ({
      createDatabaseService: jest.fn(() => ({
        statistics: { getOnThisDay: jest.fn(), getOnThisDayEvents: jest.fn() },
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
        getTeamBadges: jest.fn().mockResolvedValue([]),
        getUserBadgeProgress: jest.fn().mockResolvedValue([]),
        evaluateDraftBadges: jest.fn().mockResolvedValue([]),
        evaluateMatchupBadges: jest.fn().mockResolvedValue([]),
        awardLeagueChampion: jest.fn().mockResolvedValue(undefined),
        awardPlayoffAppearances: jest.fn().mockResolvedValue(undefined),
      })),
      PublicSchema: {
        leagues: {
          id: 'id',
          name: 'name',
          currentWeek: 'currentWeek',
          currentMatchup: 'currentMatchup',
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
        leagueActivityLog: {
          id: 'id',
          leagueId: 'leagueId',
          teamId: 'teamId',
          actorUserId: 'actorUserId',
          eventType: 'eventType',
          payload: 'payload',
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

    jest.doMock('drizzle-orm', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
      const actual =
        jest.requireActual<typeof import('drizzle-orm')>('drizzle-orm');
      return {
        ...actual,
        eq: jest.fn(actual.eq),
        and: jest.fn(actual.and),
        inArray: jest.fn(actual.inArray),
      };
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
    const schemaModule = require('../schema') as { schema: GraphQLSchema };
    schema = schemaModule.schema;

    mockContext = {
      user: { id: 1, isAdmin: false },
      db: mockDb,
      loaders: { users: { load: jest.fn() } },
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function getResolver() {
    const queryType = schema.getQueryType();
    const field = queryType?.getFields().leagueActivity;
    if (!field?.resolve) throw new Error('leagueActivity resolver not found');
    return field.resolve.bind(field);
  }

  it('throws UNAUTHENTICATED when no user is in context', async () => {
    mockContext.user = null;

    await expect(
      getResolver()(
        {},
        { leagueId: 1, limit: 20, eventTypes: null },
        mockContext,
        undefined as never,
      ),
    ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
  });

  it('throws FORBIDDEN when the user is not a league member', async () => {
    // Membership check returns empty array
    mockDb.limit.mockResolvedValueOnce([]);

    await expect(
      getResolver()(
        {},
        { leagueId: 1, limit: 20, eventTypes: null },
        mockContext,
        undefined as never,
      ),
    ).rejects.toMatchObject({ extensions: { code: 'FORBIDDEN' } });
  });

  it('returns an empty feed when no activity exists', async () => {
    // Membership check succeeds
    mockDb.limit
      .mockResolvedValueOnce([{ id: 1 }])
      // Activity fetch returns empty
      .mockResolvedValueOnce([]);

    const result = await getResolver()(
      {},
      { leagueId: 1, limit: 20, eventTypes: null },
      mockContext,
      undefined as never,
    );

    expect(result).toEqual([]);
  });

  it('returns mapped activity events for a league member', async () => {
    const now = new Date('2024-06-01T12:00:00Z');
    const rawRow = {
      id: 42,
      leagueId: 1,
      teamId: 5,
      actorUserId: 7,
      eventType: 'trade_accepted',
      payload: { tradeId: 99 },
      occurredAt: now,
    };

    mockDb.limit
      .mockResolvedValueOnce([{ id: 1 }]) // membership check
      .mockResolvedValueOnce([rawRow]); // activity fetch

    const result = (await getResolver()(
      {},
      { leagueId: 1, limit: 20, eventTypes: null },
      mockContext,
      undefined as never,
    )) as {
      id: number;
      leagueId: number;
      teamId: number | null;
      actorUserId: number | null;
      eventType: string;
      payload: Record<string, unknown>;
      occurredAt: string;
    }[];

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 42,
      leagueId: 1,
      teamId: 5,
      actorUserId: 7,
      eventType: 'trade_accepted',
    });
    // occurredAt should be serialised to ISO string
    expect(result[0].occurredAt).toBe(now.toISOString());
  });

  it('uses a default limit of 20 when limit is null', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([]);

    await getResolver()(
      {},
      { leagueId: 1, limit: null, eventTypes: null },
      mockContext,
      undefined as never,
    );

    // The second limit() call should be called with 20
    expect(mockDb.limit).toHaveBeenNthCalledWith(2, 20);
  });

  it('caps the limit at 100 for large values', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([]);

    await getResolver()(
      {},
      { leagueId: 1, limit: 9999, eventTypes: null },
      mockContext,
      undefined as never,
    );

    expect(mockDb.limit).toHaveBeenNthCalledWith(2, 100);
  });

  it('maps a null teamId / actorUserId row correctly', async () => {
    const rawRow = {
      id: 1,
      leagueId: 1,
      teamId: null,
      actorUserId: null,
      eventType: 'league_announcement',
      payload: { message: 'Hello!' },
      occurredAt: '2024-01-01T00:00:00Z',
    };

    mockDb.limit
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([rawRow]);

    const result = (await getResolver()(
      {},
      { leagueId: 1, limit: 20, eventTypes: null },
      mockContext,
      undefined as never,
    )) as { teamId: number | null; actorUserId: number | null }[];

    expect(result[0].teamId).toBeNull();
    expect(result[0].actorUserId).toBeNull();
  });

  it('returns multiple activity events in order', async () => {
    const rows = [
      {
        id: 3,
        leagueId: 1,
        teamId: null,
        actorUserId: 1,
        eventType: 'trade_proposed',
        payload: {},
        occurredAt: new Date('2024-06-03'),
      },
      {
        id: 2,
        leagueId: 1,
        teamId: null,
        actorUserId: 2,
        eventType: 'waiver_claimed',
        payload: {},
        occurredAt: new Date('2024-06-02'),
      },
      {
        id: 1,
        leagueId: 1,
        teamId: null,
        actorUserId: 1,
        eventType: 'draft_pick_made',
        payload: {},
        occurredAt: new Date('2024-06-01'),
      },
    ];

    mockDb.limit.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce(rows);

    const result = (await getResolver()(
      {},
      { leagueId: 1, limit: 20, eventTypes: null },
      mockContext,
      undefined as never,
    )) as { id: number }[];

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.id)).toEqual([3, 2, 1]);
  });

  it('applies inArray filter when eventTypes is a non-empty array', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([]);

    await getResolver()(
      {},
      {
        leagueId: 1,
        limit: 20,
        eventTypes: ['trade_accepted', 'waiver_claimed'],
      },
      mockContext,
      undefined as never,
    );

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
    const { inArray } = require('drizzle-orm') as { inArray: jest.Mock };
    expect(inArray).toHaveBeenCalledWith('eventType', [
      'trade_accepted',
      'waiver_claimed',
    ]);
  });

  it('does not apply inArray filter when eventTypes is an empty array', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([]);

    await getResolver()(
      {},
      { leagueId: 1, limit: 20, eventTypes: [] },
      mockContext,
      undefined as never,
    );

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
    const { inArray } = require('drizzle-orm') as { inArray: jest.Mock };
    expect(inArray).not.toHaveBeenCalled();
  });
});
