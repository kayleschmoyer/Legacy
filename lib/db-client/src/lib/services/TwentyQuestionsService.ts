import { and, eq, gte, lte, or, sql } from 'drizzle-orm';
import { LOGGER } from '@legacy-sports/logging';
import type { PublicDb } from '../client/PublicDbClient';
import * as PublicSchema from '../../drizzle/public/schema';

export type QuestionCategory =
  | 'position'
  | 'team'
  | 'era'
  | 'hall_of_fame'
  | 'stat_threshold'
  | 'batting_hand'
  | 'throwing_hand'
  | 'active_status';

export interface GameStateWithQuestions {
  id: string;
  userId: number;
  targetPlayerId: number;
  status: string;
  questionsUsed: number;
  maxQuestions: number;
  difficulty: string;
  tokensEarned: number | null;
  startedAt: string;
  completedAt: string | null;
  questions: Array<typeof PublicSchema.twentyQuestionsQuestions.$inferSelect>;
}

export interface PlayerRecord {
  id: number;
  firstName: string;
  lastName: string;
  hallOfFame: boolean;
  allStarSelections: number;
  mvpAwards: number;
  totalGames: number;
}

// Whitelisted stat column names for stat_threshold queries (prevents SQL injection)
const VALID_BATTING_STATS = new Set([
  'hr',
  'h',
  'rbi',
  'sb',
  'r',
  'doubles',
  'triples',
  'bb',
  'tb',
  'g',
]);
const VALID_PITCHING_STATS = new Set(['w', 'so', 'sv', 'sho', 'cg', 'g', 'gs']);

export class TwentyQuestionsService {
  static async startGame(
    db: PublicDb,
    userId: number,
    difficulty: 'easy' | 'medium' | 'hard',
  ): Promise<typeof PublicSchema.twentyQuestionsGames.$inferSelect> {
    const [existingActive] = await db
      .select({ id: PublicSchema.twentyQuestionsGames.id })
      .from(PublicSchema.twentyQuestionsGames)
      .where(
        and(
          eq(PublicSchema.twentyQuestionsGames.userId, userId),
          eq(PublicSchema.twentyQuestionsGames.status, 'active'),
        ),
      )
      .limit(1);

    if (existingActive) {
      throw new Error(
        'You already have an active 20 Questions game. Finish or abandon it first.',
      );
    }

    const pool = await TwentyQuestionsService.getPlayerPool(db, difficulty);
    if (pool.length === 0) {
      throw new Error(
        `No eligible players found for difficulty: ${difficulty}`,
      );
    }

    const targetPlayerId = pool[Math.floor(Math.random() * pool.length)];

    const [game] = await db
      .insert(PublicSchema.twentyQuestionsGames)
      .values({
        userId,
        targetPlayerId,
        status: 'active',
        questionsUsed: 0,
        maxQuestions: 20,
        difficulty,
      })
      .returning();

    LOGGER.info(
      `Started 20 Questions game ${game.id} for user ${userId} (${difficulty})`,
    );

    return game;
  }

  static async getGameState(
    db: PublicDb,
    gameId: string,
  ): Promise<GameStateWithQuestions | null> {
    const [game] = await db
      .select()
      .from(PublicSchema.twentyQuestionsGames)
      .where(eq(PublicSchema.twentyQuestionsGames.id, gameId))
      .limit(1);

    if (!game) return null;

    const questions = await db
      .select()
      .from(PublicSchema.twentyQuestionsQuestions)
      .where(eq(PublicSchema.twentyQuestionsQuestions.gameId, gameId))
      .orderBy(PublicSchema.twentyQuestionsQuestions.questionNumber);

    return { ...game, questions };
  }

  static async getActiveGame(
    db: PublicDb,
    userId: number,
  ): Promise<GameStateWithQuestions | null> {
    const [game] = await db
      .select({ id: PublicSchema.twentyQuestionsGames.id })
      .from(PublicSchema.twentyQuestionsGames)
      .where(
        and(
          eq(PublicSchema.twentyQuestionsGames.userId, userId),
          eq(PublicSchema.twentyQuestionsGames.status, 'active'),
        ),
      )
      .limit(1);

    if (!game) return null;

    return TwentyQuestionsService.getGameState(db, game.id);
  }

  static async askQuestion(
    db: PublicDb,
    gameId: string,
    userId: number,
    category: QuestionCategory,
    parameter: Record<string, unknown>,
  ): Promise<{ answer: boolean; questionsUsed: number; gameStatus: string }> {
    const game = await TwentyQuestionsService.assertGameOwnership(
      db,
      gameId,
      userId,
    );

    if (game.status !== 'active') {
      throw new Error(`Game is not active (status: ${game.status})`);
    }

    if (game.questionsUsed >= game.maxQuestions) {
      throw new Error('Maximum questions reached');
    }

    const answer = await TwentyQuestionsService.answerQuestion(
      db,
      game.targetPlayerId,
      category,
      parameter,
    );

    const questionNumber = game.questionsUsed + 1;

    await db.insert(PublicSchema.twentyQuestionsQuestions).values({
      gameId,
      questionNumber,
      category,
      parameter,
      answer,
      isGuess: false,
    });

    const newQuestionsUsed = questionNumber;
    const isLastQuestion = newQuestionsUsed >= game.maxQuestions;

    await db
      .update(PublicSchema.twentyQuestionsGames)
      .set({
        questionsUsed: newQuestionsUsed,
        ...(isLastQuestion
          ? { status: 'lost', completedAt: new Date().toISOString() }
          : {}),
      })
      .where(eq(PublicSchema.twentyQuestionsGames.id, gameId));

    const gameStatus = isLastQuestion ? 'lost' : 'active';

    LOGGER.info(
      `Game ${gameId}: question ${questionNumber} (${category}) answered ${answer}`,
    );

    return { answer, questionsUsed: newQuestionsUsed, gameStatus };
  }

  static async guessPlayer(
    db: PublicDb,
    gameId: string,
    userId: number,
    guessPlayerId: number,
  ): Promise<{
    correct: boolean;
    questionsUsed: number;
    tokensEarned: number | null;
    targetPlayer?: PlayerRecord;
  }> {
    const game = await TwentyQuestionsService.assertGameOwnership(
      db,
      gameId,
      userId,
    );

    if (game.status !== 'active') {
      throw new Error(`Game is not active (status: ${game.status})`);
    }

    if (guessPlayerId === game.targetPlayerId) {
      const questionsRemaining = game.maxQuestions - game.questionsUsed;
      const baseTokens =
        questionsRemaining >= 20
          ? 100
          : questionsRemaining >= 15
            ? 75
            : questionsRemaining >= 10
              ? 50
              : questionsRemaining >= 5
                ? 25
                : questionsRemaining >= 1
                  ? 10
                  : 0;
      const multiplier =
        game.difficulty === 'hard' ? 2 : game.difficulty === 'medium' ? 1.5 : 1;
      const tokensEarned = Math.round(baseTokens * multiplier);

      // TODO(LS-1702): submit tokens to token service
      await db
        .update(PublicSchema.twentyQuestionsGames)
        .set({
          status: 'won',
          tokensEarned,
          completedAt: new Date().toISOString(),
        })
        .where(eq(PublicSchema.twentyQuestionsGames.id, gameId));

      const targetPlayer = await TwentyQuestionsService.fetchPlayer(
        db,
        game.targetPlayerId,
      );

      LOGGER.info(
        `Game ${gameId} won by user ${userId}, tokens earned: ${tokensEarned}`,
      );

      return {
        correct: true,
        questionsUsed: game.questionsUsed,
        tokensEarned,
        targetPlayer,
      };
    }

    // Wrong guess — record as a question row and count against the limit
    const questionNumber = game.questionsUsed + 1;
    await db.insert(PublicSchema.twentyQuestionsQuestions).values({
      gameId,
      questionNumber,
      // isGuess=true rows don't carry a meaningful category; 'position' is a
      // valid placeholder that satisfies the NOT NULL constraint.
      category: 'position',
      parameter: {},
      answer: false,
      isGuess: true,
      guessPlayerId,
    });

    const newQuestionsUsed = questionNumber;
    const isGameOver = newQuestionsUsed >= game.maxQuestions;

    await db
      .update(PublicSchema.twentyQuestionsGames)
      .set({
        questionsUsed: newQuestionsUsed,
        ...(isGameOver
          ? { status: 'lost', completedAt: new Date().toISOString() }
          : {}),
      })
      .where(eq(PublicSchema.twentyQuestionsGames.id, gameId));

    let targetPlayer: PlayerRecord | undefined;
    if (isGameOver) {
      targetPlayer = await TwentyQuestionsService.fetchPlayer(
        db,
        game.targetPlayerId,
      );
      LOGGER.info(`Game ${gameId} lost — max questions reached`);
    }

    return {
      correct: false,
      questionsUsed: newQuestionsUsed,
      tokensEarned: null,
      targetPlayer,
    };
  }

  static async abandonGame(
    db: PublicDb,
    gameId: string,
    userId: number,
  ): Promise<void> {
    const game = await TwentyQuestionsService.assertGameOwnership(
      db,
      gameId,
      userId,
    );

    if (game.status !== 'active') {
      throw new Error(`Game is not active (status: ${game.status})`);
    }

    await db
      .update(PublicSchema.twentyQuestionsGames)
      .set({ status: 'abandoned', completedAt: new Date().toISOString() })
      .where(eq(PublicSchema.twentyQuestionsGames.id, gameId));

    LOGGER.info(`Game ${gameId} abandoned by user ${userId}`);
  }

  static async getPlayerPool(
    db: PublicDb,
    difficulty: 'easy' | 'medium' | 'hard',
  ): Promise<number[]> {
    let rows: Array<{ id: number }>;

    if (difficulty === 'easy') {
      rows = await db
        .select({ id: PublicSchema.players.id })
        .from(PublicSchema.players)
        .where(
          or(
            eq(PublicSchema.players.hallOfFame, true),
            gte(PublicSchema.players.allStarSelections, 1),
          ),
        );
    } else if (difficulty === 'medium') {
      rows = await db
        .select({ id: PublicSchema.players.id })
        .from(PublicSchema.players)
        .where(gte(PublicSchema.players.totalGames, 100));
    } else {
      rows = await db
        .select({ id: PublicSchema.players.id })
        .from(PublicSchema.players)
        .where(
          and(
            lte(PublicSchema.players.totalGames, 99),
            gte(PublicSchema.players.totalGames, 1),
          ),
        );
    }

    return rows.map((r) => r.id);
  }

  private static async assertGameOwnership(
    db: PublicDb,
    gameId: string,
    userId: number,
  ): Promise<typeof PublicSchema.twentyQuestionsGames.$inferSelect> {
    const [game] = await db
      .select()
      .from(PublicSchema.twentyQuestionsGames)
      .where(eq(PublicSchema.twentyQuestionsGames.id, gameId))
      .limit(1);

    if (!game) {
      throw new Error(`Game not found: ${gameId}`);
    }

    if (game.userId !== userId) {
      throw new Error('Game does not belong to this user');
    }

    return game;
  }

  private static async answerQuestion(
    db: PublicDb,
    playerId: number,
    category: QuestionCategory,
    parameter: Record<string, unknown>,
  ): Promise<boolean> {
    switch (category) {
      case 'position': {
        const position = parameter['position'] as string;
        const rows = await db
          .select({ playerId: PublicSchema.seasonFielding.playerId })
          .from(PublicSchema.seasonFielding)
          .where(
            and(
              eq(PublicSchema.seasonFielding.playerId, playerId),
              eq(PublicSchema.seasonFielding.pos, position),
            ),
          )
          .limit(1);
        return rows.length > 0;
      }

      case 'team': {
        const team = parameter['team'] as string;
        const [battingRow] = await db
          .select({ playerId: PublicSchema.seasonBatting.playerId })
          .from(PublicSchema.seasonBatting)
          .where(
            and(
              eq(PublicSchema.seasonBatting.playerId, playerId),
              eq(PublicSchema.seasonBatting.team, team),
            ),
          )
          .limit(1);
        if (battingRow) return true;

        const [pitchingRow] = await db
          .select({ playerId: PublicSchema.seasonPitching.playerId })
          .from(PublicSchema.seasonPitching)
          .where(
            and(
              eq(PublicSchema.seasonPitching.playerId, playerId),
              eq(PublicSchema.seasonPitching.team, team),
            ),
          )
          .limit(1);
        return !!pitchingRow;
      }

      case 'era': {
        const decade = parameter['decade'] as number;
        const [battingRow] = await db
          .select({ playerId: PublicSchema.seasonBatting.playerId })
          .from(PublicSchema.seasonBatting)
          .where(
            and(
              eq(PublicSchema.seasonBatting.playerId, playerId),
              gte(PublicSchema.seasonBatting.season, decade),
              lte(PublicSchema.seasonBatting.season, decade + 9),
            ),
          )
          .limit(1);
        if (battingRow) return true;

        const [pitchingRow] = await db
          .select({ playerId: PublicSchema.seasonPitching.playerId })
          .from(PublicSchema.seasonPitching)
          .where(
            and(
              eq(PublicSchema.seasonPitching.playerId, playerId),
              gte(PublicSchema.seasonPitching.season, decade),
              lte(PublicSchema.seasonPitching.season, decade + 9),
            ),
          )
          .limit(1);
        return !!pitchingRow;
      }

      case 'hall_of_fame': {
        const [player] = await db
          .select({ hallOfFame: PublicSchema.players.hallOfFame })
          .from(PublicSchema.players)
          .where(eq(PublicSchema.players.id, playerId))
          .limit(1);
        return player?.hallOfFame ?? false;
      }

      case 'stat_threshold': {
        const statRaw = (parameter['stat'] as string).toLowerCase();
        const threshold = parameter['threshold'] as number;
        const playerType = parameter['playerType'] as string;

        if (playerType === 'pitcher') {
          if (!VALID_PITCHING_STATS.has(statRaw)) {
            throw new Error(`Invalid pitching stat: ${statRaw}`);
          }
          const result = await db.execute(
            sql`SELECT COALESCE(SUM(${sql.raw(statRaw)}), 0)::int AS total
                FROM season_pitching
                WHERE player_id = ${playerId}`,
          );
          const total =
            (result as unknown as Array<{ total: number }>)[0]?.total ?? 0;
          return total >= threshold;
        } else {
          if (!VALID_BATTING_STATS.has(statRaw)) {
            throw new Error(`Invalid batting stat: ${statRaw}`);
          }
          const result = await db.execute(
            sql`SELECT COALESCE(SUM(${sql.raw(statRaw)}), 0)::int AS total
                FROM season_batting
                WHERE player_id = ${playerId}`,
          );
          const total =
            (result as unknown as Array<{ total: number }>)[0]?.total ?? 0;
          return total >= threshold;
        }
      }

      case 'batting_hand': {
        const hand = parameter['hand'] as string;
        const [player] = await db
          .select({ batHand: PublicSchema.players.batHand })
          .from(PublicSchema.players)
          .where(eq(PublicSchema.players.id, playerId))
          .limit(1);
        return player?.batHand === hand;
      }

      case 'throwing_hand': {
        const hand = parameter['hand'] as string;
        const [player] = await db
          .select({ throwHand: PublicSchema.players.throwHand })
          .from(PublicSchema.players)
          .where(eq(PublicSchema.players.id, playerId))
          .limit(1);
        return player?.throwHand === hand;
      }

      case 'active_status': {
        const [battingRow] = await db
          .select({ playerId: PublicSchema.seasonBatting.playerId })
          .from(PublicSchema.seasonBatting)
          .where(
            and(
              eq(PublicSchema.seasonBatting.playerId, playerId),
              gte(PublicSchema.seasonBatting.season, 2023),
            ),
          )
          .limit(1);
        if (battingRow) return true;

        const [pitchingRow] = await db
          .select({ playerId: PublicSchema.seasonPitching.playerId })
          .from(PublicSchema.seasonPitching)
          .where(
            and(
              eq(PublicSchema.seasonPitching.playerId, playerId),
              gte(PublicSchema.seasonPitching.season, 2023),
            ),
          )
          .limit(1);
        return !!pitchingRow;
      }

      default:
        throw new Error(`Unknown question category: ${category as string}`);
    }
  }

  private static async fetchPlayer(
    db: PublicDb,
    playerId: number,
  ): Promise<PlayerRecord> {
    const [player] = await db
      .select({
        id: PublicSchema.players.id,
        firstName: PublicSchema.players.firstName,
        lastName: PublicSchema.players.lastName,
        hallOfFame: PublicSchema.players.hallOfFame,
        allStarSelections: PublicSchema.players.allStarSelections,
        mvpAwards: PublicSchema.players.mvpAwards,
        totalGames: PublicSchema.players.totalGames,
      })
      .from(PublicSchema.players)
      .where(eq(PublicSchema.players.id, playerId))
      .limit(1);

    if (!player) {
      throw new Error(`Player not found: ${playerId}`);
    }

    return player;
  }
}
