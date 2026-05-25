import {
  type GameStateWithQuestions,
  PublicSchema,
  type QuestionCategory,
  TwentyQuestionsService,
} from '@legacy-sports/db-client';
import { desc, eq, inArray } from 'drizzle-orm';
import { builder } from './builder';
import { PlayerRef } from './players';
import { AuthenticationError, UserInputError } from './graphql-errors';
import { SportKindEnum } from './leagues/types';

// --- Enums ---

const TwentyQuestionsStatusEnum = builder.enumType('TwentyQuestionsStatus', {
  values: ['active', 'won', 'lost', 'abandoned'] as const,
});

const TwentyQuestionsDifficultyEnum = builder.enumType(
  'TwentyQuestionsDifficulty',
  {
    values: ['easy', 'medium', 'hard'] as const,
  },
);

const TwentyQuestionsCategoryEnum = builder.enumType(
  'TwentyQuestionsCategory',
  {
    values: [
      'position',
      'team',
      'era',
      'hall_of_fame',
      'stat_threshold',
      'batting_hand',
      'throwing_hand',
      'active_status',
    ] as const,
  },
);

// --- Object types ---

type QuestionRow = typeof PublicSchema.twentyQuestionsQuestions.$inferSelect;

const TwentyQuestionsQuestionRef = builder.objectRef<QuestionRow>(
  'TwentyQuestionsQuestion',
);

TwentyQuestionsQuestionRef.implement({
  description: 'A single yes/no question asked during a 20 Questions game',
  fields: (t) => ({
    questionNumber: t.exposeInt('questionNumber'),
    category: t.field({
      type: TwentyQuestionsCategoryEnum,
      resolve: (q) => q.category as QuestionCategory,
    }),
    parameter: t.string({
      description:
        'JSON-encoded question parameters (e.g. position, team, decade)',
      resolve: (q) => JSON.stringify(q.parameter),
    }),
    answer: t.exposeBoolean('answer'),
    isGuess: t.exposeBoolean('isGuess'),
    guessPlayer: t.field({
      type: PlayerRef,
      nullable: true,
      resolve: (q, _args, context) => {
        if (!q.isGuess || q.guessPlayerId == null) return null;
        return context.loaders.players.load(q.guessPlayerId);
      },
    }),
  }),
});

const TwentyQuestionsGameRef = builder.objectRef<GameStateWithQuestions>(
  'TwentyQuestionsGame',
);

TwentyQuestionsGameRef.implement({
  description: 'State of a 20 Questions game session',
  fields: (t) => ({
    id: t.exposeString('id'),
    status: t.field({
      type: TwentyQuestionsStatusEnum,
      resolve: (g) => g.status as 'active' | 'won' | 'lost' | 'abandoned',
    }),
    difficulty: t.field({
      type: TwentyQuestionsDifficultyEnum,
      resolve: (g) => g.difficulty as 'easy' | 'medium' | 'hard',
    }),
    questionsUsed: t.exposeInt('questionsUsed'),
    maxQuestions: t.exposeInt('maxQuestions'),
    sport: t.field({
      type: SportKindEnum,
      description: 'Sport the player pool was drawn from',
      resolve: (g) => g.sport ?? 'baseball',
    }),
    tokensEarned: t.exposeInt('tokensEarned', { nullable: true }),
    startedAt: t.exposeString('startedAt'),
    completedAt: t.exposeString('completedAt', { nullable: true }),
    questions: t.field({
      type: [TwentyQuestionsQuestionRef],
      resolve: (g) => g.questions,
    }),
    targetPlayer: t.field({
      type: PlayerRef,
      nullable: true,
      description: 'Revealed only when status is won or lost',
      resolve: (g, _args, context) => {
        if (g.status === 'active') return null;
        return context.loaders.players.load(g.targetPlayerId);
      },
    }),
  }),
});

// --- Input types ---

const TwentyQuestionsAskInput = builder.inputType('TwentyQuestionsAskInput', {
  fields: (t) => ({
    gameId: t.string({ required: true }),
    category: t.field({ type: TwentyQuestionsCategoryEnum, required: true }),
    parameter: t.string({
      required: true,
      description: 'JSON-encoded question parameters',
    }),
  }),
});

// --- Queries ---

builder.queryFields((t) => ({
  twentyQuestionsActiveGame: t.field({
    type: TwentyQuestionsGameRef,
    nullable: true,
    description: "Return the caller's current active game, or null if none",
    resolve: async (_parent, _args, context) => {
      if (!context.user?.id) return null;
      return TwentyQuestionsService.getActiveGame(context.db, context.user.id);
    },
  }),

  twentyQuestionsHistory: t.field({
    type: [TwentyQuestionsGameRef],
    description: "Paginated history of the caller's past games",
    args: {
      limit: t.arg.int({ defaultValue: 10 }),
      offset: t.arg.int({ defaultValue: 0 }),
    },
    resolve: async (_parent, { limit, offset }, context) => {
      if (!context.user?.id) return [];

      const games = await context.db
        .select()
        .from(PublicSchema.twentyQuestionsGames)
        .where(eq(PublicSchema.twentyQuestionsGames.userId, context.user.id))
        .orderBy(desc(PublicSchema.twentyQuestionsGames.startedAt))
        .limit(limit ?? 10)
        .offset(offset ?? 0);

      if (games.length === 0) return [];

      const gameIds = games.map((g) => g.id);
      const allQuestions = await context.db
        .select()
        .from(PublicSchema.twentyQuestionsQuestions)
        .where(inArray(PublicSchema.twentyQuestionsQuestions.gameId, gameIds))
        .orderBy(PublicSchema.twentyQuestionsQuestions.questionNumber);

      const questionsByGameId = new Map<string, QuestionRow[]>();
      for (const q of allQuestions) {
        const list = questionsByGameId.get(q.gameId) ?? [];
        list.push(q);
        questionsByGameId.set(q.gameId, list);
      }

      return games.map((g) => ({
        ...g,
        questions: questionsByGameId.get(g.id) ?? [],
      }));
    },
  }),
}));

// --- Mutations ---

builder.mutationFields((t) => ({
  twentyQuestionsStart: t.field({
    type: TwentyQuestionsGameRef,
    description:
      'Start a new 20 Questions game (errors if an active game exists)',
    args: {
      difficulty: t.arg({
        type: TwentyQuestionsDifficultyEnum,
        defaultValue: 'medium',
      }),
      sport: t.arg({
        type: SportKindEnum,
        required: false,
        description:
          'Sport for the player pool. Defaults to baseball when omitted.',
      }),
    },
    resolve: async (_parent, { difficulty, sport }, context) => {
      if (!context.user?.id) throw AuthenticationError();
      const game = await TwentyQuestionsService.startGame(
        context.db,
        context.user.id,
        difficulty ?? 'medium',
        sport ?? 'baseball',
      );
      return { ...game, questions: [] };
    },
  }),

  twentyQuestionsAsk: t.field({
    type: TwentyQuestionsGameRef,
    description: 'Ask a yes/no question — returns updated game state',
    args: {
      input: t.arg({ type: TwentyQuestionsAskInput, required: true }),
    },
    resolve: async (_parent, { input }, context) => {
      if (!context.user?.id) throw AuthenticationError();
      const parameter = JSON.parse(input.parameter) as Record<string, unknown>;
      await TwentyQuestionsService.askQuestion(
        context.db,
        input.gameId,
        context.user.id,
        input.category as QuestionCategory,
        parameter,
      );
      const state = await TwentyQuestionsService.getGameState(
        context.db,
        input.gameId,
      );
      if (!state) throw UserInputError('Game not found');
      return state;
    },
  }),

  twentyQuestionsGuess: t.field({
    type: TwentyQuestionsGameRef,
    description:
      'Guess the player identity — returns updated game state (with targetPlayer if won/lost)',
    args: {
      gameId: t.arg.string({ required: true }),
      playerId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, { gameId, playerId }, context) => {
      if (!context.user?.id) throw AuthenticationError();
      await TwentyQuestionsService.guessPlayer(
        context.db,
        gameId,
        context.user.id,
        playerId,
      );
      const state = await TwentyQuestionsService.getGameState(
        context.db,
        gameId,
      );
      if (!state) throw UserInputError('Game not found');
      return state;
    },
  }),

  twentyQuestionsAbandon: t.field({
    type: TwentyQuestionsGameRef,
    description: 'Abandon an active game — returns final game state',
    args: {
      gameId: t.arg.string({ required: true }),
    },
    resolve: async (_parent, { gameId }, context) => {
      if (!context.user?.id) throw AuthenticationError();
      await TwentyQuestionsService.abandonGame(
        context.db,
        gameId,
        context.user.id,
      );
      const state = await TwentyQuestionsService.getGameState(
        context.db,
        gameId,
      );
      if (!state) throw UserInputError('Game not found');
      return state;
    },
  }),
}));
