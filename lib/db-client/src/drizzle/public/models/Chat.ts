import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

/**
 * Direct Messages — player-to-player chat.
 *
 * No FK to the `users` VIEW (Postgres does not allow FK to views).
 * User IDs are validated in the application layer.
 *
 * Indexes:
 *   - from_user_id: sender sent-messages view
 *   - to_user_id: recipient inbox
 *   - conversation: composite for thread queries
 */
export const directMessages = pgTable(
  'direct_messages',
  {
    id: serial('id').primaryKey().notNull(),
    /** Sender user id */
    fromUserId: integer('from_user_id').notNull(),
    /** Recipient user id */
    toUserId: integer('to_user_id').notNull(),
    /** Optional league context — scopes the DM to a shared league */
    leagueId: integer('league_id'),
    /** Message body (validated ≤ 2000 chars in the application layer) */
    messageText: text('message_text').notNull(),
    /** Populated when the recipient first views the message */
    readAt: timestamp('read_at', { withTimezone: true }),
    /** Soft-delete — sender can retract an unread message */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    fromUserIdIdx: index('direct_messages_from_user_id_idx').on(
      table.fromUserId,
    ),
    toUserIdIdx: index('direct_messages_to_user_id_idx').on(table.toUserId),
    conversationIdx: index('direct_messages_conversation_idx').on(
      table.fromUserId,
      table.toUserId,
    ),
  }),
);
