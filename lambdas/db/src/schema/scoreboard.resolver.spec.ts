/**
 * Unit tests for the scoreboard GraphQL resolver (LS-1865, LS-2326).
 *
 * Covers:
 *   - scoreboard: delegates to mlbProvider.getScoreboard()
 *   - scoreboard: defaults to today's Eastern date when date arg is null
 *   - scoreboard: rejects invalid date format with BAD_USER_INPUT
 *   - scoreboard: wraps provider errors with a sanitized message
 *   - game: still returns null (not yet wired)
 */

import type { GraphQLSchema } from 'graphql';

const mockGetScoreboard = jest.fn();
const mockCreateMlbDataProvider = jest.fn(() => ({
  getScoreboard: mockGetScoreboard,
}));

const mockLogger = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('scoreboard resolver', () => {
  let schema: GraphQLSchema;

  beforeEach(() => {
    jest.resetModules();
    mockGetScoreboard.mockReset();
    mockCreateMlbDataProvider.mockClear();

    jest.doMock('@legacy-sports/mlb-client', () => ({
      createMlbDataProvider: mockCreateMlbDataProvider,
    }));

    jest.doMock('@legacy-sports/logging', () => ({
      LOGGER: mockLogger,
    }));

    jest.doMock('@legacy-sports/utils/node', () => ({
      getDbOptions: jest.fn(() => ({})),
    }));

    jest.doMock('@legacy-sports/db-client', () => ({
      createDatabaseService: jest.fn(() => ({
        players: {
          getPlayers: jest.fn().mockResolvedValue([]),
          getPlayerById: jest.fn().mockResolvedValue(null),
          getPlayerByBrefId: jest.fn().mockResolvedValue(null),
          searchPlayers: jest.fn().mockResolvedValue([]),
          getPlayerByMlbId: jest.fn().mockResolvedValue(null),
        },
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
      createBadgeService: jest.fn(() => ({})),
      PublicSchema: {
        leagues: {
          id: 'id',
          name: 'name',
          currentWeek: 'currentWeek',
          currentMatchup: 'currentMatchup',
          minCareerGames: 'minCareerGames',
          minCareerSeasons: 'minCareerSeasons',
          eraFilter: 'eraFilter',
          hofOnly: 'hofOnly',
          customEraStartYear: 'customEraStartYear',
          customEraEndYear: 'customEraEndYear',
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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── helpers ──────────────────────────────────────────────────────────────────

  function getQueryResolver(name: string) {
    const field = schema.getQueryType()?.getFields()[name];
    if (!field?.resolve) throw new Error(`${name} resolver not found`);
    return field.resolve.bind(field);
  }

  // ── scoreboard ────────────────────────────────────────────────────────────────

  it('scoreboard: delegates to createMlbDataProvider().getScoreboard() with the given date', async () => {
    const fakeScoreboard = {
      date: '2024-07-04',
      lastUpdated: '2024-07-04T12:00:00Z',
      games: [],
    };
    mockGetScoreboard.mockResolvedValue(fakeScoreboard);

    const result = await getQueryResolver('scoreboard')(
      {},
      { date: '2024-07-04' },
      {},
      undefined as never,
    );

    expect(mockCreateMlbDataProvider).toHaveBeenCalledTimes(1);
    expect(mockGetScoreboard).toHaveBeenCalledWith('2024-07-04');
    expect(result).toEqual(fakeScoreboard);
  });

  it('scoreboard: defaults to today (Eastern) when date arg is null', async () => {
    const fakeScoreboard = {
      date: '2024-07-04',
      lastUpdated: '2024-07-04T12:00:00Z',
      games: [],
    };
    mockGetScoreboard.mockResolvedValue(fakeScoreboard);

    // Freeze time to 2024-07-04T16:00:00Z (noon ET / UTC-4 in EDT).
    // UTC 16:00 = Eastern 12:00 noon, so the Eastern date is 2024-07-04.
    jest.useFakeTimers({ now: new Date('2024-07-04T16:00:00Z').getTime() });

    await getQueryResolver('scoreboard')(
      {},
      { date: null },
      {},
      undefined as never,
    );

    jest.useRealTimers();

    expect(mockGetScoreboard).toHaveBeenCalledTimes(1);
    const calledDate = mockGetScoreboard.mock.calls[0][0] as string;
    // Should be exactly 2024-07-04 (Eastern noon = UTC 16:00)
    expect(calledDate).toBe('2024-07-04');
  });

  it('scoreboard: defaults to Eastern date near midnight (UTC next day)', async () => {
    const fakeScoreboard = {
      date: '2024-07-04',
      lastUpdated: '2024-07-04T12:00:00Z',
      games: [],
    };
    mockGetScoreboard.mockResolvedValue(fakeScoreboard);

    // Freeze time to 2024-07-05T02:00:00Z (2024-07-04T22:00 EDT / UTC-4).
    // UTC 02:00 next day = Eastern 22:00 same day → Eastern date is still 2024-07-04.
    jest.useFakeTimers({ now: new Date('2024-07-05T02:00:00Z').getTime() });

    await getQueryResolver('scoreboard')(
      {},
      { date: null },
      {},
      undefined as never,
    );

    jest.useRealTimers();

    expect(mockGetScoreboard).toHaveBeenCalledTimes(1);
    const calledDate = mockGetScoreboard.mock.calls[0][0] as string;
    // Eastern 22:00 on Jul 4 → still Jul 4 in ET
    expect(calledDate).toBe('2024-07-04');
  });

  it('scoreboard: throws BAD_USER_INPUT for an invalid date format', async () => {
    await expect(
      getQueryResolver('scoreboard')(
        {},
        { date: 'not-a-date' },
        {},
        undefined as never,
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('Invalid date format'),
      extensions: { code: 'BAD_USER_INPUT' },
    });

    expect(mockGetScoreboard).not.toHaveBeenCalled();
  });

  it('scoreboard: logs and wraps provider errors', async () => {
    const providerError = new Error('upstream 429');
    mockGetScoreboard.mockRejectedValue(providerError);

    await expect(
      getQueryResolver('scoreboard')(
        {},
        { date: '2024-07-04' },
        {},
        undefined as never,
      ),
    ).rejects.toThrow('Failed to fetch scoreboard data. Please try again.');

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Scoreboard provider error',
      providerError,
      { date: '2024-07-04' },
    );
  });

  // ── game ──────────────────────────────────────────────────────────────────────

  it('game: returns null (not yet wired to mlb-client)', async () => {
    const result = await getQueryResolver('game')(
      {},
      { gamePk: 745461 },
      {},
      undefined as never,
    );

    expect(result).toBeNull();
  });
});
