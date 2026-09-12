/**
 * Unit tests for the `getUserLeagueStandings` query resolver (LS-9528).
 *
 * This resolver was split out of `getUserLeagueSummaries` so the home dashboard
 * stops blocking on the StandingsService fan-out. It is a new authenticated
 * entry point, so the UNAUTHENTICATED guard is pinned here rather than left to
 * the sibling resolvers' (untested) precedent.
 *
 * Also covers the short-circuit: no active leagues must mean no StandingsService
 * call at all, since fanning out is the entire cost this ticket moved off the
 * critical path.
 */
import type { GraphQLSchema } from 'graphql';

describe('getUserLeagueStandings query (LS-9528)', () => {
  let schema: GraphQLSchema;
  let mockGetStandings: jest.Mock;
  let mockDb: {
    select: jest.Mock;
    from: jest.Mock;
    innerJoin: jest.Mock;
    where: jest.Mock;
    orderBy: jest.Mock;
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
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
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
        leagues: {
          id: 'id',
          name: 'name',
          owner: 'owner',
          sport: 'sport',
          defensiveFormat: 'defensiveFormat',
          maxRosterSize: 'maxRosterSize',
          currentMatchup: 'currentMatchup',
          currentWeek: 'currentWeek',
          totalMatchups: 'totalMatchups',
          seasonNumber: 'seasonNumber',
          baseballEraFilter: 'baseballEraFilter',
          customEraStartYear: 'customEraStartYear',
          customEraEndYear: 'customEraEndYear',
          draftStatus: 'draftStatus',
          leaguePhase: 'leaguePhase',
          inviteCode: 'inviteCode',
          playerPool: 'playerPool',
          weekAdvanceStatus: 'weekAdvanceStatus',
          waiverType: 'waiverType',
          waiverEnabled: 'waiverEnabled',
          faabBudgetDefault: 'faabBudgetDefault',
          isPublic: 'isPublic',
          isMockDraft: 'isMockDraft',
          createdAt: 'createdAt',
          tierFrozenAt: 'tierFrozenAt',
        },
        leagueMembers: {
          leagueId: 'leagueId',
          userId: 'userId',
          teamId: 'teamId',
          permissionLevel: 'permissionLevel',
        },
        drafts: { leagueId: 'leagueId' },
        players: { id: 'id', sport: 'sport' },
        footballSeasonPassing: { playerId: 'playerId', season: 'season' },
        footballSeasonRushing: { playerId: 'playerId', season: 'season' },
        footballSeasonReceiving: { playerId: 'playerId', season: 'season' },
        footballSeasonKicking: { playerId: 'playerId', season: 'season' },
        footballSeasonDefense: { playerId: 'playerId', season: 'season' },
        footballSeasonDefenseIdp: { playerId: 'playerId', season: 'season' },
        careerFootballPassing: { playerId: 'playerId' },
        careerFootballRushing: { playerId: 'playerId' },
        careerFootballReceiving: { playerId: 'playerId' },
        careerFootballKicking: { playerId: 'playerId' },
        careerFootballDefense: { playerId: 'playerId' },
        careerFootballDefenseIdp: { playerId: 'playerId' },
        teams: { id: 'id', name: 'name', leagueId: 'leagueId' },
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

    mockGetStandings = jest.fn().mockResolvedValue([]);
    jest.doMock('../../services/standings-service', () => ({
      StandingsService: {
        getHeadToHead: jest.fn(),
        getSeasonSummary: jest.fn(),
        getStandings: mockGetStandings,
        getMatchupStats: jest.fn(),
      },
    }));

    const schemaModule = require('../../schema') as { schema: GraphQLSchema };
    schema = schemaModule.schema;

    mockContext = {
      user: { id: 1, isAdmin: false },
      db: mockDb,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function getResolver() {
    const field = schema.getQueryType()?.getFields().getUserLeagueStandings;
    if (!field?.resolve) {
      throw new Error('getUserLeagueStandings resolver not found');
    }
    return field.resolve.bind(field);
  }

  it('throws UNAUTHENTICATED when no user in context', async () => {
    mockContext.user = null;

    await expect(
      getResolver()({}, {}, mockContext, undefined as never),
    ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
  });

  it('does not reach StandingsService for an unauthenticated caller', async () => {
    mockContext.user = null;

    await expect(
      getResolver()({}, {}, mockContext, undefined as never),
    ).rejects.toThrow();

    expect(mockGetStandings).not.toHaveBeenCalled();
  });

  it('returns an empty array and skips the fan-out when the user has no active leagues', async () => {
    mockDb.then.mockImplementationOnce((resolve) => resolve([]));

    const result = (await getResolver()(
      {},
      {},
      mockContext,
      undefined as never,
    )) as unknown[];

    expect(result).toEqual([]);
    // The fan-out is the cost LS-9528 moved off the critical path — a user with
    // nothing active must not pay for it at all.
    expect(mockGetStandings).not.toHaveBeenCalled();
  });

  it('caps concurrent StandingsService.getStandings calls for a user in many leagues (LS-9713)', async () => {
    // Regression test: an unbounded Promise.all(leagues.map(...)) fan-out here
    // requested one DB-pool connection per league simultaneously, and a user in
    // more leagues than the per-Lambda pool has connections for (max: 5, see
    // PgDbConnection.ts) surfaced as "timeout exceeded when trying to connect"
    // inside StandingsService's own query fan-out (Rollbar item #243).
    const leagues = Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      userTeamId: 100 + i,
    }));
    mockDb.then.mockImplementationOnce((resolve) => resolve(leagues));

    let inFlight = 0;
    let maxInFlight = 0;
    mockGetStandings.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 0));
      inFlight--;
      return [];
    });

    const result = (await getResolver()(
      {},
      {},
      mockContext,
      undefined as never,
    )) as unknown[];

    expect(result).toHaveLength(leagues.length);
    expect(mockGetStandings).toHaveBeenCalledTimes(leagues.length);
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(maxInFlight).toBeGreaterThan(1);
  });
});
