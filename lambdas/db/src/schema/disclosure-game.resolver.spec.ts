/**
 * Unit tests for the disclosure-game GraphQL resolvers (LS-3820 / LS-4411).
 *
 * Covers:
 *   - disclosureGameBestScore: unauthenticated throws; returns null and number
 *   - minigamesStats: unauthenticated throws; returns correct aggregate shape;
 *     returns null earliestYear when table is empty
 *   - startDisclosureGame: GameUnavailableError when no eligible players
 *   - nextClue: UserInputError for all expected service error messages
 *   - submitGuess: UserInputError for session-not-found / already-ended
 *   - giveUpDisclosureGame: UserInputError for session-not-found / already-ended
 */

import type { GraphQLSchema } from 'graphql';

describe('disclosure-game resolvers', () => {
  let schema: GraphQLSchema;
  let mockDisclosureGameService: {
    getBestScore: jest.Mock;
    startSession: jest.Mock;
    nextClue: jest.Mock;
    submitGuess: jest.Mock;
    giveUp: jest.Mock;
  };
  let mockFromBatting: jest.Mock;
  let mockFromPlayers: jest.Mock;
  let mockDb: Record<string, jest.Mock>;
  let mockContext: { user: { id: number }; db: typeof mockDb };

  beforeEach(() => {
    jest.resetModules();

    mockDisclosureGameService = {
      getBestScore: jest.fn().mockResolvedValue(null),
      startSession: jest
        .fn()
        .mockResolvedValue({ sessionId: 1, totalClues: 5 }),
      nextClue: jest.fn().mockResolvedValue({
        clueText: 'Test clue',
        difficultyTier: 'vague',
        clueIndex: 1,
        totalClues: 5,
        isLastClue: false,
      }),
      submitGuess: jest.fn().mockResolvedValue({
        correct: true,
        score: 80,
        correctPlayerId: null,
        cluesUsed: 2,
      }),
      giveUp: jest.fn().mockResolvedValue({
        correctPlayerId: 123,
        correctPlayerName: 'Babe Ruth',
      }),
    };

    // Each call to select() returns an object whose from() resolves to a row.
    // Use separate mocks so we can control batting vs players results
    // independently across tests.
    mockFromBatting = jest
      .fn()
      .mockResolvedValue([{ playerSeasons: 1_234_567, earliestYear: 1871 }]);
    mockFromPlayers = jest.fn().mockResolvedValue([{ playersTracked: 9_876 }]);

    let selectCallCount = 0;
    mockDb = {
      select: jest.fn().mockImplementation(() => {
        selectCallCount += 1;
        // First select → batting aggregate; second select → players count
        return {
          from: selectCallCount === 1 ? mockFromBatting : mockFromPlayers,
        };
      }),
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

    jest.doMock('@legacy-sports/utils/node', () => ({
      getDbOptions: jest.fn(() => ({})),
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
      createBadgeService: jest.fn(() => ({
        getUserBadges: jest.fn().mockResolvedValue([]),
        getTeamBadges: jest.fn().mockResolvedValue([]),
        getUserBadgeProgress: jest.fn().mockResolvedValue([]),
        evaluateDraftBadges: jest.fn().mockResolvedValue([]),
        evaluateMatchupBadges: jest.fn().mockResolvedValue([]),
        awardLeagueChampion: jest.fn().mockResolvedValue(undefined),
        awardPlayoffAppearances: jest.fn().mockResolvedValue(undefined),
      })),
      DisclosureGameService: jest
        .fn()
        .mockImplementation(() => mockDisclosureGameService),
      PublicSchema: {
        seasonBatting: { playerId: 'playerId', season: 'season' },
        players: { id: 'id', firstName: 'firstName', lastName: 'lastName' },
        disclosureGameSessions: {
          id: 'id',
          userId: 'userId',
          status: 'status',
          score: 'score',
        },
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
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
    const schemaModule = require('../schema') as { schema: GraphQLSchema };
    schema = schemaModule.schema;

    mockContext = { user: { id: 42 }, db: mockDb };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function getQuery(name: string) {
    const field = schema.getQueryType()?.getFields()[name];
    if (!field?.resolve) throw new Error(`${name} resolver not found`);
    return field.resolve;
  }

  function getMutation(name: string) {
    const field = schema.getMutationType()?.getFields()[name];
    if (!field?.resolve) throw new Error(`${name} resolver not found`);
    return field.resolve;
  }

  const unauthCtx = { user: null, db: null };

  // ── disclosureGameBestScore ───────────────────────────────────────────────

  describe('disclosureGameBestScore query', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getQuery('disclosureGameBestScore');
      await expect(
        resolver({}, {}, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('returns null when the user has no won sessions', async () => {
      mockDisclosureGameService.getBestScore.mockResolvedValueOnce(null);

      const resolver = getQuery('disclosureGameBestScore');
      const result = await resolver({}, {}, mockContext, undefined as never);

      expect(result).toBeNull();
      expect(mockDisclosureGameService.getBestScore).toHaveBeenCalledWith(42);
    });

    it('returns the best score when the user has won sessions', async () => {
      mockDisclosureGameService.getBestScore.mockResolvedValueOnce(85);

      const resolver = getQuery('disclosureGameBestScore');
      const result = await resolver({}, {}, mockContext, undefined as never);

      expect(result).toBe(85);
      expect(mockDisclosureGameService.getBestScore).toHaveBeenCalledWith(42);
    });
  });

  // ── minigamesStats ────────────────────────────────────────────────────────

  describe('minigamesStats query', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getQuery('minigamesStats');
      await expect(
        resolver({}, {}, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('returns correct aggregate shape from both queries', async () => {
      const resolver = getQuery('minigamesStats');
      const result = (await resolver(
        {},
        {},
        mockContext,
        undefined as never,
      )) as {
        playerSeasons: number;
        earliestYear: number | null;
        playersTracked: number;
      };

      expect(result).toMatchObject({
        playerSeasons: 1_234_567,
        earliestYear: 1871,
        playersTracked: 9_876,
      });
    });

    it('returns null earliestYear when the batting table is empty', async () => {
      mockFromBatting.mockResolvedValueOnce([
        { playerSeasons: 0, earliestYear: null },
      ]);

      const resolver = getQuery('minigamesStats');
      const result = (await resolver(
        {},
        {},
        mockContext,
        undefined as never,
      )) as {
        playerSeasons: number;
        earliestYear: number | null;
        playersTracked: number;
      };

      expect(result.earliestYear).toBeNull();
      expect(result.playerSeasons).toBe(0);
    });

    it('coerces bigint playerSeasons and playersTracked to JS number', async () => {
      mockFromBatting.mockResolvedValueOnce([
        { playerSeasons: BigInt(2_000_000), earliestYear: 1900 },
      ]);
      mockFromPlayers.mockResolvedValueOnce([
        { playersTracked: BigInt(10_000) },
      ]);

      const resolver = getQuery('minigamesStats');
      const result = (await resolver(
        {},
        {},
        mockContext,
        undefined as never,
      )) as {
        playerSeasons: number;
        earliestYear: number | null;
        playersTracked: number;
      };

      expect(typeof result.playerSeasons).toBe('number');
      expect(result.playerSeasons).toBe(2_000_000);
      expect(typeof result.playersTracked).toBe('number');
      expect(result.playersTracked).toBe(10_000);
    });
  });

  // ── startDisclosureGame mutation ──────────────────────────────────────────

  describe('startDisclosureGame mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('startDisclosureGame');
      await expect(
        resolver({}, {}, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('throws GameUnavailableError when no eligible players found', async () => {
      mockDisclosureGameService.startSession.mockRejectedValueOnce(
        new Error('No eligible players found for this user'),
      );

      const resolver = getMutation('startDisclosureGame');
      await expect(
        resolver({}, {}, mockContext, undefined as never),
      ).rejects.toMatchObject({ extensions: { code: 'GAME_UNAVAILABLE' } });
    });

    it('returns sessionId and totalClues on success', async () => {
      const resolver = getMutation('startDisclosureGame');
      const result = await resolver({}, {}, mockContext, undefined as never);

      expect(result).toEqual({ sessionId: 1, totalClues: 5 });
      expect(mockDisclosureGameService.startSession).toHaveBeenCalledWith(42);
    });
  });

  // ── nextClue mutation ─────────────────────────────────────────────────────

  describe('nextClue mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('nextClue');
      await expect(
        resolver({}, { sessionId: 1 }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it.each([
      'Session not found',
      'Session is already won',
      'Session is already lost',
      'No more clues available — session ended as lost',
      'Concurrent nextClue call detected — please retry',
    ])('throws UserInputError for "%s"', async (message) => {
      mockDisclosureGameService.nextClue.mockRejectedValueOnce(
        new Error(message),
      );

      const resolver = getMutation('nextClue');
      await expect(
        resolver({}, { sessionId: 1 }, mockContext, undefined as never),
      ).rejects.toMatchObject({
        message,
        extensions: { code: 'BAD_USER_INPUT' },
      });
    });

    it('rethrows unknown errors as-is', async () => {
      const boom = new Error('unexpected DB failure');
      mockDisclosureGameService.nextClue.mockRejectedValueOnce(boom);

      const resolver = getMutation('nextClue');
      await expect(
        resolver({}, { sessionId: 1 }, mockContext, undefined as never),
      ).rejects.toThrow('unexpected DB failure');
    });
  });

  // ── submitGuess mutation ──────────────────────────────────────────────────

  describe('submitGuess mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('submitGuess');
      await expect(
        resolver(
          {},
          { sessionId: 1, guessedPlayerId: 99 },
          unauthCtx,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it.each(['Session not found', 'Session is already won'])(
      'throws UserInputError for "%s"',
      async (message) => {
        mockDisclosureGameService.submitGuess.mockRejectedValueOnce(
          new Error(message),
        );

        const resolver = getMutation('submitGuess');
        await expect(
          resolver(
            {},
            { sessionId: 1, guessedPlayerId: 99 },
            mockContext,
            undefined as never,
          ),
        ).rejects.toMatchObject({
          message,
          extensions: { code: 'BAD_USER_INPUT' },
        });
      },
    );
  });

  // ── giveUpDisclosureGame mutation ─────────────────────────────────────────

  describe('giveUpDisclosureGame mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('giveUpDisclosureGame');
      await expect(
        resolver({}, { sessionId: 1 }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it.each(['Session not found', 'Session is already given_up'])(
      'throws UserInputError for "%s"',
      async (message) => {
        mockDisclosureGameService.giveUp.mockRejectedValueOnce(
          new Error(message),
        );

        const resolver = getMutation('giveUpDisclosureGame');
        await expect(
          resolver({}, { sessionId: 1 }, mockContext, undefined as never),
        ).rejects.toMatchObject({
          message,
          extensions: { code: 'BAD_USER_INPUT' },
        });
      },
    );

    it('returns correctPlayerId and correctPlayerName on success', async () => {
      const resolver = getMutation('giveUpDisclosureGame');
      const result = await resolver(
        {},
        { sessionId: 1 },
        mockContext,
        undefined as never,
      );

      expect(result).toEqual({
        correctPlayerId: 123,
        correctPlayerName: 'Babe Ruth',
      });
      expect(mockDisclosureGameService.giveUp).toHaveBeenCalledWith(1, 42);
    });
  });
});
