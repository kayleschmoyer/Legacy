import { createDatabaseService, PublicSchema } from '@legacy-sports/db-client';
import {
  HITTER_STAT_KEYS,
  PITCHER_STAT_KEYS,
  SeasonDraftGameService,
} from '@legacy-sports/db-client';
import { loadCareerStats } from '@legacy-sports/data-loaders';
import { getDbOptions } from '@legacy-sports/utils/node';
import { eq } from 'drizzle-orm';
import { LOGGER } from '@legacy-sports/logging';
import { builder } from './builder';
import { AuthenticationError, ForbiddenError } from './graphql-errors';

// Create database service instance - used in GraphQL resolvers
const _dbService = createDatabaseService(getDbOptions());

/**
 * Season Draft Game GraphQL Schema
 *
 * Provides mutations and queries for the Season Draft Game, a turn-based
 * drafting game where players select baseball player + season combinations.
 */

// --- Types ---

const SeasonDraftGameStatus = builder.enumType('SeasonDraftGameStatus', {
  values: ['setup', 'drafting', 'completed', 'cancelled'] as const,
});

const SeasonDraftPlayerType = builder.enumType('SeasonDraftPlayerType', {
  values: ['hitter', 'pitcher'] as const,
  description: 'Whether this is a hitter draft or pitcher draft',
});

const SeasonDraftGameMode = builder.enumType('SeasonDraftGameMode', {
  values: ['season', 'career_team'] as const,
  description:
    'Game mode: season (player+year) or career_team (player+team career total)',
});

const SeasonDraftRosterSlot = builder.objectRef<{
  id: number;
  position: string;
  slotNumber: number;
  isFilled: boolean;
  pick?: {
    playerName: string;
    season: number;
    statValue: number;
    team?: string;
  };
}>('SeasonDraftRosterSlot');

SeasonDraftRosterSlot.implement({
  description: 'A roster slot for a player in a Season Draft Game',
  fields: (t) => ({
    id: t.exposeInt('id'),
    position: t.exposeString('position'),
    slotNumber: t.exposeInt('slotNumber'),
    isFilled: t.exposeBoolean('isFilled'),
    pick: t.field({
      type: SeasonDraftPick,
      nullable: true,
      resolve: (parent) => parent.pick || null,
    }),
  }),
});

const SeasonDraftPick = builder.objectRef<{
  playerName: string;
  season: number;
  statValue: number;
  team?: string;
}>('SeasonDraftPick');

SeasonDraftPick.implement({
  description: 'A completed draft pick with player and scoring info',
  fields: (t) => ({
    playerName: t.exposeString('playerName'),
    season: t.exposeInt('season'),
    statValue: t.exposeInt('statValue'),
    team: t.exposeString('team', { nullable: true }),
  }),
});

const SeasonDraftPlayer = builder.objectRef<{
  id: number;
  userId: number;
  playerName: string;
  draftOrder: number;
  totalScore: number;
  roster: Array<{
    slotId: number;
    position: string;
    slotNumber: number;
    isFilled: boolean;
    pick?: {
      playerName: string;
      season: number;
      statValue: number;
      team?: string;
    };
  }>;
}>('SeasonDraftPlayer');

SeasonDraftPlayer.implement({
  description: 'A player (human) in a Season Draft Game',
  fields: (t) => ({
    id: t.exposeInt('id'),
    userId: t.exposeInt('userId'),
    playerName: t.exposeString('playerName'),
    draftOrder: t.exposeInt('draftOrder'),
    totalScore: t.exposeInt('totalScore'),
    roster: t.field({
      type: [SeasonDraftRosterSlot],
      resolve: (parent) => {
        return parent.roster.map((slot) => ({
          id: slot.slotId,
          position: slot.position,
          slotNumber: slot.slotNumber,
          isFilled: slot.isFilled,
          pick: slot.pick,
        }));
      },
    }),
  }),
});

const SeasonDraftGamePickHistory = builder.objectRef<{
  pickNumber: number;
  playerName: string;
  draftingUser: string;
  baseballPlayerName: string;
  season: number;
  position: string;
  statValue: number;
  team?: string;
  pickedAt: string;
}>('SeasonDraftGamePickHistory');

SeasonDraftGamePickHistory.implement({
  description: 'A historical pick in the draft',
  fields: (t) => ({
    pickNumber: t.exposeInt('pickNumber'),
    playerName: t.exposeString('playerName'),
    draftingUser: t.exposeString('draftingUser'),
    baseballPlayerName: t.exposeString('baseballPlayerName'),
    season: t.exposeInt('season'),
    position: t.exposeString('position'),
    statValue: t.exposeInt('statValue'),
    team: t.exposeString('team', { nullable: true }),
    pickedAt: t.exposeString('pickedAt'),
  }),
});

const SeasonDraftGame = builder.objectRef<{
  id: number;
  name: string;
  status: string;
  currentTurn: number;
  createdBy: number;
  statKey: string;
  gameMode: string;
  playerType: string;
  players: Array<{
    id: number;
    userId: number;
    playerName: string;
    draftOrder: number;
    totalScore: number;
    roster: Array<{
      slotId: number;
      position: string;
      slotNumber: number;
      isFilled: boolean;
      pick?: {
        playerName: string;
        season: number;
        statValue: number;
        team?: string;
      };
    }>;
  }>;
  picks: Array<{
    pickNumber: number;
    playerName: string;
    draftingUser: string;
    baseballPlayerName: string;
    season: number;
    position: string;
    statValue: number;
    team?: string;
    pickedAt: string;
  }>;
}>('SeasonDraftGame');

SeasonDraftGame.implement({
  description: 'A Season Draft Game with full state',
  fields: (t) => ({
    id: t.exposeInt('id'),
    name: t.exposeString('name'),
    status: t.field({
      type: SeasonDraftGameStatus,
      resolve: (parent) =>
        parent.status as 'setup' | 'drafting' | 'completed' | 'cancelled',
    }),
    currentTurn: t.exposeInt('currentTurn'),
    createdBy: t.exposeInt('createdBy'),
    statKey: t.exposeString('statKey'),
    gameMode: t.field({
      type: SeasonDraftGameMode,
      resolve: (parent) => parent.gameMode as 'season' | 'career_team',
    }),
    playerType: t.field({
      type: SeasonDraftPlayerType,
      resolve: (parent) => parent.playerType as 'hitter' | 'pitcher',
    }),
    players: t.field({
      type: [SeasonDraftPlayer],
      resolve: (parent) => parent.players,
    }),
    picks: t.field({
      type: [SeasonDraftGamePickHistory],
      resolve: (parent) => parent.picks,
    }),
  }),
});

const SeasonDraftGameSummary = builder.objectRef<{
  id: number;
  name: string;
  status: string;
  statKey: string;
  gameMode: string;
  playerType: string;
  isMyTurn: boolean;
}>('SeasonDraftGameSummary');

SeasonDraftGameSummary.implement({
  description: 'Summary of a Season Draft Game',
  fields: (t) => ({
    id: t.exposeInt('id'),
    name: t.exposeString('name'),
    status: t.field({
      type: SeasonDraftGameStatus,
      resolve: (parent) =>
        parent.status as 'setup' | 'drafting' | 'completed' | 'cancelled',
    }),
    statKey: t.exposeString('statKey'),
    gameMode: t.field({
      type: SeasonDraftGameMode,
      resolve: (parent) => parent.gameMode as 'season' | 'career_team',
    }),
    playerType: t.field({
      type: SeasonDraftPlayerType,
      resolve: (parent) => parent.playerType as 'hitter' | 'pitcher',
    }),
    isMyTurn: t.exposeBoolean('isMyTurn'),
  }),
});

// --- Queries ---

builder.queryFields((t) => ({
  seasonDraftGame: t.field({
    type: SeasonDraftGame,
    nullable: true,
    args: {
      gameId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const gameState = await SeasonDraftGameService.getGameState(
        context.db,
        args.gameId,
      );

      return gameState;
    },
  }),

  seasonDraftGames: t.field({
    type: [SeasonDraftGameSummary],
    description: 'Get all Season Draft Games for the current user',
    resolve: async (_parent, _args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      return await SeasonDraftGameService.getGamesForUser(
        context.db,
        context.user.id,
      );
    },
  }),

  seasonDraftGamePlayerOptions: t.field({
    type: ['String'],
    description:
      'Get available draft options for a player: distinct teams (career_team mode) or seasons (season mode)',
    args: {
      playerId: t.arg.int({ required: true }),
      gameMode: t.arg({ type: SeasonDraftGameMode, required: true }),
      playerType: t.arg({ type: SeasonDraftPlayerType, required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      return await SeasonDraftGameService.getPlayerDraftOptions(
        context.db,
        args.playerId,
        args.gameMode,
        args.playerType,
      );
    },
  }),

  seasonDraftGameAvailablePositions: t.field({
    type: ['String'],
    description: 'Get list of available positions to draft for',
    args: {
      gameId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      // Get the player's unfilled slots
      const [player] = await context.db
        .select()
        .from(PublicSchema.seasonDraftPlayers)
        .where(eq(PublicSchema.seasonDraftPlayers.userId, context.user.id))
        .limit(1);

      if (!player) {
        return [];
      }

      const slots = await context.db
        .select()
        .from(PublicSchema.seasonDraftRosterSlots)
        .where(
          eq(
            PublicSchema.seasonDraftRosterSlots.seasonDraftPlayerId,
            player.id,
          ),
        );

      const unfilledPositions = slots
        .filter((s) => !s.isFilled)
        .map(
          (s) =>
            `${s.position}${s.slotNumber > 0 ? ` ${s.slotNumber + 1}` : ''}`,
        );

      return unfilledPositions;
    },
  }),

  seasonDraftGamePlayerSeasonStatValue: t.field({
    type: 'Int',
    description: 'Get stat value for a player/season/position combination',
    args: {
      playerId: t.arg.int({ required: true }),
      season: t.arg.int({ required: true }),
      position: t.arg.string({ required: true }),
      statKey: t.arg.string({ required: false }),
      playerType: t.arg.string({ required: false }),
      gameMode: t.arg.string({ required: false }),
      team: t.arg.string({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      return await SeasonDraftGameService.getStatValueForPlayerSeasonPosition(
        context.db,
        args.playerId,
        args.season,
        args.position,
        (args.statKey as string) || 'hr',
        ((args.playerType as string) || 'hitter') as 'hitter' | 'pitcher',
        ((args.gameMode as string) || 'season') as 'season' | 'career_team',
        (args.team as string) || undefined,
      );
    },
  }),

  seasonDraftGameValidStatKeys: t.field({
    type: ['String'],
    description: 'Get valid stat keys for a given player type',
    args: {
      playerType: t.arg.string({ required: true }),
    },
    resolve: (_parent, args) => {
      if (args.playerType === 'pitcher') {
        return [...PITCHER_STAT_KEYS];
      }
      return [...HITTER_STAT_KEYS];
    },
  }),
}));

// --- Mutations ---

builder.mutationFields((t) => ({
  createSeasonDraftGame: t.field({
    type: 'Int',
    description: 'Create a new Season Draft Game',
    args: {
      name: t.arg.string({ required: true }),
      playerNames: t.arg.stringList({ required: true }),
      userIds: t.arg.intList({ required: true }),
      statKey: t.arg.string({ required: false }),
      gameMode: t.arg.string({ required: false }),
      playerType: t.arg.string({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const numPlayers = args.playerNames.length;

      const gameId = await SeasonDraftGameService.createGame(context.db, {
        name: args.name,
        createdBy: context.user.id,
        numPlayers,
        playerNames: args.playerNames,
        userIds: args.userIds,
        statKey: (args.statKey as string) || undefined,
        gameMode: ((args.gameMode as string) || undefined) as
          | 'season'
          | 'career_team'
          | undefined,
        playerType: ((args.playerType as string) || undefined) as
          | 'hitter'
          | 'pitcher'
          | undefined,
      });

      return gameId;
    },
  }),

  startSeasonDraftGame: t.field({
    type: 'Boolean',
    description: 'Start a Season Draft Game (move from setup to drafting)',
    args: {
      gameId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      // Verify the user is the game creator
      const gameState = await SeasonDraftGameService.getGameState(
        context.db,
        args.gameId,
      );

      if (!gameState) {
        throw new Error('Game not found');
      }

      if (gameState.createdBy !== context.user.id) {
        throw ForbiddenError('Only the game creator can start the game');
      }

      if (gameState.status !== 'setup') {
        throw new Error('Game can only be started from setup phase');
      }

      await SeasonDraftGameService.startGame(context.db, args.gameId);
      return true;
    },
  }),

  makeSeasonDraftPick: t.field({
    type: 'Boolean',
    description: 'Make a draft pick in a Season Draft Game',
    args: {
      gameId: t.arg.int({ required: true }),
      rosterSlotId: t.arg.int({ required: true }),
      playerId: t.arg.int({ required: true }),
      season: t.arg.int({ required: true }),
      position: t.arg.string({ required: true }),
      team: t.arg.string({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      await SeasonDraftGameService.makePick(context.db, {
        gameId: args.gameId,
        userId: context.user.id,
        rosterSlotId: args.rosterSlotId,
        playerId: args.playerId,
        season: args.season,
        position: args.position,
        team: (args.team as string) || undefined,
      });

      return true;
    },
  }),

  triggerSeasonDraftStatLoading: t.field({
    type: 'Boolean',
    description:
      'Trigger stat loading for a baseball player if stats have not been fetched yet. Returns true if loading was triggered, false if stats already exist.',
    args: {
      playerId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      // Check if player already has stats
      const hasStats = await SeasonDraftGameService.checkPlayerHasStats(
        context.db,
        args.playerId,
      );

      if (hasStats) {
        return false; // Stats already loaded
      }

      // Get brefId for loading
      const brefId = await SeasonDraftGameService.getPlayerBrefId(
        context.db,
        args.playerId,
      );

      if (!brefId) {
        throw new Error('Player not found or has no Baseball Reference ID');
      }

      // Send loading notification via WebSocket (if notification service is available)
      if (context.notificationService) {
        try {
          await context.notificationService.broadcast({
            type: 'notification',
            data: {
              type: 'PLAYER_STATS_LOADING',
              playerId: args.playerId,
              matchupId: 0,
              leagueId: 0,
            },
          });
        } catch (notifyError) {
          LOGGER.warn('Failed to send stats loading notification', {
            error: notifyError,
          });
        }
      }

      // Trigger stat loading directly (data-loaders is available in the db lambda)
      try {
        await loadCareerStats(context.db, brefId);

        // Send updated notification via WebSocket
        if (context.notificationService) {
          try {
            await context.notificationService.broadcast({
              type: 'notification',
              data: {
                type: 'PLAYER_STATS_UPDATED',
                playerId: args.playerId,
                matchupId: 0,
                leagueId: 0,
                stats: null,
              },
            });
          } catch (notifyError) {
            LOGGER.warn('Failed to send stats updated notification', {
              error: notifyError,
            });
          }
        }

        return true;
      } catch (loadError) {
        LOGGER.error('Failed to load career stats', {
          playerId: args.playerId,
          brefId,
          error: loadError,
        });
        throw new Error(
          'Failed to load player stats. The player may not have a valid Baseball Reference page.',
        );
      }
    },
  }),

  cancelSeasonDraftGame: t.field({
    type: 'Boolean',
    description:
      'Cancel a Season Draft Game (only the creator can cancel, only in setup or drafting)',
    args: {
      gameId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      await SeasonDraftGameService.cancelGame(
        context.db,
        args.gameId,
        context.user.id,
      );
      return true;
    },
  }),
}));

export {
  SeasonDraftGame,
  SeasonDraftGameStatus,
  SeasonDraftGameMode,
  SeasonDraftPlayerType,
  SeasonDraftPlayer,
  SeasonDraftPick,
};
