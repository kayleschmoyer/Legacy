/**
 * Unit tests for the on-this-day GraphQL resolver (LS-748).
 *
 * Covers:
 *   - onThisDay: returns notable batting/pitching game-log performances
 *   - onThisDayEvents: returns historical baseball events (signings, trades)
 */

import type { GraphQLSchema } from 'graphql';

describe('on-this-day resolver', () => {
  let schema: GraphQLSchema;
  let mockGetOnThisDay: jest.Mock;
  let mockGetOnThisDayEvents: jest.Mock;

  beforeEach(() => {
    jest.resetModules();

    mockGetOnThisDay = jest.fn();
    mockGetOnThisDayEvents = jest.fn();

    jest.doMock('@legacy-sports/utils/node', () => ({
      getDbOptions: jest.fn(() => ({})),
    }));

    jest.doMock('@legacy-sports/db-client', () => ({
      createDatabaseService: jest.fn(() => ({
        statistics: {
          getOnThisDay: mockGetOnThisDay,
          getOnThisDayEvents: mockGetOnThisDayEvents,
        },
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
        leagueWeekPlayerSeasons: {
          playerId: 'playerId',
          season: 'season',
          leagueId: 'leagueId',
          weekNumber: 'weekNumber',
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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── onThisDay query ────────────────────────────────────────────────────────

  describe('onThisDay query', () => {
    function getResolver() {
      const queryType = schema.getQueryType();
      const field = queryType?.getFields().onThisDay;
      if (!field?.resolve) throw new Error('onThisDay resolver not found');
      return field.resolve.bind(field);
    }

    it('returns empty array when no performances exist for the date', async () => {
      mockGetOnThisDay.mockResolvedValue([]);

      const result = await getResolver()(
        {},
        { month: 1, day: 1, limit: null },
        {},
        undefined as never,
      );

      expect(result).toEqual([]);
      expect(mockGetOnThisDay).toHaveBeenCalledWith(1, 1, 15);
    });

    it('returns batting and pitching entries for a given date', async () => {
      const mockEntries = [
        {
          entryType: 'batting',
          playerId: 42,
          firstName: 'Babe',
          lastName: 'Ruth',
          brefId: 'ruthba01',
          season: 1927,
          gameIdentifier: 'NYA/192704270',
          hr: 2,
          rbi: 4,
          hits: 3,
          doubles: 1,
          triples: 0,
          atBats: 5,
          baseOnBalls: 1,
          runs: 2,
          strikeouts: null,
          inningsPitched: null,
          earnedRuns: null,
          saves: null,
          wins: null,
          hitsAllowed: null,
          walksAllowed: null,
        },
        {
          entryType: 'pitching',
          playerId: 7,
          firstName: 'Walter',
          lastName: 'Johnson',
          brefId: 'johnwa01',
          season: 1913,
          gameIdentifier: 'WAS/191304150',
          hr: null,
          rbi: null,
          hits: null,
          doubles: null,
          triples: null,
          atBats: null,
          baseOnBalls: null,
          runs: null,
          strikeouts: 12,
          inningsPitched: 9,
          earnedRuns: 0,
          saves: 0,
          wins: 1,
          hitsAllowed: 3,
          walksAllowed: 1,
        },
      ];

      mockGetOnThisDay.mockResolvedValue(mockEntries);

      const result = await getResolver()(
        {},
        { month: 4, day: 15, limit: 10 },
        {},
        undefined as never,
      );

      expect(result).toEqual(mockEntries);
      expect(mockGetOnThisDay).toHaveBeenCalledWith(4, 15, 10);
    });

    it('uses the default limit of 15 when limit arg is null', async () => {
      mockGetOnThisDay.mockResolvedValue([]);

      await getResolver()(
        {},
        { month: 7, day: 4, limit: null },
        {},
        undefined as never,
      );

      expect(mockGetOnThisDay).toHaveBeenCalledWith(7, 4, 15);
    });

    it('passes through a custom limit to the service', async () => {
      mockGetOnThisDay.mockResolvedValue([]);

      await getResolver()(
        {},
        { month: 9, day: 21, limit: 5 },
        {},
        undefined as never,
      );

      expect(mockGetOnThisDay).toHaveBeenCalledWith(9, 21, 5);
    });
  });

  // ── onThisDayEvents query ──────────────────────────────────────────────────

  describe('onThisDayEvents query', () => {
    function getResolver() {
      const queryType = schema.getQueryType();
      const field = queryType?.getFields().onThisDayEvents;
      if (!field?.resolve)
        throw new Error('onThisDayEvents resolver not found');
      return field.resolve.bind(field);
    }

    it('returns empty array when no events exist for the date', async () => {
      mockGetOnThisDayEvents.mockResolvedValue([]);

      const result = await getResolver()(
        {},
        { month: 2, day: 14, limit: null },
        {},
        undefined as never,
      );

      expect(result).toEqual([]);
      expect(mockGetOnThisDayEvents).toHaveBeenCalledWith(2, 14, 20);
    });

    it('returns historical baseball events for a given date', async () => {
      const mockEvents = [
        {
          id: 1,
          month: 12,
          day: 13,
          year: 1999,
          eventType: 'TR',
          description:
            'Roger Clemens traded from Toronto Blue Jays to New York Yankees',
          playerId: 101,
          playerName: 'Roger Clemens',
          fromTeam: 'Toronto Blue Jays',
          toTeam: 'New York Yankees',
        },
        {
          id: 2,
          month: 12,
          day: 13,
          year: 2003,
          eventType: 'SFA',
          description: 'Pedro Martinez signed as free agent',
          playerId: 202,
          playerName: 'Pedro Martinez',
          fromTeam: null,
          toTeam: 'Boston Red Sox',
        },
      ];

      mockGetOnThisDayEvents.mockResolvedValue(mockEvents);

      const result = await getResolver()(
        {},
        { month: 12, day: 13, limit: 10 },
        {},
        undefined as never,
      );

      expect(result).toEqual(mockEvents);
      expect(mockGetOnThisDayEvents).toHaveBeenCalledWith(12, 13, 10);
    });

    it('uses the default limit of 20 when limit arg is null', async () => {
      mockGetOnThisDayEvents.mockResolvedValue([]);

      await getResolver()(
        {},
        { month: 3, day: 31, limit: null },
        {},
        undefined as never,
      );

      expect(mockGetOnThisDayEvents).toHaveBeenCalledWith(3, 31, 20);
    });

    it('passes through a custom limit to the service', async () => {
      mockGetOnThisDayEvents.mockResolvedValue([]);

      await getResolver()(
        {},
        { month: 6, day: 18, limit: 3 },
        {},
        undefined as never,
      );

      expect(mockGetOnThisDayEvents).toHaveBeenCalledWith(6, 18, 3);
    });
  });
});
