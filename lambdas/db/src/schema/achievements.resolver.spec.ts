/**
 * Unit tests for the achievements GraphQL resolver (LS-737).
 *
 * Covers:
 *   - achievementRestrictions query: auth, empty list, returns rows
 *   - upsertAchievementRestriction mutation: auth, invalid type, forbidden, success
 *   - deleteAchievementRestriction mutation: auth, forbidden, success
 */

import type { GraphQLSchema } from 'graphql';

describe('achievements resolver', () => {
  let schema: GraphQLSchema;
  let mockDb: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
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
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      onConflictDoUpdate: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      then: jest.fn((resolve) => resolve([])),
    };

    jest.doMock('@legacy-sports/utils/node', () => ({
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
      BADGE_DEFINITIONS: [],
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
        },
        players: { id: 'id', firstName: 'firstName', lastName: 'lastName' },
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
        matchupPlayerGames: { matchupPlayerId: 'matchupPlayerId' },
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
        leagueAchievementRestrictions: {
          id: 'id',
          leagueId: 'leagueId',
          achievementType: 'achievementType',
          isRepeatable: 'isRepeatable',
          playerMinCount: 'playerMinCount',
          rosterMin: 'rosterMin',
          rosterMax: 'rosterMax',
          repeatableRosterMax: 'repeatableRosterMax',
          createdAt: 'createdAt',
          updatedAt: 'updatedAt',
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

    mockContext = {
      user: { id: 1, isAdmin: false },
      db: mockDb,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── achievementRestrictions query ─────────────────────────────────────────

  describe('achievementRestrictions query', () => {
    function getResolver() {
      const field = schema.getQueryType()?.getFields().achievementRestrictions;
      if (!field?.resolve)
        throw new Error('achievementRestrictions resolver not found');
      return field.resolve.bind(field);
    }

    it('throws UNAUTHENTICATED when no user in context', async () => {
      mockContext.user = null;
      await expect(
        getResolver()({}, { leagueId: 1 }, mockContext, undefined as never),
      ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
    });

    it('returns an empty array when no restrictions are configured', async () => {
      mockDb.then = jest.fn((resolve) => resolve([]));
      const result = await getResolver()(
        {},
        { leagueId: 1 },
        mockContext,
        undefined as never,
      );
      expect(result).toEqual([]);
    });

    it('returns mapped achievement restrictions', async () => {
      const now = new Date('2024-01-01').toISOString();
      const rows = [
        {
          id: 1,
          leagueId: 1,
          achievementType: 'hall_of_fame',
          isRepeatable: false,
          playerMinCount: null,
          rosterMin: 1,
          rosterMax: 3,
          repeatableRosterMax: null,
          createdAt: now,
          updatedAt: now,
        },
      ];
      mockDb.then = jest.fn((resolve) => resolve(rows));

      const result = (await getResolver()(
        {},
        { leagueId: 1 },
        mockContext,
        undefined as never,
      )) as { id: number; achievementType: string; createdAt: Date }[];

      expect(result).toHaveLength(1);
      expect(result[0].achievementType).toBe('hall_of_fame');
      expect(result[0].createdAt).toBeInstanceOf(Date);
    });
  });

  // ── upsertAchievementRestriction mutation ─────────────────────────────────

  describe('upsertAchievementRestriction mutation', () => {
    function getResolver() {
      const field = schema
        .getMutationType()
        ?.getFields().upsertAchievementRestriction;
      if (!field?.resolve)
        throw new Error('upsertAchievementRestriction resolver not found');
      return field.resolve.bind(field);
    }

    const validInput = {
      leagueId: 1,
      achievementType: 'hall_of_fame',
      playerMinCount: null,
      rosterMin: 1,
      rosterMax: 3,
      repeatableRosterMax: null,
    };

    it('throws UNAUTHENTICATED when no user in context', async () => {
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

    it('throws when achievementType is invalid', async () => {
      await expect(
        getResolver()(
          {},
          { input: { ...validInput, achievementType: 'invalid_type' } },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('Invalid achievementType');
    });

    it('throws FORBIDDEN when user is not a member of the league', async () => {
      mockDb.limit.mockResolvedValueOnce([]); // no membership
      await expect(
        getResolver()(
          {},
          { input: validInput },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({ extensions: { code: 'FORBIDDEN' } });
    });

    it('creates the restriction and returns the row', async () => {
      const now = new Date().toISOString();
      const insertedRow = {
        id: 5,
        leagueId: 1,
        achievementType: 'hall_of_fame',
        isRepeatable: false,
        playerMinCount: null,
        rosterMin: 1,
        rosterMax: 3,
        repeatableRosterMax: null,
        createdAt: now,
        updatedAt: now,
      };

      mockDb.limit.mockResolvedValueOnce([{ permissionLevel: 'commissioner' }]);
      // .insert().values().onConflictDoUpdate().returning() — terminal is returning() → uses then
      mockDb.then = jest.fn((resolve) => resolve([insertedRow]));

      const result = (await getResolver()(
        {},
        { input: validInput },
        mockContext,
        undefined as never,
      )) as { id: number; achievementType: string };

      expect(result.id).toBe(5);
      expect(result.achievementType).toBe('hall_of_fame');
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.returning).toHaveBeenCalled();
    });
  });

  // ── deleteAchievementRestriction mutation ─────────────────────────────────

  describe('deleteAchievementRestriction mutation', () => {
    function getResolver() {
      const field = schema
        .getMutationType()
        ?.getFields().deleteAchievementRestriction;
      if (!field?.resolve)
        throw new Error('deleteAchievementRestriction resolver not found');
      return field.resolve.bind(field);
    }

    it('throws UNAUTHENTICATED when no user in context', async () => {
      mockContext.user = null;
      await expect(
        getResolver()(
          {},
          { leagueId: 1, achievementType: 'hall_of_fame' },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
    });

    it('throws FORBIDDEN when user is not a member of the league', async () => {
      mockDb.limit.mockResolvedValueOnce([]); // no membership
      await expect(
        getResolver()(
          {},
          { leagueId: 1, achievementType: 'hall_of_fame' },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({ extensions: { code: 'FORBIDDEN' } });
    });

    it('deletes the restriction and returns true', async () => {
      mockDb.limit.mockResolvedValueOnce([{ permissionLevel: 'commissioner' }]);

      const result = await getResolver()(
        {},
        { leagueId: 1, achievementType: 'hall_of_fame' },
        mockContext,
        undefined as never,
      );

      expect(result).toBe(true);
      expect(mockDb.delete).toHaveBeenCalled();
    });
  });
});
