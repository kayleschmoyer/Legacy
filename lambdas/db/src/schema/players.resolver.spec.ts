/**
 * Unit tests for the players GraphQL resolver (LS-742).
 *
 * Covers:
 *   - players: basic query (no leagueId), with leagueId (settings found),
 *              with leagueId (league not found)
 *   - player: returns player, returns null
 *   - playerByBrefId: returns player
 *   - searchPlayers: default limit (10), explicit limit
 */

import { defaultFieldResolver } from 'graphql';
import type { GraphQLResolveInfo, GraphQLSchema } from 'graphql';

describe('players resolver', () => {
  let schema: GraphQLSchema;
  let mockPlayersService: {
    getPlayers: jest.Mock;
    getPlayerById: jest.Mock;
    getPlayerByBrefId: jest.Mock;
    getPlayerByMlbId: jest.Mock;
    searchPlayers: jest.Mock;
  };
  let mockDb: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    limit: jest.Mock;
    orderBy: jest.Mock;
    insert: jest.Mock;
    values: jest.Mock;
    onConflictDoUpdate: jest.Mock;
    returning: jest.Mock;
    delete: jest.Mock;
    update: jest.Mock;
    set: jest.Mock;
  };
  let mockContext: {
    user: { id: number; isAdmin: boolean } | null;
    db: unknown;
    loaders: unknown;
  };

  const MOCK_PLAYER = {
    id: 1,
    firstName: 'Babe',
    lastName: 'Ruth',
    brefId: 'ruthba01',
    mlbPlayerId: null,
    statsLastFetchedAt: null,
    scoring: null,
    allStarSelections: 0,
    goldGloves: 0,
    silverSluggers: 0,
    mvpAwards: 0,
    cyYoungAwards: 0,
    worldSeriesRings: 0,
    hallOfFame: true,
    rookieOfTheYear: false,
  };

  beforeEach(() => {
    jest.resetModules();

    mockPlayersService = {
      getPlayers: jest.fn().mockResolvedValue([]),
      getPlayerById: jest.fn().mockResolvedValue(null),
      getPlayerByBrefId: jest.fn().mockResolvedValue(null),
      getPlayerByMlbId: jest.fn().mockResolvedValue(null),
      searchPlayers: jest.fn().mockResolvedValue([]),
    };

    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
      orderBy: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      onConflictDoUpdate: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnValue({
        then: jest.fn((resolve: (v: unknown) => unknown) => resolve([])),
      }),
      delete: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
    };

    jest.doMock('@legacy-sports/utils/node', () => ({
      getDbOptions: jest.fn(() => ({})),
    }));

    jest.doMock('@legacy-sports/db-client', () =>
      mockDbClientModule({
        createDatabaseService: jest.fn(() => ({
          players: mockPlayersService,
          statistics: {
            getOnThisDay: jest.fn(),
            getOnThisDayEvents: jest.fn(),
          },
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
            baseballHofOnly: 'baseballHofOnly',
            customEraStartYear: 'customEraStartYear',
            customEraEndYear: 'customEraEndYear',
            sport: 'sport',
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
      }),
    );

    jest.doMock('../services/standings-service', () => ({
      StandingsService: {
        getHeadToHead: jest.fn(),
        getSeasonSummary: jest.fn(),
        getStandings: jest.fn(),
        getMatchupStats: jest.fn(),
      },
    }));

    const schemaModule = require('../schema') as { schema: GraphQLSchema };
    schema = schemaModule.schema;

    mockContext = {
      user: null,
      db: mockDb,
      loaders: {},
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── helpers ───────────────────────────────────────────────────────────────

  function getQueryResolver(name: string) {
    const field = schema.getQueryType()?.getFields()[name];
    if (!field?.resolve) throw new Error(`${name} resolver not found`);
    return field.resolve.bind(field);
  }

  // ── players (no leagueId) ─────────────────────────────────────────────────

  it('players: returns results from dbService without leagueId', async () => {
    mockPlayersService.getPlayers.mockResolvedValueOnce([MOCK_PLAYER]);

    const result = await getQueryResolver('players')(
      {},
      {
        limit: null,
        offset: null,
        orderBy: null,
        orderDirection: null,
        position: null,
        search: null,
        excludeEmptyNames: false,
        leagueId: null,
      },
      mockContext,
      undefined as never,
    );

    expect(result).toEqual([MOCK_PLAYER]);
    expect(mockPlayersService.getPlayers).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: 'careerGames',
        orderDirection: 'desc',
        leagueId: undefined,
        filters: expect.objectContaining({ excludeEmptyNames: false }),
      }),
    );
  });

  // ── players (with leagueId, settings found) ───────────────────────────────

  it('players: fetches league settings and passes to dbService when leagueId provided', async () => {
    mockDb.limit.mockResolvedValueOnce([
      {
        minCareerGames: 100,
        minCareerSeasons: 5,
        eraFilter: 'modern',
        baseballHofOnly: false,
        customEraStartYear: null,
        customEraEndYear: null,
      },
    ]);
    mockPlayersService.getPlayers.mockResolvedValueOnce([MOCK_PLAYER]);

    const result = await getQueryResolver('players')(
      {},
      {
        limit: null,
        offset: null,
        orderBy: null,
        orderDirection: null,
        position: null,
        search: null,
        excludeEmptyNames: false,
        leagueId: 42,
      },
      mockContext,
      undefined as never,
    );

    expect(result).toEqual([MOCK_PLAYER]);
    expect(mockDb.select).toHaveBeenCalled();
    expect(mockPlayersService.getPlayers).toHaveBeenCalledWith(
      expect.objectContaining({
        leagueId: 42,
        filters: expect.objectContaining({
          minCareerGames: 100,
          minCareerSeasons: 5,
          baseballEraFilter: 'modern',
          baseballHofOnly: false,
        }),
      }),
    );
  });

  it('players: forwards sport arg to dbService when no leagueId', async () => {
    mockPlayersService.getPlayers.mockResolvedValueOnce([MOCK_PLAYER]);

    await getQueryResolver('players')(
      {},
      {
        limit: null,
        offset: null,
        orderBy: null,
        orderDirection: null,
        position: null,
        search: null,
        excludeEmptyNames: false,
        leagueId: null,
        sport: 'football',
      },
      mockContext,
      undefined as never,
    );

    expect(mockPlayersService.getPlayers).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ sport: 'football' }),
      }),
    );
  });

  // ── players (with leagueId, league not found) ─────────────────────────────

  it('players: calls dbService without settings when league is not found', async () => {
    mockDb.limit.mockResolvedValueOnce([]); // empty result — league not found
    mockPlayersService.getPlayers.mockResolvedValueOnce([]);

    await getQueryResolver('players')(
      {},
      {
        limit: null,
        offset: null,
        orderBy: null,
        orderDirection: null,
        position: null,
        search: null,
        excludeEmptyNames: false,
        leagueId: 99,
      },
      mockContext,
      undefined as never,
    );

    expect(mockPlayersService.getPlayers).toHaveBeenCalledWith(
      expect.objectContaining({
        leagueId: 99,
        filters: expect.objectContaining({
          minCareerGames: undefined,
          minCareerSeasons: undefined,
        }),
      }),
    );
  });

  // ── players (search — auth required, premium gate removed: LS-7019/LS-8212) ─

  it('players: throws AuthenticationError when search is provided but user is unauthenticated', async () => {
    mockContext.user = null;

    await expect(
      getQueryResolver('players')(
        {},
        {
          limit: null,
          offset: null,
          orderBy: null,
          orderDirection: null,
          position: null,
          search: 'Ruth',
          excludeEmptyNames: false,
          leagueId: null,
        },
        mockContext,
        undefined as never,
      ),
    ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });

    expect(mockPlayersService.getPlayers).not.toHaveBeenCalled();
  });

  it('players: allows search for an authenticated free-tier user (premium gate removed — LS-8212)', async () => {
    // The Player Comparison search must return results for free-tier users —
    // the dropdown options render behind the UI <PremiumGate>. The premium
    // boundary is enforced per-field (scoring / careerBatting / careerAchievements
    // return null) plus the UI gate, not by blocking the name search (LS-8212).
    mockContext.user = { id: 7, isAdmin: false };
    mockPlayersService.getPlayers.mockResolvedValueOnce([MOCK_PLAYER]);

    const result = await getQueryResolver('players')(
      {},
      {
        limit: 8,
        offset: null,
        orderBy: null,
        orderDirection: null,
        position: null,
        search: 'Ruth',
        excludeEmptyNames: false,
        leagueId: null,
      },
      mockContext,
      undefined as never,
    );

    expect(result).toEqual([MOCK_PLAYER]);
    expect(mockPlayersService.getPlayers).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ fullNameLike: 'Ruth' }),
      }),
    );
  });

  it('players: allows search for a premium user (no tier lookup gate — LS-8212)', async () => {
    mockContext.user = { id: 7, isAdmin: false };
    mockPlayersService.getPlayers.mockResolvedValueOnce([MOCK_PLAYER]);

    const result = await getQueryResolver('players')(
      {},
      {
        limit: 8,
        offset: null,
        orderBy: null,
        orderDirection: null,
        position: null,
        search: 'Ruth',
        excludeEmptyNames: false,
        leagueId: null,
      },
      mockContext,
      undefined as never,
    );

    expect(result).toEqual([MOCK_PLAYER]);
    expect(mockPlayersService.getPlayers).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ fullNameLike: 'Ruth' }),
      }),
    );
  });

  it('players: skips search gate when no search arg is provided', async () => {
    mockContext.user = null;
    mockPlayersService.getPlayers.mockResolvedValueOnce([MOCK_PLAYER]);

    const result = await getQueryResolver('players')(
      {},
      {
        limit: null,
        offset: null,
        orderBy: null,
        orderDirection: null,
        position: null,
        search: null,
        excludeEmptyNames: false,
        leagueId: null,
      },
      mockContext,
      undefined as never,
    );

    expect(result).toEqual([MOCK_PLAYER]);
  });

  // ── player ────────────────────────────────────────────────────────────────

  it('player: returns the player when found', async () => {
    mockPlayersService.getPlayerById.mockResolvedValueOnce(MOCK_PLAYER);

    const result = await getQueryResolver('player')(
      {},
      { id: 1 },
      mockContext,
      undefined as never,
    );

    expect(result).toEqual(MOCK_PLAYER);
    expect(mockPlayersService.getPlayerById).toHaveBeenCalledWith(1);
  });

  it('player: returns null when player is not found', async () => {
    mockPlayersService.getPlayerById.mockResolvedValueOnce(null);

    const result = await getQueryResolver('player')(
      {},
      { id: 999 },
      mockContext,
      undefined as never,
    );

    expect(result).toBeNull();
  });

  // ── playerByBrefId ────────────────────────────────────────────────────────

  it('playerByBrefId: returns the player by brefId', async () => {
    mockPlayersService.getPlayerByBrefId.mockResolvedValueOnce(MOCK_PLAYER);

    const result = await getQueryResolver('playerByBrefId')(
      {},
      { brefId: 'ruthba01' },
      mockContext,
      undefined as never,
    );

    expect(result).toEqual(MOCK_PLAYER);
    expect(mockPlayersService.getPlayerByBrefId).toHaveBeenCalledWith(
      'ruthba01',
    );
  });

  // ── searchPlayers ─────────────────────────────────────────────────────────

  it('searchPlayers: uses default limit of 10 when not specified', async () => {
    mockPlayersService.searchPlayers.mockResolvedValueOnce([MOCK_PLAYER]);

    const result = await getQueryResolver('searchPlayers')(
      {},
      { searchTerm: 'Babe', limit: null, sport: null },
      mockContext,
      undefined as never,
    );

    expect(result).toEqual([MOCK_PLAYER]);
    expect(mockPlayersService.searchPlayers).toHaveBeenCalledWith(
      'Babe',
      10,
      undefined,
    );
  });

  it('searchPlayers: passes explicit limit to dbService', async () => {
    mockPlayersService.searchPlayers.mockResolvedValueOnce([]);

    await getQueryResolver('searchPlayers')(
      {},
      { searchTerm: 'Ruth', limit: 25, sport: null },
      mockContext,
      undefined as never,
    );

    expect(mockPlayersService.searchPlayers).toHaveBeenCalledWith(
      'Ruth',
      25,
      undefined,
    );
  });

  it('searchPlayers: forwards sport filter to dbService', async () => {
    mockPlayersService.searchPlayers.mockResolvedValueOnce([MOCK_PLAYER]);

    await getQueryResolver('searchPlayers')(
      {},
      { searchTerm: 'Jones', limit: null, sport: 'football' },
      mockContext,
      undefined as never,
    );

    expect(mockPlayersService.searchPlayers).toHaveBeenCalledWith(
      'Jones',
      10,
      'football',
    );
  });

  // ── playerByMlbId ─────────────────────────────────────────────────────────

  it('playerByMlbId: returns the player when found', async () => {
    mockPlayersService.getPlayerByMlbId.mockResolvedValueOnce(MOCK_PLAYER);

    const result = await getQueryResolver('playerByMlbId')(
      {},
      { mlbPlayerId: 543 },
      mockContext,
      undefined as never,
    );

    expect(result).toEqual(MOCK_PLAYER);
    expect(mockPlayersService.getPlayerByMlbId).toHaveBeenCalledWith(543);
  });

  it('playerByMlbId: returns null when player is not found', async () => {
    mockPlayersService.getPlayerByMlbId.mockResolvedValueOnce(null);

    const result = await getQueryResolver('playerByMlbId')(
      {},
      { mlbPlayerId: 999 },
      mockContext,
      undefined as never,
    );

    expect(result).toBeNull();
  });

  // ── players: search injection safety (LS-7025) ───────────────────────────

  it('players: forwards adversarial search string as fullNameLike without modification', async () => {
    // The resolver must not sanitize or reject the input — parameterization
    // happens in the db-client (Drizzle ilike / sql tagged templates).
    // Search still requires an authenticated caller (LS-7019), so set a user
    // before exercising the forwarding path.
    mockContext.user = { id: 7, isAdmin: false };
    mockPlayersService.getPlayers.mockResolvedValueOnce([]);

    const injectionInput = "' OR 1=1 --";
    await getQueryResolver('players')(
      {},
      {
        limit: null,
        offset: null,
        orderBy: null,
        orderDirection: null,
        position: null,
        search: injectionInput,
        excludeEmptyNames: false,
        leagueId: null,
      },
      mockContext,
      undefined as never,
    );

    expect(mockPlayersService.getPlayers).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ fullNameLike: injectionInput }),
      }),
    );
  });

  // ── playerMlbStats ────────────────────────────────────────────────────────

  it('playerMlbStats: returns null (stub resolver)', async () => {
    const result = await getQueryResolver('playerMlbStats')(
      {},
      { mlbPlayerId: 543, season: 2024 },
      mockContext,
      undefined as never,
    );

    expect(result).toBeNull();
  });

  // ── mlbTeam / jerseyNumber exposure (LS-8597) ────────────────────────────

  describe('Player.mlbTeam / Player.jerseyNumber', () => {
    // Pothos builds `t.expose*` fields with `resolve: undefined` so graphql-js
    // falls back to defaultFieldResolver. Assert the field is an exposure of
    // the same-named property, then resolve it the way execution would.
    function getPlayerFieldResolver(name: 'mlbTeam' | 'jerseyNumber') {
      const playerType = schema.getType('Player');

      const field = (playerType as any)?.getFields?.()[name];
      if (!field) throw new Error(`Player.${name} field not found`);
      if (field.resolve) return field.resolve.bind(field);
      expect(field.extensions?.pothosExposedField).toBe(name);
      return (parent: unknown, args: unknown, context: unknown) =>
        defaultFieldResolver(parent, args, context, {
          fieldName: name,
        } as GraphQLResolveInfo);
    }

    it('mlbTeam: exposes the mlbTeam property from the parent player', () => {
      const result = getPlayerFieldResolver('mlbTeam')(
        { ...MOCK_PLAYER, mlbTeam: 'NYY' },
        {},
        mockContext,
        undefined,
      );
      expect(result).toBe('NYY');
    });

    it('mlbTeam: resolves to null when unsynced', () => {
      const result = getPlayerFieldResolver('mlbTeam')(
        { ...MOCK_PLAYER, mlbTeam: null },
        {},
        mockContext,
        undefined,
      );
      expect(result).toBeNull();
    });

    it('jerseyNumber: exposes the jerseyNumber property from the parent player', () => {
      const result = getPlayerFieldResolver('jerseyNumber')(
        { ...MOCK_PLAYER, jerseyNumber: 99 },
        {},
        mockContext,
        undefined,
      );
      expect(result).toBe(99);
    });
  });
});
