/**
 * Unit tests for the twenty-questions GraphQL resolvers (LS-4411).
 *
 * Covers:
 *   - twentyQuestionsAsk: UserInputError when getGameState returns null
 *   - twentyQuestionsGuess: UserInputError when getGameState returns null
 *   - twentyQuestionsAbandon: UserInputError when getGameState returns null
 */

import type { GraphQLSchema } from 'graphql';

describe('twenty-questions resolvers', () => {
  let schema: GraphQLSchema;
  let mockTwentyQuestionsService: {
    getActiveGame: jest.Mock;
    startGame: jest.Mock;
    askQuestion: jest.Mock;
    getGameState: jest.Mock;
    guessPlayer: jest.Mock;
    abandonGame: jest.Mock;
    getLifetimeTokenBalance: jest.Mock;
  };
  let mockDb: Record<string, jest.Mock>;
  let mockContext: { user: { id: number }; db: typeof mockDb };

  const baseGameState = {
    id: 'game-1',
    userId: 42,
    targetPlayerId: 99,
    status: 'active' as const,
    difficulty: 'medium' as const,
    questionsUsed: 0,
    maxQuestions: 20,
    tokensEarned: null,
    startedAt: '2026-01-01T00:00:00Z',
    completedAt: null,
    questions: [],
  };

  beforeEach(() => {
    jest.resetModules();

    mockTwentyQuestionsService = {
      getActiveGame: jest.fn().mockResolvedValue(null),
      startGame: jest.fn().mockResolvedValue(baseGameState),
      askQuestion: jest.fn().mockResolvedValue(undefined),
      getGameState: jest
        .fn()
        .mockResolvedValue({ ...baseGameState, questions: [] }),
      guessPlayer: jest.fn().mockResolvedValue(undefined),
      abandonGame: jest.fn().mockResolvedValue(undefined),
      getLifetimeTokenBalance: jest.fn().mockResolvedValue(0),
    };

    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      then: jest.fn((resolve) => resolve([])),
    };

    jest.doMock('@legacy-sports/utils/node', () => ({
      getDbOptions: jest.fn(() => ({})),
    }));

    jest.doMock('@legacy-sports/db-client', () =>
      mockDbClientModule({
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
        createBadgeService: jest.fn(() => ({
          getUserBadges: jest.fn().mockResolvedValue([]),
          getTeamBadges: jest.fn().mockResolvedValue([]),
          getUserBadgeProgress: jest.fn().mockResolvedValue([]),
          evaluateDraftBadges: jest.fn().mockResolvedValue([]),
          evaluateMatchupBadges: jest.fn().mockResolvedValue([]),
          awardLeagueChampion: jest.fn().mockResolvedValue(undefined),
          awardPlayoffAppearances: jest.fn().mockResolvedValue(undefined),
        })),
        TwentyQuestionsService: mockTwentyQuestionsService,
        DisclosureGameService: jest.fn().mockImplementation(() => ({
          getBestScore: jest.fn().mockResolvedValue(null),
          startSession: jest.fn(),
          nextClue: jest.fn(),
          submitGuess: jest.fn(),
          giveUp: jest.fn(),
        })),
        PublicSchema: {
          twentyQuestionsGames: {
            id: 'id',
            userId: 'userId',
            startedAt: 'startedAt',
            status: 'status',
            difficulty: 'difficulty',
            targetPlayerId: 'targetPlayerId',
            questionsUsed: 'questionsUsed',
            maxQuestions: 'maxQuestions',
            tokensEarned: 'tokensEarned',
            completedAt: 'completedAt',
          },
          twentyQuestionsQuestions: {
            gameId: 'gameId',
            questionNumber: 'questionNumber',
            category: 'category',
            parameter: 'parameter',
            answer: 'answer',
            isGuess: 'isGuess',
            guessPlayerId: 'guessPlayerId',
          },
          seasonBatting: { playerId: 'playerId', season: 'season' },
          players: { id: 'id', firstName: 'firstName', lastName: 'lastName' },
          leagues: { id: 'id', name: 'name' },
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
          matchups: {
            id: 'id',
            leagueId: 'leagueId',
            team1Id: 'team1Id',
            team2Id: 'team2Id',
          },
          matchupPlayers: { id: 'id', matchupId: 'matchupId' },
          matchupPlayerGames: { matchupPlayerId: 'matchupPlayerId' },
          leagueWeekPlayerSeasons: {
            playerId: 'playerId',
            leagueId: 'leagueId',
          },
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
          disclosureGameSessions: { id: 'id', userId: 'userId' },
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
        },
        InternalSchema: {
          usersInAppInternal: {
            id: 'app_internal.users.id',
            subscriptionTier: 'app_internal.users.subscription_tier',
          },
        },
        BADGE_DEFINITIONS: [],
        HITTER_STAT_KEYS: [],
        PITCHER_STAT_KEYS: [],
      }),
    );

    const schemaModule = require('../schema') as { schema: GraphQLSchema };
    schema = schemaModule.schema;

    mockContext = { user: { id: 42 }, db: mockDb };
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

  // ── twentyQuestionsStart mutation ────────────────────────────────────────

  describe('twentyQuestionsStart mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('twentyQuestionsStart');
      await expect(
        resolver(
          {},
          { difficulty: 'medium', sport: null },
          unauthCtx,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it('calls startGame with default baseball sport when sport is omitted', async () => {
      const resolver = getMutation('twentyQuestionsStart');
      await resolver(
        {},
        { difficulty: 'medium', sport: null },
        mockContext,
        undefined as never,
      );

      expect(mockTwentyQuestionsService.startGame).toHaveBeenCalledWith(
        mockContext.db,
        42,
        'medium',
        'baseball',
      );
    });

    it('calls startGame with provided sport', async () => {
      const resolver = getMutation('twentyQuestionsStart');
      await resolver(
        {},
        { difficulty: 'hard', sport: 'football' },
        mockContext,
        undefined as never,
      );

      expect(mockTwentyQuestionsService.startGame).toHaveBeenCalledWith(
        mockContext.db,
        42,
        'hard',
        'football',
      );
    });
  });

  // ── twentyQuestionsAsk mutation ───────────────────────────────────────────

  describe('twentyQuestionsAsk mutation', () => {
    const validInput = {
      input: {
        gameId: 'game-1',
        category: 'position',
        parameter: JSON.stringify({ position: 'CF' }),
      },
    };

    it('throws when unauthenticated', async () => {
      const resolver = getMutation('twentyQuestionsAsk');
      await expect(
        resolver({}, validInput, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('throws UserInputError("Game not found") when getGameState returns null', async () => {
      mockTwentyQuestionsService.getGameState.mockResolvedValueOnce(null);

      const resolver = getMutation('twentyQuestionsAsk');
      await expect(
        resolver({}, validInput, mockContext, undefined as never),
      ).rejects.toMatchObject({
        message: 'Game not found',
        extensions: { code: 'BAD_USER_INPUT' },
      });
    });

    it('classifies "Game is not active" as UserInputError instead of an uncaught server error', async () => {
      mockTwentyQuestionsService.askQuestion.mockRejectedValueOnce(
        new Error('Game is not active (status: abandoned)'),
      );

      const resolver = getMutation('twentyQuestionsAsk');
      await expect(
        resolver({}, validInput, mockContext, undefined as never),
      ).rejects.toMatchObject({
        message: 'Game is not active (status: abandoned)',
        extensions: { code: 'BAD_USER_INPUT' },
      });
    });

    it('classifies "Maximum questions reached" as UserInputError', async () => {
      mockTwentyQuestionsService.askQuestion.mockRejectedValueOnce(
        new Error('Maximum questions reached'),
      );

      const resolver = getMutation('twentyQuestionsAsk');
      await expect(
        resolver({}, validInput, mockContext, undefined as never),
      ).rejects.toMatchObject({
        message: 'Maximum questions reached',
        extensions: { code: 'BAD_USER_INPUT' },
      });
    });

    it('rethrows unrecognized errors unchanged', async () => {
      mockTwentyQuestionsService.askQuestion.mockRejectedValueOnce(
        new Error('Unexpected database failure'),
      );

      const resolver = getMutation('twentyQuestionsAsk');
      await expect(
        resolver({}, validInput, mockContext, undefined as never),
      ).rejects.toThrow('Unexpected database failure');
    });
  });

  // ── twentyQuestionsGuess mutation ─────────────────────────────────────────

  describe('twentyQuestionsGuess mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('twentyQuestionsGuess');
      await expect(
        resolver(
          {},
          { gameId: 'game-1', playerId: 99 },
          unauthCtx,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it('throws UserInputError("Game not found") when getGameState returns null', async () => {
      mockTwentyQuestionsService.getGameState.mockResolvedValueOnce(null);

      const resolver = getMutation('twentyQuestionsGuess');
      await expect(
        resolver(
          {},
          { gameId: 'game-1', playerId: 99 },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({
        message: 'Game not found',
        extensions: { code: 'BAD_USER_INPUT' },
      });
    });

    it('classifies "Game is not active" as UserInputError instead of an uncaught server error', async () => {
      mockTwentyQuestionsService.guessPlayer.mockRejectedValueOnce(
        new Error('Game is not active (status: abandoned)'),
      );

      const resolver = getMutation('twentyQuestionsGuess');
      await expect(
        resolver(
          {},
          { gameId: 'game-1', playerId: 99 },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({
        message: 'Game is not active (status: abandoned)',
        extensions: { code: 'BAD_USER_INPUT' },
      });
    });

    it('rethrows unrecognized errors unchanged', async () => {
      mockTwentyQuestionsService.guessPlayer.mockRejectedValueOnce(
        new Error('Unexpected database failure'),
      );

      const resolver = getMutation('twentyQuestionsGuess');
      await expect(
        resolver(
          {},
          { gameId: 'game-1', playerId: 99 },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('Unexpected database failure');
    });
  });

  // ── twentyQuestionsTokenBalance query ─────────────────────────────────────

  describe('twentyQuestionsTokenBalance query', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getQuery('twentyQuestionsTokenBalance');
      await expect(
        resolver({}, {}, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it("delegates to the service and returns the caller's balance", async () => {
      mockTwentyQuestionsService.getLifetimeTokenBalance.mockResolvedValueOnce(
        37,
      );

      const resolver = getQuery('twentyQuestionsTokenBalance');
      const result = await resolver({}, {}, mockContext, undefined as never);

      expect(
        mockTwentyQuestionsService.getLifetimeTokenBalance,
      ).toHaveBeenCalledWith(mockContext.db, 42);
      expect(result).toBe(37);
    });
  });

  // ── twentyQuestionsSpendableTokenBalance query ────────────────────────────

  describe('twentyQuestionsSpendableTokenBalance query', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getQuery('twentyQuestionsSpendableTokenBalance');
      await expect(
        resolver({}, {}, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it("delegates to the service and returns the caller's balance", async () => {
      mockTwentyQuestionsService.getLifetimeTokenBalance.mockResolvedValueOnce(
        37,
      );

      const resolver = getQuery('twentyQuestionsSpendableTokenBalance');
      const result = await resolver({}, {}, mockContext, undefined as never);

      expect(
        mockTwentyQuestionsService.getLifetimeTokenBalance,
      ).toHaveBeenCalledWith(mockContext.db, 42);
      expect(result).toBe(37);
    });
  });

  // ── twentyQuestionsAbandon mutation ───────────────────────────────────────

  describe('twentyQuestionsAbandon mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('twentyQuestionsAbandon');
      await expect(
        resolver({}, { gameId: 'game-1' }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('throws UserInputError("Game not found") when getGameState returns null', async () => {
      mockTwentyQuestionsService.getGameState.mockResolvedValueOnce(null);

      const resolver = getMutation('twentyQuestionsAbandon');
      await expect(
        resolver({}, { gameId: 'game-1' }, mockContext, undefined as never),
      ).rejects.toMatchObject({
        message: 'Game not found',
        extensions: { code: 'BAD_USER_INPUT' },
      });
    });

    it('classifies "Game is not active" as UserInputError instead of an uncaught server error', async () => {
      mockTwentyQuestionsService.abandonGame.mockRejectedValueOnce(
        new Error('Game is not active (status: abandoned)'),
      );

      const resolver = getMutation('twentyQuestionsAbandon');
      await expect(
        resolver({}, { gameId: 'game-1' }, mockContext, undefined as never),
      ).rejects.toMatchObject({
        message: 'Game is not active (status: abandoned)',
        extensions: { code: 'BAD_USER_INPUT' },
      });
    });

    it('rethrows unrecognized errors unchanged', async () => {
      mockTwentyQuestionsService.abandonGame.mockRejectedValueOnce(
        new Error('Unexpected database failure'),
      );

      const resolver = getMutation('twentyQuestionsAbandon');
      await expect(
        resolver({}, { gameId: 'game-1' }, mockContext, undefined as never),
      ).rejects.toThrow('Unexpected database failure');
    });
  });
});
