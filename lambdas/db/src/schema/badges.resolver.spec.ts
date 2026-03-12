/**
 * Unit tests for the badges GraphQL resolver (LS-737).
 *
 * Covers:
 *   - allBadgeDefinitions: no auth, returns BADGE_DEFINITIONS
 *   - userBadges: delegates to badgeService.getUserBadges
 *   - teamBadges: delegates to badgeService.getTeamBadges
 *   - userBadgeProgress: delegates to badgeService.getUserBadgeProgress
 *   - evaluateDraftBadges: auth, delegates, returns awarded count
 *   - evaluateMatchupBadges: auth (user or system), delegates
 *   - awardLeagueChampionBadge: auth (user or system), delegates
 *   - awardPlayoffAppearanceBadges: auth (user or system), delegates
 */

import type { GraphQLSchema } from 'graphql';

describe('badges resolver', () => {
  let schema: GraphQLSchema;
  let mockBadgeService: {
    getUserBadges: jest.Mock;
    getTeamBadges: jest.Mock;
    getUserBadgeProgress: jest.Mock;
    evaluateDraftBadges: jest.Mock;
    evaluateMatchupBadges: jest.Mock;
    awardLeagueChampion: jest.Mock;
    awardPlayoffAppearances: jest.Mock;
  };
  let mockContext: {
    user: { id: number; isAdmin: boolean } | null;
    isSystemRequest?: boolean;
    db: unknown;
  };

  const MOCK_BADGE_DEFINITIONS = [
    {
      key: 'draft_legend',
      title: 'Draft Legend',
      description: 'Drafted a Hall of Famer',
      rarity: 'legendary',
      category: 'draft',
      scope: 'per_league',
      repeatable: false,
    },
  ];

  beforeEach(() => {
    jest.resetModules();

    mockBadgeService = {
      getUserBadges: jest.fn().mockResolvedValue([]),
      getTeamBadges: jest.fn().mockResolvedValue([]),
      getUserBadgeProgress: jest.fn().mockResolvedValue([]),
      evaluateDraftBadges: jest.fn().mockResolvedValue([]),
      evaluateMatchupBadges: jest.fn().mockResolvedValue([]),
      awardLeagueChampion: jest.fn().mockResolvedValue(undefined),
      awardPlayoffAppearances: jest.fn().mockResolvedValue(undefined),
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
      BADGE_DEFINITIONS: MOCK_BADGE_DEFINITIONS,
      createBadgeService: jest.fn(() => mockBadgeService),
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
      db: {},
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── allBadgeDefinitions ───────────────────────────────────────────────────

  describe('allBadgeDefinitions query', () => {
    function getResolver() {
      const field = schema.getQueryType()?.getFields().allBadgeDefinitions;
      if (!field?.resolve)
        throw new Error('allBadgeDefinitions resolver not found');
      return field.resolve.bind(field);
    }

    it('returns all badge definitions without requiring auth', async () => {
      mockContext.user = null;
      const result = await getResolver()(
        {},
        {},
        mockContext,
        undefined as never,
      );
      expect(result).toEqual(MOCK_BADGE_DEFINITIONS);
    });
  });

  // ── userBadges ────────────────────────────────────────────────────────────

  describe('userBadges query', () => {
    function getResolver() {
      const field = schema.getQueryType()?.getFields().userBadges;
      if (!field?.resolve) throw new Error('userBadges resolver not found');
      return field.resolve.bind(field);
    }

    it('delegates to badgeService.getUserBadges with no leagueId', async () => {
      const badges = [
        { id: 1, userId: 2, badgeKey: 'draft_legend', rarity: 'legendary' },
      ];
      mockBadgeService.getUserBadges.mockResolvedValue(badges);

      const result = await getResolver()(
        {},
        { userId: 2, leagueId: null },
        mockContext,
        undefined as never,
      );
      expect(result).toEqual(badges);
      expect(mockBadgeService.getUserBadges).toHaveBeenCalledWith(2, null);
    });

    it('delegates to badgeService.getUserBadges with a leagueId', async () => {
      mockBadgeService.getUserBadges.mockResolvedValue([]);
      await getResolver()(
        {},
        { userId: 2, leagueId: 5 },
        mockContext,
        undefined as never,
      );
      expect(mockBadgeService.getUserBadges).toHaveBeenCalledWith(2, 5);
    });
  });

  // ── teamBadges ────────────────────────────────────────────────────────────

  describe('teamBadges query', () => {
    function getResolver() {
      const field = schema.getQueryType()?.getFields().teamBadges;
      if (!field?.resolve) throw new Error('teamBadges resolver not found');
      return field.resolve.bind(field);
    }

    it('delegates to badgeService.getTeamBadges', async () => {
      const badges = [
        { id: 2, userId: 3, badgeKey: 'draft_legend', rarity: 'legendary' },
      ];
      mockBadgeService.getTeamBadges.mockResolvedValue(badges);

      const result = await getResolver()(
        {},
        { teamId: 10, leagueId: 1 },
        mockContext,
        undefined as never,
      );
      expect(result).toEqual(badges);
      expect(mockBadgeService.getTeamBadges).toHaveBeenCalledWith(10, 1);
    });
  });

  // ── userBadgeProgress ────────────────────────────────────────────────────

  describe('userBadgeProgress query', () => {
    function getResolver() {
      const field = schema.getQueryType()?.getFields().userBadgeProgress;
      if (!field?.resolve)
        throw new Error('userBadgeProgress resolver not found');
      return field.resolve.bind(field);
    }

    it('delegates to badgeService.getUserBadgeProgress', async () => {
      const progress = [
        {
          id: 1,
          userId: 2,
          badgeKey: 'draft_legend',
          progressValue: 1,
          progressTarget: 3,
        },
      ];
      mockBadgeService.getUserBadgeProgress.mockResolvedValue(progress);

      const result = await getResolver()(
        {},
        { userId: 2, leagueId: null },
        mockContext,
        undefined as never,
      );
      expect(result).toEqual(progress);
      expect(mockBadgeService.getUserBadgeProgress).toHaveBeenCalledWith(
        2,
        null,
      );
    });
  });

  // ── evaluateDraftBadges ───────────────────────────────────────────────────

  describe('evaluateDraftBadges mutation', () => {
    function getResolver() {
      const field = schema.getMutationType()?.getFields().evaluateDraftBadges;
      if (!field?.resolve)
        throw new Error('evaluateDraftBadges resolver not found');
      return field.resolve.bind(field);
    }

    it('throws UNAUTHENTICATED when no user in context', async () => {
      mockContext.user = null;
      await expect(
        getResolver()({}, { leagueId: 1 }, mockContext, undefined as never),
      ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
    });

    it('returns awarded count after evaluating draft badges', async () => {
      mockBadgeService.evaluateDraftBadges.mockResolvedValue([
        { userId: 1, badgeKey: 'draft_legend' },
        { userId: 2, badgeKey: 'draft_legend' },
      ]);

      const result = (await getResolver()(
        {},
        { leagueId: 1 },
        mockContext,
        undefined as never,
      )) as {
        awarded: { userId: number; badgeKey: string }[];
      };

      expect(mockBadgeService.evaluateDraftBadges).toHaveBeenCalledWith(1);
      expect(result.awarded).toHaveLength(2);
    });
  });

  // ── evaluateMatchupBadges ─────────────────────────────────────────────────

  describe('evaluateMatchupBadges mutation', () => {
    function getResolver() {
      const field = schema.getMutationType()?.getFields().evaluateMatchupBadges;
      if (!field?.resolve)
        throw new Error('evaluateMatchupBadges resolver not found');
      return field.resolve.bind(field);
    }

    it('throws UNAUTHENTICATED when neither user nor system context', async () => {
      mockContext.user = null;
      mockContext.isSystemRequest = false;
      await expect(
        getResolver()({}, { matchupId: 10 }, mockContext, undefined as never),
      ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
    });

    it('allows system requests without a user', async () => {
      mockContext.user = null;
      mockContext.isSystemRequest = true;
      mockBadgeService.evaluateMatchupBadges.mockResolvedValue([]);

      const result = (await getResolver()(
        {},
        { matchupId: 10 },
        mockContext,
        undefined as never,
      )) as {
        awarded: unknown[];
      };
      expect(result.awarded).toEqual([]);
      expect(mockBadgeService.evaluateMatchupBadges).toHaveBeenCalledWith(10);
    });

    it('returns awarded badges for authenticated user', async () => {
      mockBadgeService.evaluateMatchupBadges.mockResolvedValue([
        { userId: 1, badgeKey: 'draft_legend' },
      ]);

      const result = (await getResolver()(
        {},
        { matchupId: 5 },
        mockContext,
        undefined as never,
      )) as {
        awarded: unknown[];
      };
      expect(result.awarded).toHaveLength(1);
    });
  });

  // ── awardLeagueChampionBadge ──────────────────────────────────────────────

  describe('awardLeagueChampionBadge mutation', () => {
    function getResolver() {
      const field = schema
        .getMutationType()
        ?.getFields().awardLeagueChampionBadge;
      if (!field?.resolve)
        throw new Error('awardLeagueChampionBadge resolver not found');
      return field.resolve.bind(field);
    }

    it('throws UNAUTHENTICATED when neither user nor system context', async () => {
      mockContext.user = null;
      await expect(
        getResolver()(
          {},
          { leagueId: 1, teamId: 10, userId: 2 },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
    });

    it('awards the champion badge and returns true', async () => {
      const result = await getResolver()(
        {},
        { leagueId: 1, teamId: 10, userId: 2 },
        mockContext,
        undefined as never,
      );
      expect(result).toBe(true);
      expect(mockBadgeService.awardLeagueChampion).toHaveBeenCalledWith(
        2,
        10,
        1,
      );
    });
  });

  // ── awardPlayoffAppearanceBadges ──────────────────────────────────────────

  describe('awardPlayoffAppearanceBadges mutation', () => {
    function getResolver() {
      const field = schema
        .getMutationType()
        ?.getFields().awardPlayoffAppearanceBadges;
      if (!field?.resolve)
        throw new Error('awardPlayoffAppearanceBadges resolver not found');
      return field.resolve.bind(field);
    }

    it('throws UNAUTHENTICATED when neither user nor system context', async () => {
      mockContext.user = null;
      await expect(
        getResolver()(
          {},
          { leagueId: 1, teamIds: [1, 2] },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
    });

    it('awards playoff appearance badges and returns true', async () => {
      const result = await getResolver()(
        {},
        { leagueId: 1, teamIds: [10, 11, 12] },
        mockContext,
        undefined as never,
      );
      expect(result).toBe(true);
      expect(mockBadgeService.awardPlayoffAppearances).toHaveBeenCalledWith(
        1,
        [10, 11, 12],
      );
    });
  });
});
