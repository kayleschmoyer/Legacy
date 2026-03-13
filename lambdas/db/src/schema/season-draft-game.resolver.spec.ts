import type { GraphQLSchema } from 'graphql';

describe('Season Draft Game Resolver', () => {
  let schema: GraphQLSchema;
  let mockDb: any;
  let mockContext: any;
  let mockSeasonDraftGameService: any;
  let mockLoadCareerStats: jest.Mock;

  beforeEach(async () => {
    jest.resetModules();

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

    mockSeasonDraftGameService = {
      getGameState: jest.fn().mockResolvedValue(null),
      getGamesForUser: jest.fn().mockResolvedValue([]),
      createGame: jest.fn().mockResolvedValue(42),
      startGame: jest.fn().mockResolvedValue(undefined),
      makePick: jest.fn().mockResolvedValue(undefined),
      cancelGame: jest.fn().mockResolvedValue(undefined),
      checkPlayerHasStats: jest.fn().mockResolvedValue(false),
      getPlayerBrefId: jest.fn().mockResolvedValue('johndoXX01'),
      getStatValueForPlayerSeasonPosition: jest.fn().mockResolvedValue(25),
    };

    mockLoadCareerStats = jest.fn().mockResolvedValue(undefined);

    jest.doMock('@legacy-sports/utils/node', () => ({
      ...jest.requireActual('@legacy-sports/utils/node'),
      getDbOptions: jest.fn(() => ({})),
    }));

    jest.doMock('@legacy-sports/data-loaders', () => ({
      loadCareerStats: mockLoadCareerStats,
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
      SeasonDraftGameService: mockSeasonDraftGameService,
      HITTER_STAT_KEYS: ['hr', 'rbi', 'avg', 'r', 'sb'],
      PITCHER_STAT_KEYS: ['w', 'era', 'so', 'sv', 'whip'],
      PublicSchema: {
        seasonDraftPlayers: {
          id: 'id',
          userId: 'userId',
          gameId: 'gameId',
          playerName: 'playerName',
        },
        seasonDraftRosterSlots: {
          id: 'id',
          seasonDraftPlayerId: 'seasonDraftPlayerId',
          position: 'position',
          slotNumber: 'slotNumber',
          isFilled: 'isFilled',
        },
        teamMembers: {
          id: 'id',
          teamId: 'teamId',
          leagueId: 'leagueId',
          playerId: 'playerId',
        },
        matchups: {
          id: 'id',
          leagueId: 'leagueId',
          team1Id: 'team1Id',
          team2Id: 'team2Id',
        },
        leagues: { id: 'id', name: 'name' },
        teams: { id: 'id', name: 'name', leagueId: 'leagueId' },
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
        commissionerAuditLog: { id: 'id', leagueId: 'leagueId' },
        leagueActivityEventType: { enumValues: [] },
      },
      InternalSchema: {
        usersInAppInternal: {
          id: 'app_internal.users.id',
          subscriptionTier: 'app_internal.users.subscription_tier',
        },
      },
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
    const schemaModule = require('../schema') as { schema: GraphQLSchema };
    schema = schemaModule.schema;

    mockContext = {
      user: { id: 1 },
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

  // ── seasonDraftGame query ─────────────────────────────────────────────────

  describe('seasonDraftGame query', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getQuery('seasonDraftGame');
      await expect(
        resolver({}, { gameId: 1 }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('returns null when game not found', async () => {
      mockSeasonDraftGameService.getGameState.mockResolvedValueOnce(null);

      const resolver = getQuery('seasonDraftGame');
      const result = await resolver(
        {},
        { gameId: 999 },
        mockContext,
        undefined as never,
      );

      expect(result).toBeNull();
      expect(mockSeasonDraftGameService.getGameState).toHaveBeenCalledWith(
        mockDb,
        999,
      );
    });

    it('returns game state', async () => {
      const mockGame = {
        id: 1,
        name: 'Test Game',
        status: 'drafting',
        currentTurn: 2,
        createdBy: 1,
        statKey: 'hr',
        gameMode: 'season',
        playerType: 'hitter',
        players: [],
        picks: [],
      };
      mockSeasonDraftGameService.getGameState.mockResolvedValueOnce(mockGame);

      const resolver = getQuery('seasonDraftGame');
      const result = await resolver(
        {},
        { gameId: 1 },
        mockContext,
        undefined as never,
      );

      expect(result).toEqual(mockGame);
    });
  });

  // ── seasonDraftGames query ────────────────────────────────────────────────

  describe('seasonDraftGames query', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getQuery('seasonDraftGames');
      await expect(
        resolver({}, {}, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('returns games for user', async () => {
      const mockGames = [
        {
          id: 1,
          name: 'Draft #1',
          status: 'drafting',
          statKey: 'hr',
          gameMode: 'season',
          playerType: 'hitter',
          isMyTurn: true,
        },
      ];
      mockSeasonDraftGameService.getGamesForUser.mockResolvedValueOnce(
        mockGames,
      );

      const resolver = getQuery('seasonDraftGames');
      const result = await resolver({}, {}, mockContext, undefined as never);

      expect(result).toEqual(mockGames);
      expect(mockSeasonDraftGameService.getGamesForUser).toHaveBeenCalledWith(
        mockDb,
        1,
      );
    });
  });

  // ── seasonDraftGameAvailablePositions query ───────────────────────────────

  describe('seasonDraftGameAvailablePositions query', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getQuery('seasonDraftGameAvailablePositions');
      await expect(
        resolver({}, { gameId: 1 }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('returns empty array when player not in game', async () => {
      mockDb.limit.mockResolvedValueOnce([]); // no player found

      const resolver = getQuery('seasonDraftGameAvailablePositions');
      const result = await resolver(
        {},
        { gameId: 1 },
        mockContext,
        undefined as never,
      );

      expect(result).toEqual([]);
    });

    it('returns unfilled position slugs', async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 5 }]); // player found
      // Second select: from seasonDraftRosterSlots → where() is terminal
      mockDb.where
        .mockReturnValueOnce(mockDb) // first where() in first select (before limit)
        .mockResolvedValueOnce([
          // second where() in second select (terminal)
          { position: 'SP', slotNumber: 0, isFilled: false },
          { position: 'RP', slotNumber: 1, isFilled: false },
          { position: 'C', slotNumber: 0, isFilled: true },
        ]);

      const resolver = getQuery('seasonDraftGameAvailablePositions');
      const result = (await resolver(
        {},
        { gameId: 1 },
        mockContext,
        undefined as never,
      )) as string[];

      expect(result).toContain('SP');
      expect(result.some((p) => p.startsWith('RP'))).toBe(true);
      expect(result).not.toContain('C'); // isFilled = true
    });
  });

  // ── seasonDraftGamePlayerSeasonStatValue query ────────────────────────────

  describe('seasonDraftGamePlayerSeasonStatValue query', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getQuery('seasonDraftGamePlayerSeasonStatValue');
      await expect(
        resolver(
          {},
          { playerId: 1, season: 2023, position: 'SP' },
          unauthCtx,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it('returns stat value for player/season/position', async () => {
      mockSeasonDraftGameService.getStatValueForPlayerSeasonPosition.mockResolvedValueOnce(
        42,
      );

      const resolver = getQuery('seasonDraftGamePlayerSeasonStatValue');
      const result = await resolver(
        {},
        {
          playerId: 10,
          season: 2022,
          position: 'SP',
          statKey: 'so',
          playerType: 'pitcher',
        },
        mockContext,
        undefined as never,
      );

      expect(result).toBe(42);
    });
  });

  // ── seasonDraftGameValidStatKeys query ────────────────────────────────────

  describe('seasonDraftGameValidStatKeys query', () => {
    it('returns hitter stat keys (no auth required)', async () => {
      const resolver = getQuery('seasonDraftGameValidStatKeys');
      const result = (await resolver(
        {},
        { playerType: 'hitter' },
        unauthCtx,
        undefined as never,
      )) as string[];

      expect(result).toContain('hr');
    });

    it('returns pitcher stat keys', async () => {
      const resolver = getQuery('seasonDraftGameValidStatKeys');
      const result = (await resolver(
        {},
        { playerType: 'pitcher' },
        unauthCtx,
        undefined as never,
      )) as string[];

      expect(result).toContain('era');
    });
  });

  // ── createSeasonDraftGame mutation ────────────────────────────────────────

  describe('createSeasonDraftGame mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('createSeasonDraftGame');
      await expect(
        resolver(
          {},
          { name: 'Game', playerNames: ['Alice', 'Bob'], userIds: [1, 2] },
          unauthCtx,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it('creates a new game and returns game id', async () => {
      mockSeasonDraftGameService.createGame.mockResolvedValueOnce(99);

      const resolver = getMutation('createSeasonDraftGame');
      const result = await resolver(
        {},
        { name: 'Draft Game', playerNames: ['Alice', 'Bob'], userIds: [1, 2] },
        mockContext,
        undefined as never,
      );

      expect(result).toBe(99);
      expect(mockSeasonDraftGameService.createGame).toHaveBeenCalledWith(
        mockDb,
        expect.objectContaining({ name: 'Draft Game', createdBy: 1 }),
      );
    });
  });

  // ── startSeasonDraftGame mutation ─────────────────────────────────────────

  describe('startSeasonDraftGame mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('startSeasonDraftGame');
      await expect(
        resolver({}, { gameId: 1 }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('throws when game not found', async () => {
      mockSeasonDraftGameService.getGameState.mockResolvedValueOnce(null);

      const resolver = getMutation('startSeasonDraftGame');
      await expect(
        resolver({}, { gameId: 999 }, mockContext, undefined as never),
      ).rejects.toThrow('Game not found');
    });

    it('throws when user is not the game creator', async () => {
      mockSeasonDraftGameService.getGameState.mockResolvedValueOnce({
        id: 1,
        createdBy: 2, // different user
        status: 'setup',
      });

      const resolver = getMutation('startSeasonDraftGame');
      await expect(
        resolver({}, { gameId: 1 }, mockContext, undefined as never),
      ).rejects.toThrow('Only the game creator can start the game');
    });

    it('throws when game is not in setup phase', async () => {
      mockSeasonDraftGameService.getGameState.mockResolvedValueOnce({
        id: 1,
        createdBy: 1, // same user
        status: 'drafting',
      });

      const resolver = getMutation('startSeasonDraftGame');
      await expect(
        resolver({}, { gameId: 1 }, mockContext, undefined as never),
      ).rejects.toThrow('Game can only be started from setup phase');
    });

    it('starts game successfully', async () => {
      mockSeasonDraftGameService.getGameState.mockResolvedValueOnce({
        id: 1,
        createdBy: 1,
        status: 'setup',
      });

      const resolver = getMutation('startSeasonDraftGame');
      const result = await resolver(
        {},
        { gameId: 1 },
        mockContext,
        undefined as never,
      );

      expect(result).toBe(true);
      expect(mockSeasonDraftGameService.startGame).toHaveBeenCalledWith(
        mockDb,
        1,
      );
    });
  });

  // ── makeSeasonDraftPick mutation ──────────────────────────────────────────

  describe('makeSeasonDraftPick mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('makeSeasonDraftPick');
      await expect(
        resolver(
          {},
          {
            gameId: 1,
            rosterSlotId: 1,
            playerId: 10,
            season: 2022,
            position: 'SP',
          },
          unauthCtx,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it('makes a draft pick', async () => {
      const resolver = getMutation('makeSeasonDraftPick');
      const result = await resolver(
        {},
        {
          gameId: 1,
          rosterSlotId: 2,
          playerId: 10,
          season: 2021,
          position: 'SP',
          team: 'NYY',
        },
        mockContext,
        undefined as never,
      );

      expect(result).toBe(true);
      expect(mockSeasonDraftGameService.makePick).toHaveBeenCalledWith(
        mockDb,
        expect.objectContaining({
          gameId: 1,
          userId: 1,
          rosterSlotId: 2,
          playerId: 10,
          season: 2021,
        }),
      );
    });
  });

  // ── triggerSeasonDraftStatLoading mutation ────────────────────────────────

  describe('triggerSeasonDraftStatLoading mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('triggerSeasonDraftStatLoading');
      await expect(
        resolver({}, { playerId: 1 }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('returns false when player already has stats', async () => {
      mockSeasonDraftGameService.checkPlayerHasStats.mockResolvedValueOnce(
        true,
      );

      const resolver = getMutation('triggerSeasonDraftStatLoading');
      const result = await resolver(
        {},
        { playerId: 10 },
        mockContext,
        undefined as never,
      );

      expect(result).toBe(false);
      expect(mockLoadCareerStats).not.toHaveBeenCalled();
    });

    it('throws when player has no brefId', async () => {
      mockSeasonDraftGameService.checkPlayerHasStats.mockResolvedValueOnce(
        false,
      );
      mockSeasonDraftGameService.getPlayerBrefId.mockResolvedValueOnce(null);

      const resolver = getMutation('triggerSeasonDraftStatLoading');
      await expect(
        resolver({}, { playerId: 999 }, mockContext, undefined as never),
      ).rejects.toThrow('Player not found or has no Baseball Reference ID');
    });

    it('triggers stat loading and returns true', async () => {
      mockSeasonDraftGameService.checkPlayerHasStats.mockResolvedValueOnce(
        false,
      );
      mockSeasonDraftGameService.getPlayerBrefId.mockResolvedValueOnce(
        'ruthbaxX01',
      );

      const resolver = getMutation('triggerSeasonDraftStatLoading');
      const result = await resolver(
        {},
        { playerId: 5 },
        mockContext,
        undefined as never,
      );

      expect(result).toBe(true);
      expect(mockLoadCareerStats).toHaveBeenCalledWith(mockDb, 'ruthbaxX01');
    });

    it('throws when stat loading fails', async () => {
      mockSeasonDraftGameService.checkPlayerHasStats.mockResolvedValueOnce(
        false,
      );
      mockSeasonDraftGameService.getPlayerBrefId.mockResolvedValueOnce(
        'johndoXX01',
      );
      mockLoadCareerStats.mockRejectedValueOnce(new Error('Network error'));

      const resolver = getMutation('triggerSeasonDraftStatLoading');
      await expect(
        resolver({}, { playerId: 5 }, mockContext, undefined as never),
      ).rejects.toThrow('Failed to load player stats');
    });
  });

  // ── cancelSeasonDraftGame mutation ────────────────────────────────────────

  describe('cancelSeasonDraftGame mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('cancelSeasonDraftGame');
      await expect(
        resolver({}, { gameId: 1 }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('cancels the game', async () => {
      const resolver = getMutation('cancelSeasonDraftGame');
      const result = await resolver(
        {},
        { gameId: 3 },
        mockContext,
        undefined as never,
      );

      expect(result).toBe(true);
      expect(mockSeasonDraftGameService.cancelGame).toHaveBeenCalledWith(
        mockDb,
        3,
        1,
      );
    });
  });
});
