import { count, sql } from 'drizzle-orm';
import { DisclosureGameService, PublicSchema } from '@legacy-sports/db-client';
import { builder } from './builder';
import {
  AuthenticationError,
  GameUnavailableError,
  UserInputError,
} from './graphql-errors';

/**
 * Progressive Disclosure Minigame GraphQL Schema (LS-1883 / LS-2106)
 *
 * Mutations:
 *  - startDisclosureGame  — create a new session with a random eligible player
 *  - nextClue             — advance session and return the next clue
 *  - submitGuess          — check a player-ID guess; ends session on correct
 *  - giveUpDisclosureGame — forfeit the session and reveal the answer
 *
 * Queries:
 *  - disclosureGameSession — fetch session state (status, clues revealed, score)
 */

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

const DisclosureSessionStatus = builder.enumType('DisclosureSessionStatus', {
  values: ['active', 'won', 'lost', 'given_up'] as const,
  description: 'Current status of a disclosure game session',
});

const DisclosureClue = builder.objectRef<{
  clueText: string;
  difficultyTier: string;
  clueIndex: number;
  totalClues: number;
  isLastClue: boolean;
}>('DisclosureClue');

DisclosureClue.implement({
  description: 'A single clue revealed during a disclosure game session',
  fields: (t) => ({
    clueText: t.exposeString('clueText', {
      description: 'Human-readable fact about the mystery player',
    }),
    difficultyTier: t.exposeString('difficultyTier', {
      description:
        'Difficulty tier of this clue (vague | moderate | identifying)',
    }),
    clueIndex: t.exposeInt('clueIndex', {
      description: '1-based position of this clue in the session',
    }),
    totalClues: t.exposeInt('totalClues', {
      description: 'Total number of clues available for this session',
    }),
    isLastClue: t.exposeBoolean('isLastClue', {
      description:
        'True when this is the final clue — calling nextClue again will end the session',
    }),
  }),
});

const DisclosureGuessResult = builder.objectRef<{
  correct: boolean;
  score: number;
  correctPlayerId: number | null;
  cluesUsed: number;
}>('DisclosureGuessResult');

DisclosureGuessResult.implement({
  description: 'Result of a guess submission',
  fields: (t) => ({
    correct: t.exposeBoolean('correct'),
    score: t.exposeInt('score', {
      description: 'Points earned — only meaningful when correct is true',
    }),
    correctPlayerId: t.exposeInt('correctPlayerId', {
      nullable: true,
      description:
        'Correct player ID — only returned after a wrong guess when all clues are exhausted',
    }),
    cluesUsed: t.exposeInt('cluesUsed', {
      description: 'Number of clues revealed before this guess',
    }),
  }),
});

const DisclosureGameSession = builder.objectRef<{
  id: number;
  status: 'active' | 'won' | 'lost' | 'given_up';
  cluesRevealed: number;
  totalClues: number;
  score: number | null;
  correctPlayerId: number | null;
  createdAt: string;
  completedAt: string | null;
}>('DisclosureGameSession');

DisclosureGameSession.implement({
  description: 'State of a disclosure game session',
  fields: (t) => ({
    id: t.exposeInt('id'),
    status: t.field({
      type: DisclosureSessionStatus,
      description: 'Session status',
      resolve: (session) => session.status,
    }),
    cluesRevealed: t.exposeInt('cluesRevealed', {
      description: 'Number of clues revealed so far',
    }),
    totalClues: t.exposeInt('totalClues', {
      description: 'Total clues available for this session',
    }),
    score: t.exposeInt('score', {
      nullable: true,
      description: 'Final score — null while session is active',
    }),
    correctPlayerId: t.exposeInt('correctPlayerId', {
      nullable: true,
      description:
        'The correct player ID — only revealed after the session ends',
    }),
    createdAt: t.exposeString('createdAt'),
    completedAt: t.exposeString('completedAt', { nullable: true }),
  }),
});

// ──────────────────────────────────────────────────────────────
// Queries
// ──────────────────────────────────────────────────────────────

const MinigamesStats = builder.objectRef<{
  playerSeasons: number;
  earliestYear: number | null;
  playersTracked: number;
}>('MinigamesStats');

MinigamesStats.implement({
  description:
    'Aggregate statistics about the baseball database powering the minigames',
  fields: (t) => ({
    playerSeasons: t.exposeInt('playerSeasons', {
      description:
        'Total number of player-season batting records in the database',
    }),
    earliestYear: t.exposeInt('earliestYear', {
      nullable: true,
      description: 'Earliest season year in the database',
    }),
    playersTracked: t.exposeInt('playersTracked', {
      description: 'Total number of distinct players tracked',
    }),
  }),
});

// ──────────────────────────────────────────────────────────────
// In-memory TTL cache for minigamesStats aggregates.
// These are full-table COUNT/MIN scans; caching avoids hitting
// the DB on every page load of the hub (same pattern as the
// Stripe price cache in subscriptions.ts).
// ──────────────────────────────────────────────────────────────

type MinigamesStatsShape = {
  playerSeasons: number;
  earliestYear: number | null;
  playersTracked: number;
};

let cachedMinigamesStats: MinigamesStatsShape | null = null;
let cachedMinigamesStatsExpiresAt = 0;
const MINIGAMES_STATS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const ActiveDisclosureGame = builder.objectRef<{
  id: number;
  cluesRevealed: number;
  totalClues: number;
  createdAt: string;
  revealedClues: Array<{
    clueText: string;
    difficultyTier: string;
    clueIndex: number;
    isLastClue: boolean;
  }>;
}>('ActiveDisclosureGame');

ActiveDisclosureGame.implement({
  description:
    "The caller's currently-active disclosure game session, including the text of every clue revealed so far. Used to resume a game after navigating away.",
  fields: (t) => ({
    id: t.exposeInt('id'),
    cluesRevealed: t.exposeInt('cluesRevealed'),
    totalClues: t.exposeInt('totalClues'),
    createdAt: t.exposeString('createdAt'),
    revealedClues: t.field({
      type: [DisclosureClue],
      nullable: { list: false, items: false },
      description: 'Clues already revealed for this session, in reveal order',
      resolve: (s) =>
        s.revealedClues.map((c) => ({
          clueText: c.clueText,
          difficultyTier: c.difficultyTier,
          clueIndex: c.clueIndex,
          totalClues: s.totalClues,
          isLastClue: c.isLastClue,
        })),
    }),
  }),
});

builder.queryFields((t) => ({
  activeDisclosureGame: t.field({
    type: ActiveDisclosureGame,
    nullable: true,
    description:
      "Return the caller's currently-active disclosure game session, or null if none exists. Includes the text of every clue revealed so far so the client can resume the game in-place.",
    resolve: async (_parent, _args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }
      const svc = new DisclosureGameService(context.db);
      return svc.getActiveSession(context.user.id);
    },
  }),

  disclosureGameSession: t.field({
    type: DisclosureGameSession,
    nullable: true,
    description: 'Fetch the current state of a disclosure game session',
    args: {
      sessionId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }
      const svc = new DisclosureGameService(context.db);
      return svc.getSession(args.sessionId, context.user.id);
    },
  }),

  disclosureGameBestScore: t.field({
    type: 'Int',
    nullable: true,
    description:
      "The current user's best score across all won disclosure game sessions",
    resolve: async (_parent, _args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }
      const svc = new DisclosureGameService(context.db);
      return svc.getBestScore(context.user.id);
    },
  }),

  minigamesStats: t.field({
    type: MinigamesStats,
    nullable: true,
    description:
      'Aggregate statistics about the baseball database powering the minigames hub',
    resolve: async (_parent, _args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const now = Date.now();
      if (cachedMinigamesStats && now < cachedMinigamesStatsExpiresAt) {
        return cachedMinigamesStats;
      }

      const [battingResult, playerCountResult] = await Promise.all([
        context.db
          .select({
            playerSeasons: count(PublicSchema.seasonBatting.playerId),
            earliestYear: sql<
              number | null
            >`min(${PublicSchema.seasonBatting.season})`,
          })
          .from(PublicSchema.seasonBatting),
        context.db
          .select({ playersTracked: count(PublicSchema.players.id) })
          .from(PublicSchema.players),
      ]);

      const result = battingResult[0];

      const stats: MinigamesStatsShape = {
        playerSeasons: Number(result?.playerSeasons ?? 0),
        earliestYear: result?.earliestYear ?? null,
        playersTracked: Number(playerCountResult[0]?.playersTracked ?? 0),
      };

      cachedMinigamesStats = stats;
      cachedMinigamesStatsExpiresAt = now + MINIGAMES_STATS_CACHE_TTL_MS;

      return stats;
    },
  }),
}));

// ──────────────────────────────────────────────────────────────
// Mutations
// ──────────────────────────────────────────────────────────────

builder.mutationFields((t) => ({
  startDisclosureGame: t.field({
    type: builder
      .objectRef<{
        sessionId: number;
        totalClues: number;
      }>('StartDisclosureGameResult')
      .implement({
        description: 'Result of starting a new disclosure game session',
        fields: (ft) => ({
          sessionId: ft.exposeInt('sessionId'),
          totalClues: ft.exposeInt('totalClues', {
            description: 'Total number of clues available in this session',
          }),
        }),
      }),
    description:
      'Start a new progressive disclosure game session. Returns session ID and total clue count.',
    args: {},
    resolve: async (_parent, _args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }
      const svc = new DisclosureGameService(context.db);
      try {
        return await svc.startSession(context.user.id);
      } catch (err) {
        if (
          err instanceof Error &&
          err.message.startsWith('No eligible players found')
        ) {
          throw GameUnavailableError();
        }
        throw err;
      }
    },
  }),

  nextClue: t.field({
    type: DisclosureClue,
    description:
      'Reveal the next clue for the given session. Increments clues-revealed counter.',
    args: {
      sessionId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }
      const svc = new DisclosureGameService(context.db);
      try {
        return await svc.nextClue(args.sessionId, context.user.id);
      } catch (err) {
        if (
          err instanceof Error &&
          (err.message === 'Session not found' ||
            err.message.startsWith('Session is already') ||
            err.message === 'No more clues available — session ended as lost' ||
            err.message === 'Concurrent nextClue call detected — please retry')
        ) {
          throw UserInputError(err.message);
        }
        throw err;
      }
    },
  }),

  submitGuess: t.field({
    type: DisclosureGuessResult,
    description:
      'Submit a player ID as a guess. Returns correct/incorrect and score (if correct).',
    args: {
      sessionId: t.arg.int({ required: true }),
      guessedPlayerId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }
      const svc = new DisclosureGameService(context.db);
      try {
        return await svc.submitGuess(
          args.sessionId,
          context.user.id,
          args.guessedPlayerId,
        );
      } catch (err) {
        if (
          err instanceof Error &&
          (err.message === 'Session not found' ||
            err.message.startsWith('Session is already'))
        ) {
          throw UserInputError(err.message);
        }
        throw err;
      }
    },
  }),

  giveUpDisclosureGame: t.field({
    type: builder
      .objectRef<{
        correctPlayerId: number;
        correctPlayerName: string;
      }>('GiveUpDisclosureGameResult')
      .implement({
        description: 'Result of giving up a disclosure game session',
        fields: (ft) => ({
          correctPlayerId: ft.exposeInt('correctPlayerId', {
            description: 'The correct player ID revealed after forfeiting',
          }),
          correctPlayerName: ft.exposeString('correctPlayerName', {
            description: 'The correct player name revealed after forfeiting',
          }),
        }),
      }),
    description:
      'Give up the current session. Reveals the correct player without awarding points.',
    args: {
      sessionId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }
      const svc = new DisclosureGameService(context.db);
      try {
        return await svc.giveUp(args.sessionId, context.user.id);
      } catch (err) {
        if (
          err instanceof Error &&
          (err.message === 'Session not found' ||
            err.message.startsWith('Session is already'))
        ) {
          throw UserInputError(err.message);
        }
        throw err;
      }
    },
  }),
}));
