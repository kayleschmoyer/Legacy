/**
 * Global favorite players (LS-10861, story LS-10789)
 *
 * A star on a player is a per-user favorite that follows the user into every
 * league and draft. Favorites are not draft-queue entries: the ordered,
 * per-draft autopick list stays in `draft_queue`.
 *
 * Query:
 *   myFavoritePlayers(sport?) — the caller's favorites, newest first
 * Mutations:
 *   addFavoritePlayer(playerId)    — idempotent; returns the favorite
 *   removeFavoritePlayer(playerId) — idempotent; true once it is gone
 *
 * The user id always comes from the auth context, never from arguments, so a
 * caller can only ever see or change their own favorites.
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, desc, eq } from 'drizzle-orm';

import { builder } from './builder';
import { AuthenticationError, UserInputError } from './graphql-errors';
import { SportKindEnum } from './leagues/types';

type SportKind = 'baseball' | 'football';

interface FavoritePlayerShape {
  playerId: number;
  sport: SportKind;
  createdAt: Date;
}

const FavoritePlayerRef =
  builder.objectRef<FavoritePlayerShape>('FavoritePlayer');

FavoritePlayerRef.implement({
  description:
    "A player the signed-in user starred. Global per user: shared across every league and draft, and separate from a draft's queue.",
  fields: (t) => ({
    playerId: t.exposeInt('playerId'),
    sport: t.field({
      type: SportKindEnum,
      resolve: (parent) => parent.sport,
    }),
    createdAt: t.string({
      resolve: (parent) => parent.createdAt.toISOString(),
    }),
  }),
});

const favoriteColumns = {
  playerId: PublicSchema.userFavoritePlayers.playerId,
  sport: PublicSchema.userFavoritePlayers.sport,
  createdAt: PublicSchema.userFavoritePlayers.createdAt,
};

builder.queryField('myFavoritePlayers', (t) =>
  t.field({
    type: [FavoritePlayerRef],
    description:
      "The signed-in user's favorite players, newest first. Pass sport to limit them to one sport.",
    args: {
      sport: t.arg({ type: SportKindEnum, required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) throw AuthenticationError();
      const userId = context.user.id;
      const table = PublicSchema.userFavoritePlayers;

      const userFilter = eq(table.userId, userId);
      return context.db
        .select(favoriteColumns)
        .from(table)
        .where(
          args.sport
            ? and(userFilter, eq(table.sport, args.sport))
            : userFilter,
        )
        .orderBy(desc(table.createdAt), desc(table.id));
    },
  }),
);

builder.mutationField('addFavoritePlayer', (t) =>
  t.field({
    type: FavoritePlayerRef,
    description:
      'Star a player for the signed-in user. Idempotent: starring a favorite again returns the existing favorite.',
    args: {
      playerId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) throw AuthenticationError();
      const userId = context.user.id;
      const { playerId } = args;
      const table = PublicSchema.userFavoritePlayers;

      const [player] = await context.db
        .select({ sport: PublicSchema.players.sport })
        .from(PublicSchema.players)
        .where(eq(PublicSchema.players.id, playerId))
        .limit(1);
      if (!player) throw UserInputError('Player not found');

      const [inserted] = await context.db
        .insert(table)
        .values({ userId, playerId, sport: player.sport })
        .onConflictDoNothing({ target: [table.userId, table.playerId] })
        .returning(favoriteColumns);
      if (inserted) {
        LOGGER.info('Favorite player added', { userId, playerId });
        return inserted;
      }

      // Already a favorite: return the existing row unchanged.
      const [existing] = await context.db
        .select(favoriteColumns)
        .from(table)
        .where(and(eq(table.userId, userId), eq(table.playerId, playerId)))
        .limit(1);
      if (!existing) {
        // Removed concurrently between the conflict and this read.
        throw UserInputError('Favorite could not be saved, please retry');
      }
      return existing;
    },
  }),
);

builder.mutationField('removeFavoritePlayer', (t) =>
  t.boolean({
    description:
      'Unstar a player for the signed-in user. Idempotent: removing a player who is not a favorite still returns true.',
    args: {
      playerId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) throw AuthenticationError();
      const userId = context.user.id;
      const table = PublicSchema.userFavoritePlayers;

      await context.db
        .delete(table)
        .where(
          and(eq(table.userId, userId), eq(table.playerId, args.playerId)),
        );
      LOGGER.info('Favorite player removed', {
        userId,
        playerId: args.playerId,
      });
      return true;
    },
  }),
);
