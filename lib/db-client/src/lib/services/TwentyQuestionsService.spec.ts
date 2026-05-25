/**
 * Unit tests for TwentyQuestionsService sport-scoping logic (LS-4764).
 *
 * Covers:
 *   - getPlayerPool: returns player IDs filtered by sport for each difficulty
 *   - startGame: stores the provided sport in the inserted game row
 */

import { TwentyQuestionsService } from './TwentyQuestionsService';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../drizzle/public/schema', () => ({
  players: {
    id: 'id',
    sport: 'sport',
    hallOfFame: 'hall_of_fame',
    allStarSelections: 'all_star_selections',
    totalGames: 'total_games',
  },
  twentyQuestionsGames: {
    id: 'id',
    userId: 'user_id',
    status: 'status',
    targetPlayerId: 'target_player_id',
    questionsUsed: 'questions_used',
    maxQuestions: 'max_questions',
    difficulty: 'difficulty',
    sport: 'sport',
  },
  twentyQuestionsQuestions: {
    gameId: 'game_id',
    questionNumber: 'question_number',
  },
}));

/**
 * Returns an object that:
 *   - Resolves to `rows` when directly awaited (for getPlayerPool which has no .limit())
 *   - Has a .limit() method that resolves to `limitRows` (for startGame's active-game check)
 */
function chainResult(rows: unknown[], limitRows: unknown[] = []) {
  return {
    then(
      onFulfilled: (v: unknown) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) {
      return Promise.resolve(rows).then(onFulfilled, onRejected);
    },
    catch(onRejected: (e: unknown) => unknown) {
      return Promise.resolve(rows).catch(onRejected);
    },
    finally(cb: () => void) {
      return Promise.resolve(rows).finally(cb);
    },
    limit: jest.fn().mockResolvedValue(limitRows),
  };
}

function makeMockDb() {
  const db = {
    select: jest.fn(),
    from: jest.fn(),
    where: jest.fn(),
    insert: jest.fn(),
    values: jest.fn(),
    returning: jest.fn(),
  };
  db.select.mockReturnValue(db);
  db.from.mockReturnValue(db);
  db.insert.mockReturnValue(db);
  db.values.mockReturnValue(db);
  return db;
}

describe('TwentyQuestionsService — getPlayerPool', () => {
  it('returns player IDs for the easy difficulty pool', async () => {
    const db = makeMockDb();
    db.where.mockReturnValue(chainResult([{ id: 1 }, { id: 2 }, { id: 3 }]));

    const result = await TwentyQuestionsService.getPlayerPool(
      db as never,
      'easy',
      'baseball',
    );

    expect(result).toEqual([1, 2, 3]);
    expect(db.where).toHaveBeenCalledTimes(1);
  });

  it('returns player IDs for the medium difficulty pool', async () => {
    const db = makeMockDb();
    db.where.mockReturnValue(chainResult([{ id: 10 }, { id: 20 }]));

    const result = await TwentyQuestionsService.getPlayerPool(
      db as never,
      'medium',
      'football',
    );

    expect(result).toEqual([10, 20]);
  });

  it('returns player IDs for the hard difficulty pool', async () => {
    const db = makeMockDb();
    db.where.mockReturnValue(chainResult([{ id: 99 }]));

    const result = await TwentyQuestionsService.getPlayerPool(
      db as never,
      'hard',
      'baseball',
    );

    expect(result).toEqual([99]);
  });

  it('returns an empty array when no players match', async () => {
    const db = makeMockDb();
    db.where.mockReturnValue(chainResult([]));

    const result = await TwentyQuestionsService.getPlayerPool(
      db as never,
      'easy',
      'football',
    );

    expect(result).toEqual([]);
  });
});

describe('TwentyQuestionsService — startGame sport storage', () => {
  const insertedGameFootball = {
    id: 'game-uuid',
    userId: 42,
    targetPlayerId: 99,
    status: 'active',
    questionsUsed: 0,
    maxQuestions: 20,
    difficulty: 'medium',
    sport: 'football',
    tokensEarned: null,
    startedAt: '2026-01-01T00:00:00Z',
    completedAt: null,
  };

  it('inserts the game record with the provided sport', async () => {
    const db = makeMockDb();
    // First where call: active-game check (.limit(1) returns [] = no active game)
    db.where
      .mockReturnValueOnce(chainResult([], []))
      // Second where call: getPlayerPool returns one player
      .mockReturnValueOnce(chainResult([{ id: 99 }]));
    db.returning.mockResolvedValueOnce([insertedGameFootball]);

    const result = await TwentyQuestionsService.startGame(
      db as never,
      42,
      'medium',
      'football',
    );

    expect(result.sport).toBe('football');
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({ sport: 'football', userId: 42 }),
    );
  });

  it('defaults to baseball when sport is omitted', async () => {
    const insertedGameBaseball = { ...insertedGameFootball, sport: 'baseball' };
    const db = makeMockDb();
    db.where
      .mockReturnValueOnce(chainResult([], []))
      .mockReturnValueOnce(chainResult([{ id: 5 }]));
    db.returning.mockResolvedValueOnce([insertedGameBaseball]);

    const result = await TwentyQuestionsService.startGame(
      db as never,
      1,
      'easy',
    );

    expect(result.sport).toBe('baseball');
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({ sport: 'baseball' }),
    );
  });

  it('throws when an active game already exists', async () => {
    const db = makeMockDb();
    // Active-game check returns an existing game
    db.where.mockReturnValueOnce(chainResult([], [{ id: 'existing-game' }]));

    await expect(
      TwentyQuestionsService.startGame(db as never, 42, 'medium', 'baseball'),
    ).rejects.toThrow('already have an active 20 Questions game');
  });
});
