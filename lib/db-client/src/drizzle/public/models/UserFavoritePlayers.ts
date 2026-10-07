import {
  pgTable,
  serial,
  integer,
  timestamp,
  foreignKey,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { sportKind } from './Enums';
import { players } from './Players';
import { users } from './Users';

/**
 * Global per-user favorite players (LS-10861, story LS-10789).
 *
 * A star on a player is a personal mark that follows the user into every
 * league and draft. It is not a queue entry: the per-draft, ordered autopick
 * list stays in `draft_queue`. `sport` is copied from `players.sport` on
 * insert so favorites can be filtered by sport without a join.
 */
export const userFavoritePlayers = pgTable(
  'user_favorite_players',
  {
    id: serial('id').primaryKey().notNull(),
    userId: integer('user_id').notNull(),
    playerId: integer('player_id').notNull(),
    sport: sportKind('sport').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userFavoritePlayersUserIdFk: foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'user_favorite_players_user_id_fkey',
    }).onDelete('cascade'),
    userFavoritePlayersPlayerIdFk: foreignKey({
      columns: [table.playerId],
      foreignColumns: [players.id],
      name: 'user_favorite_players_player_id_fkey',
    }).onDelete('cascade'),
    userIdPlayerIdUnique: unique(
      'user_favorite_players_user_id_player_id_uk',
    ).on(table.userId, table.playerId),
    playerIdIdx: index('user_favorite_players_player_id_idx').on(
      table.playerId,
    ),
  }),
);
