/**
 * Unit tests for the scoreboard GraphQL resolver (LS-1865).
 *
 * Covers:
 *   - scoreboard: returns null (stub pending LS-1864 mlb-client)
 *   - game: returns null (stub pending LS-1864 mlb-client)
 */

import type { GraphQLSchema } from 'graphql';

describe('scoreboard resolver', () => {
  let schema: GraphQLSchema;

  beforeEach(() => {
    jest.resetModules();

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

  it('scoreboard: returns null (stub pending LS-1864 mlb-client)', async () => {
    const result = await getQueryResolver('scoreboard')(
      {},
      { date: '2024-07-04' },
      {},
      undefined as never,
    );

    expect(result).toBeNull();
  });

  it('scoreboard: returns null when date is null', async () => {
    const result = await getQueryResolver('scoreboard')(
      {},
      { date: null },
      {},
      undefined as never,
    );

    expect(result).toBeNull();
  });

  // ── game ──────────────────────────────────────────────────────────────────────

  it('game: returns null (stub pending LS-1864 mlb-client)', async () => {
    const result = await getQueryResolver('game')(
      {},
      { gamePk: 745461 },
      {},
      undefined as never,
    );

    expect(result).toBeNull();
  });
});
