import type { GraphQLSchema } from 'graphql';

describe('Commissioner Tools Resolver', () => {
  let schema: GraphQLSchema;
  let mockDb: any;
  let mockContext: any;

  beforeEach(async () => {
    jest.resetModules();

    // Fluent Drizzle mock
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      then: jest.fn((resolve) => resolve([])),
    };

    jest.doMock('@legacy-sports/utils', () => ({
      getDbOptions: jest.fn(() => ({})),
    }));

    jest.doMock('@legacy-sports/scoring', () => ({
      calculateMatchupScore: jest.fn(() => ({
        team1Score: { totalScore: 150.5 },
        team2Score: { totalScore: 120.75 },
        gamesPerMatchup: 5,
      })),
      getDefaultScoringSettings: jest.fn(() => ({
        batting: {},
        pitching: {},
        fielding: {},
      })),
    }));

    jest.doMock('@legacy-sports/db-client', () => ({
      createDatabaseService: jest.fn(),
      runWithPublicClient: jest.fn(
        async (_opts: unknown, cb: (db: unknown) => unknown) => cb(mockDb),
      ),
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
      getMatchupPlayerGameStats: jest.fn().mockResolvedValue([]),
      getScoringMultipliersForLeague: jest.fn().mockResolvedValue({
        batting: { h: 1 },
        pitching: { w: 5 },
        fielding: { po: 0.1 },
      }),
      updateMatchupScore: jest.fn().mockResolvedValue({
        team1Score: '150.50',
        team2Score: '120.75',
      }),
      PublicSchema: {
        commissionerAuditLog: {
          id: 'id',
          leagueId: 'leagueId',
          userId: 'userId',
          action: 'action',
          targetType: 'targetType',
          targetId: 'targetId',
          details: 'details',
          reason: 'reason',
          createdAt: 'createdAt',
        },
        teamMembers: {
          id: 'id',
          teamId: 'teamId',
          leagueId: 'leagueId',
          playerId: 'playerId',
          positionId: 'positionId',
          acquisitionType: 'acquisitionType',
        },
        matchups: {
          id: 'id',
          leagueId: 'leagueId',
          team1Id: 'team1Id',
          team2Id: 'team2Id',
          team1Score: 'team1Score',
          team2Score: 'team2Score',
          weekNumber: 'weekNumber',
          updatedAt: 'updatedAt',
          status: 'status',
        },
        leagues: {
          id: 'id',
          name: 'name',
          lmNotes: 'lmNotes',
          updatedAt: 'updatedAt',
          isTeamLocked: 'isTeamLocked',
        },
        teams: {
          id: 'id',
          name: 'name',
          leagueId: 'leagueId',
          isLocked: 'isLocked',
          updatedAt: 'updatedAt',
        },
        leagueMembers: {
          leagueId: 'leagueId',
          userId: 'userId',
          teamId: 'teamId',
          permissionLevel: 'permissionLevel',
        },
        players: { id: 'id', firstName: 'firstName', lastName: 'lastName' },
        matchupPlayers: { id: 'id', matchupId: 'matchupId' },
        matchupPlayerGames: { matchupPlayerId: 'matchupPlayerId' },
        leagueWeekPlayerSeasons: { playerId: 'playerId', leagueId: 'leagueId' },
        leagueAchievementRestrictions: { id: 'id', leagueId: 'leagueId' },
        leagueSeasonAwards: { id: 'id', leagueId: 'leagueId' },
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
    }));

    jest.doMock('./authorization', () => ({
      ...jest.requireActual('./authorization'),
      verifyCommissionerAccess: jest
        .fn()
        .mockResolvedValue({ permissionLevel: 'commissioner' }),
    }));

    jest.doMock('../services/roster-service', () => ({
      addPlayerToRoster: jest.fn().mockResolvedValue(undefined),
      checkRosterCapacity: jest.fn().mockResolvedValue({ isFull: false }),
      isPlayerOnRoster: jest.fn().mockResolvedValue(false),
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
    const schemaModule = require('../schema') as { schema: GraphQLSchema };
    schema = schemaModule.schema;

    // Admin context bypasses commissioner access checks
    mockContext = {
      user: { id: 1, isAdmin: true },
      db: mockDb,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function getMutation(name: string) {
    const field = schema.getMutationType()?.getFields()[name];
    if (!field?.resolve) throw new Error(`${name} resolver not found`);
    return field.resolve;
  }

  function getQuery(name: string) {
    const field = schema.getQueryType()?.getFields()[name];
    if (!field?.resolve) throw new Error(`${name} resolver not found`);
    return field.resolve;
  }

  const unauthCtx = { user: null, db: null };

  // ── forceAddPlayer ─────────────────────────────────────────────────────────

  describe('forceAddPlayer mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('forceAddPlayer');
      await expect(
        resolver(
          {},
          { input: { leagueId: 1, teamId: 2, playerId: 10 } },
          unauthCtx,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it('returns success: false when player already on same team', async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 5, teamId: 2 }]);

      const resolver = getMutation('forceAddPlayer');
      const result = (await resolver(
        {},
        { input: { leagueId: 1, teamId: 2, playerId: 10 } },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.message).toContain('already on this team');
    });

    it('adds player to team when not on any roster', async () => {
      mockDb.limit.mockResolvedValueOnce([]); // not on any team

      const resolver = getMutation('forceAddPlayer');
      const result = (await resolver(
        {},
        { input: { leagueId: 1, teamId: 2, playerId: 10 } },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(result.success).toBe(true);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  // ── forceDropPlayer ────────────────────────────────────────────────────────

  describe('forceDropPlayer mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('forceDropPlayer');
      await expect(
        resolver(
          {},
          { input: { leagueId: 1, teamId: 2, playerId: 10 } },
          unauthCtx,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it('returns success: false when player not on team', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const resolver = getMutation('forceDropPlayer');
      const result = (await resolver(
        {},
        { input: { leagueId: 1, teamId: 2, playerId: 10 } },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.message).toContain('not on this team');
    });

    it('drops player when on team', async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 5 }]);

      const resolver = getMutation('forceDropPlayer');
      const result = (await resolver(
        {},
        { input: { leagueId: 1, teamId: 2, playerId: 10 } },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(result.success).toBe(true);
      expect(mockDb.delete).toHaveBeenCalled();
    });
  });

  // ── editMatchupScore ───────────────────────────────────────────────────────

  describe('editMatchupScore mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('editMatchupScore');
      await expect(
        resolver(
          {},
          { input: { matchupId: 1, team1Score: 100, team2Score: 95 } },
          unauthCtx,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it('returns success: false when matchup not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const resolver = getMutation('editMatchupScore');
      const result = (await resolver(
        {},
        { input: { matchupId: 999, team1Score: 100, team2Score: 95 } },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('updates matchup scores successfully', async () => {
      mockDb.limit.mockResolvedValueOnce([
        { id: 1, leagueId: 1, team1Score: '80', team2Score: '75' },
      ]);

      const resolver = getMutation('editMatchupScore');
      const result = (await resolver(
        {},
        { input: { matchupId: 1, team1Score: 100, team2Score: 95 } },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(result.success).toBe(true);
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalled();
    });
  });

  // ── swapMatchupTeams ───────────────────────────────────────────────────────

  describe('swapMatchupTeams mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('swapMatchupTeams');
      await expect(
        resolver(
          {},
          { input: { matchupId1: 1, matchupId2: 2 } },
          unauthCtx,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it('returns success: false when either matchup not found', async () => {
      mockDb.limit
        .mockResolvedValueOnce([]) // matchup 1 not found
        .mockResolvedValueOnce([
          { id: 2, leagueId: 1, team1Id: 3, team2Id: 4, weekNumber: 5 },
        ]);

      const resolver = getMutation('swapMatchupTeams');
      const result = (await resolver(
        {},
        { input: { matchupId1: 999, matchupId2: 2 } },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(result.success).toBe(false);
    });

    it('swaps teams between two matchups', async () => {
      mockDb.limit
        .mockResolvedValueOnce([
          { id: 1, leagueId: 1, team1Id: 1, team2Id: 2, weekNumber: 3 },
        ])
        .mockResolvedValueOnce([
          { id: 2, leagueId: 1, team1Id: 3, team2Id: 4, weekNumber: 4 },
        ]);

      const resolver = getMutation('swapMatchupTeams');
      const result = (await resolver(
        {},
        { input: { matchupId1: 1, matchupId2: 2 } },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(result.success).toBe(true);
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  // ── updateCommissionerNote ─────────────────────────────────────────────────

  describe('updateCommissionerNote mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('updateCommissionerNote');
      await expect(
        resolver(
          {},
          { input: { leagueId: 1, note: 'hello' } },
          unauthCtx,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it('updates commissioner note successfully', async () => {
      const resolver = getMutation('updateCommissionerNote');
      const result = (await resolver(
        {},
        { input: { leagueId: 1, note: 'New note' } },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(result.success).toBe(true);
      expect(result.message).toContain('updated');
    });
  });

  // ── setTeamLock ────────────────────────────────────────────────────────────

  describe('setTeamLock mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('setTeamLock');
      await expect(
        resolver(
          {},
          { input: { leagueId: 1, teamId: 2, locked: true } },
          unauthCtx,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it('returns success: false when team not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const resolver = getMutation('setTeamLock');
      const result = (await resolver(
        {},
        { input: { leagueId: 1, teamId: 999, locked: true } },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.message).toContain('Team not found');
    });

    it('locks a team successfully', async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 2 }]);

      const resolver = getMutation('setTeamLock');
      const result = (await resolver(
        {},
        { input: { leagueId: 1, teamId: 2, locked: true } },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(result.success).toBe(true);
      expect(result.message).toContain('locked');
    });

    it('unlocks a team successfully', async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 2 }]);

      const resolver = getMutation('setTeamLock');
      const result = (await resolver(
        {},
        { input: { leagueId: 1, teamId: 2, locked: false } },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(result.success).toBe(true);
      expect(result.message).toContain('unlocked');
    });
  });

  // ── bulkDropTeamPlayers ────────────────────────────────────────────────────

  describe('bulkDropTeamPlayers mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('bulkDropTeamPlayers');
      await expect(
        resolver(
          {},
          { input: { leagueId: 1, teamId: 2 } },
          unauthCtx,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it('returns success: false when team has no players', async () => {
      // bulkDropTeamPlayers selects without .limit() — where() is the terminal
      mockDb.where.mockResolvedValueOnce([]);

      const resolver = getMutation('bulkDropTeamPlayers');
      const result = (await resolver(
        {},
        { input: { leagueId: 1, teamId: 2 } },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.message).toContain('no players');
    });

    it('drops all team players successfully', async () => {
      mockDb.where.mockResolvedValueOnce([
        { id: 1, playerId: 10 },
        { id: 2, playerId: 11 },
      ]);

      const resolver = getMutation('bulkDropTeamPlayers');
      const result = (await resolver(
        {},
        { input: { leagueId: 1, teamId: 2, reason: 'Inactivity' } },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(result.success).toBe(true);
      expect(result.message).toContain('2 player');
    });
  });

  // ── recalculateLeagueMatchupScores ─────────────────────────────────────────

  describe('recalculateLeagueMatchupScores mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('recalculateLeagueMatchupScores');
      await expect(
        resolver({}, { input: { leagueId: 1 } }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('returns zero when no matchups found', async () => {
      // The mutation uses .where() without .limit() to fetch matchups
      mockDb.where.mockResolvedValueOnce([]);

      const resolver = getMutation('recalculateLeagueMatchupScores');
      const result = (await resolver(
        {},
        { input: { leagueId: 1 } },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(result.success).toBe(true);
      expect(result.matchupsRecalculated).toBe(0);
      expect(result.message).toContain('No matchups found');
    });

    it('recalculates all matchups for a league', async () => {
      // .where() returns matchups list
      mockDb.where.mockResolvedValueOnce([
        { id: 1, team1Id: 10, team2Id: 20, gamesPerMatchup: 5, weekNumber: 1 },
        { id: 2, team1Id: 30, team2Id: 40, gamesPerMatchup: 5, weekNumber: 2 },
      ]);

      const resolver = getMutation('recalculateLeagueMatchupScores');
      const result = (await resolver(
        {},
        { input: { leagueId: 1 } },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(result.success).toBe(true);
      expect(result.matchupsRecalculated).toBe(2);
      expect(result.matchupsFailed).toBe(0);
      expect(result.message).toContain('2 matchups');
    });

    it('recalculates matchups for a specific week', async () => {
      mockDb.where.mockResolvedValueOnce([
        { id: 3, team1Id: 10, team2Id: 20, gamesPerMatchup: 5, weekNumber: 3 },
      ]);

      const resolver = getMutation('recalculateLeagueMatchupScores');
      const result = (await resolver(
        {},
        { input: { leagueId: 1, weekNumber: 3 } },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(result.success).toBe(true);
      expect(result.matchupsRecalculated).toBe(1);
      expect(result.message).toContain('week 3');
    });
  });

  // ── commissionerAuditLogs ──────────────────────────────────────────────────

  describe('commissionerAuditLogs query', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getQuery('commissionerAuditLogs');
      await expect(
        resolver({}, { leagueId: 1 }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('returns empty array when no logs', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const resolver = getQuery('commissionerAuditLogs');
      const result = await resolver(
        {},
        { leagueId: 1, limit: 10 },
        mockContext,
        undefined as never,
      );

      expect(result).toEqual([]);
    });

    it('returns audit log entries', async () => {
      const mockLogs = [
        {
          id: 1,
          leagueId: 1,
          userId: 1,
          action: 'force_add',
          targetType: 'player',
          targetId: 10,
          details: {},
          reason: 'Test',
          createdAt: new Date(),
        },
      ];
      mockDb.limit.mockResolvedValueOnce(mockLogs);

      const resolver = getQuery('commissionerAuditLogs');
      const result = (await resolver(
        {},
        { leagueId: 1 },
        mockContext,
        undefined as never,
      )) as Array<Record<string, unknown>>;

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ action: 'force_add' });
    });
  });
  // ── Non-admin commissioner access ────────────────────────────────────────

  describe('commissioner access for non-admin users', () => {
    it('calls verifyCommissionerAccess for non-admin users', async () => {
      mockContext.user.isAdmin = false;
      mockDb.limit.mockResolvedValueOnce([]); // player not on any team

      const resolver = getMutation('forceAddPlayer');
      await resolver(
        {},
        { input: { leagueId: 1, teamId: 2, playerId: 10 } },
        mockContext,
        undefined as never,
      );

      // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
      const { verifyCommissionerAccess } = require('./authorization') as {
        verifyCommissionerAccess: jest.Mock;
      };
      expect(verifyCommissionerAccess).toHaveBeenCalledWith(
        mockDb,
        1,
        mockContext.user.id,
      );
    });
  });
});
