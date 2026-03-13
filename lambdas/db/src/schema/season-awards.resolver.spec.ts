/**
 * Unit tests for the season-awards GraphQL resolver (LS-743).
 *
 * Covers:
 *   - leagueSeasonAwards query: auth check, returns awards, season filter
 *   - upsertLeagueSeasonAward mutation: auth, commissioner check, validation, insert
 *   - deleteLeagueSeasonAward mutation: auth, commissioner check, delete
 */

import type { GraphQLSchema } from 'graphql';

describe('season-awards resolver', () => {
  let schema: GraphQLSchema;
  let mockDb: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    innerJoin: jest.Mock;
    orderBy: jest.Mock;
    limit: jest.Mock;
    insert: jest.Mock;
    values: jest.Mock;
    onConflictDoUpdate: jest.Mock;
    returning: jest.Mock;
    delete: jest.Mock;
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
      innerJoin: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      onConflictDoUpdate: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      // Make the mock thenable - used when no explicit terminal call (e.g. orderBy is last)
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

    jest.doMock('drizzle-orm', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
      const actual =
        jest.requireActual<typeof import('drizzle-orm')>('drizzle-orm');
      return { ...actual, eq: jest.fn(actual.eq), and: jest.fn(actual.and) };
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
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

  // ── leagueSeasonAwards query ───────────────────────────────────────────────

  describe('leagueSeasonAwards query', () => {
    function getResolver() {
      const queryType = schema.getQueryType();
      const field = queryType?.getFields().leagueSeasonAwards;
      if (!field?.resolve)
        throw new Error('leagueSeasonAwards resolver not found');
      return field.resolve.bind(field);
    }

    it('throws UNAUTHENTICATED when no user is in context', async () => {
      mockContext.user = null;

      await expect(
        getResolver()(
          {},
          { leagueId: 1, season: null },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
    });

    it('returns empty array when no awards exist', async () => {
      // orderBy is the final call — make then resolve with empty array
      mockDb.then = jest.fn((resolve) => resolve([]));

      const result = await getResolver()(
        {},
        { leagueId: 1, season: null },
        mockContext,
        undefined as never,
      );

      expect(result).toEqual([]);
    });

    it('returns awards for a league mapped with Date objects', async () => {
      const now = new Date('2024-01-01T00:00:00Z');
      const rawRow = {
        id: 1,
        leagueId: 1,
        season: 2024,
        playerId: 42,
        awardType: 'mvp',
        notes: 'Outstanding season',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        playerFirstName: 'Mike',
        playerLastName: 'Trout',
      };

      mockDb.then = jest.fn((resolve) => resolve([rawRow]));

      const result = (await getResolver()(
        {},
        { leagueId: 1, season: null },
        mockContext,
        undefined as never,
      )) as {
        id: number;
        createdAt: Date;
        updatedAt: Date;
        awardType: string;
      }[];

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
      expect(result[0].awardType).toBe('mvp');
      // Dates should be coerced to Date objects
      expect(result[0].createdAt).toBeInstanceOf(Date);
      expect(result[0].updatedAt).toBeInstanceOf(Date);
    });

    it('applies a season filter when season arg is provided', async () => {
      mockDb.then = jest.fn((resolve) => resolve([]));

      await getResolver()(
        {},
        { leagueId: 1, season: 2023 },
        mockContext,
        undefined as never,
      );

      // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
      const { eq, and } = require('drizzle-orm') as {
        eq: jest.Mock;
        and: jest.Mock;
      };

      // eq was called with the season column + value
      expect(eq).toHaveBeenCalledWith('season', 2023);

      // and() received two conditions (leagueId + season), proving the
      // season branch pushed a second condition into the array.
      expect(and).toHaveBeenCalledWith(expect.anything(), expect.anything());

      // The combined condition from and() was actually passed to where(),
      // so the filter is applied to the query — not just constructed.
      const andResults = and.mock.results;
      const andResult = andResults[andResults.length - 1]?.value;
      expect(mockDb.where).toHaveBeenCalledWith(andResult);
    });
  });

  // ── upsertLeagueSeasonAward mutation ──────────────────────────────────────

  describe('upsertLeagueSeasonAward mutation', () => {
    function getResolver() {
      const mutationType = schema.getMutationType();
      const field = mutationType?.getFields().upsertLeagueSeasonAward;
      if (!field?.resolve)
        throw new Error('upsertLeagueSeasonAward resolver not found');
      return field.resolve.bind(field);
    }

    const validInput = {
      leagueId: 1,
      season: 2024,
      playerId: 42,
      awardType: 'mvp',
      notes: null,
    };

    it('throws UNAUTHENTICATED when no user is in context', async () => {
      mockContext.user = null;

      await expect(
        getResolver()(
          {},
          { input: validInput },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
    });

    it('throws an error for an invalid awardType', async () => {
      await expect(
        getResolver()(
          {},
          { input: { ...validInput, awardType: 'invalid_award' } },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow(/Invalid awardType/);
    });

    it('throws FORBIDDEN when user is not a member of the league', async () => {
      // All modeled permissionLevel values (commissioner/general_manager/assistant_manager)
      // are treated as commissioner-or-owner, so the FORBIDDEN path is reached when
      // verifyLeagueMembership finds no matching membership row (limit returns []).
      mockDb.limit.mockResolvedValueOnce([]); // Not a member at all

      await expect(
        getResolver()(
          {},
          { input: validInput },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({ extensions: { code: 'FORBIDDEN' } });
    });

    it('inserts a new award and returns it for a commissioner', async () => {
      const now = new Date('2024-06-01T00:00:00Z');
      const insertedRow = {
        id: 10,
        leagueId: 1,
        season: 2024,
        playerId: 42,
        awardType: 'mvp',
        notes: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      // sequence: 1) commissioner membership check, 2) player name fetch
      mockDb.limit
        .mockResolvedValueOnce([
          {
            leagueId: 1,
            userId: 1,
            teamId: null,
            permissionLevel: 'commissioner',
          },
        ])
        .mockResolvedValueOnce([{ firstName: 'Mike', lastName: 'Trout' }]);

      mockDb.returning.mockResolvedValueOnce([insertedRow]);

      const result = (await getResolver()(
        {},
        { input: validInput },
        mockContext,
        undefined as never,
      )) as {
        id: number;
        playerFirstName: string;
        playerLastName: string;
        awardType: string;
      };

      expect(result.id).toBe(10);
      expect(result.awardType).toBe('mvp');
      expect(result.playerFirstName).toBe('Mike');
      expect(result.playerLastName).toBe('Trout');
    });

    it('falls back to empty string for player name when player not found', async () => {
      const now = new Date('2024-06-01T00:00:00Z');
      const insertedRow = {
        id: 11,
        leagueId: 1,
        season: 2024,
        playerId: 99,
        awardType: 'cy_young',
        notes: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      mockDb.limit
        .mockResolvedValueOnce([
          {
            leagueId: 1,
            userId: 1,
            teamId: null,
            permissionLevel: 'general_manager',
          },
        ])
        .mockResolvedValueOnce([]); // Player not found

      mockDb.returning.mockResolvedValueOnce([insertedRow]);

      const result = (await getResolver()(
        {},
        { input: { ...validInput, playerId: 99, awardType: 'cy_young' } },
        mockContext,
        undefined as never,
      )) as { playerFirstName: string; playerLastName: string };

      expect(result.playerFirstName).toBe('');
      expect(result.playerLastName).toBe('');
    });
  });

  // ── deleteLeagueSeasonAward mutation ─────────────────────────────────────

  describe('deleteLeagueSeasonAward mutation', () => {
    function getResolver() {
      const mutationType = schema.getMutationType();
      const field = mutationType?.getFields().deleteLeagueSeasonAward;
      if (!field?.resolve)
        throw new Error('deleteLeagueSeasonAward resolver not found');
      return field.resolve.bind(field);
    }

    it('throws UNAUTHENTICATED when no user is in context', async () => {
      mockContext.user = null;

      await expect(
        getResolver()(
          {},
          { leagueId: 1, season: 2024, awardType: 'mvp' },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
    });

    it('throws FORBIDDEN when user is not a member', async () => {
      mockDb.limit.mockResolvedValueOnce([]); // Not a member

      await expect(
        getResolver()(
          {},
          { leagueId: 1, season: 2024, awardType: 'mvp' },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({ extensions: { code: 'FORBIDDEN' } });
    });

    it('returns true when award is successfully deleted', async () => {
      mockDb.limit.mockResolvedValueOnce([
        {
          leagueId: 1,
          userId: 1,
          teamId: null,
          permissionLevel: 'commissioner',
        },
      ]);

      // delete chain resolves via then
      mockDb.then = jest.fn((resolve) => resolve(undefined));

      const result = await getResolver()(
        {},
        { leagueId: 1, season: 2024, awardType: 'mvp' },
        mockContext,
        undefined as never,
      );

      expect(result).toBe(true);
      expect(mockDb.delete).toHaveBeenCalled();
    });
  });
});
