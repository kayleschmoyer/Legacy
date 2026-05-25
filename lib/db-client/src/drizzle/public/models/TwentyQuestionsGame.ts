import {
  pgTable,
  uuid,
  integer,
  text,
  timestamp,
  foreignKey,
  index,
} from 'drizzle-orm/pg-core';
import { sportKind } from './Enums';
import { players } from './Players';

export const twentyQuestionsGames = pgTable(
  'twenty_questions_games',
  {
    id: uuid('id').primaryKey().defaultRandom().notNull(),
    userId: integer('user_id').notNull(),
    targetPlayerId: integer('target_player_id').notNull(),
    // CHECK: 'active' | 'won' | 'lost' | 'abandoned'
    status: text('status').notNull().default('active'),
    questionsUsed: integer('questions_used').notNull().default(0),
    maxQuestions: integer('max_questions').notNull().default(20),
    // CHECK: 'easy' | 'medium' | 'hard'
    difficulty: text('difficulty').notNull(),
    sport: sportKind('sport').notNull().default('baseball'),
    tokensEarned: integer('tokens_earned'),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    completedAt: timestamp('completed_at', {
      withTimezone: true,
      mode: 'string',
    }),
  },
  (table) => ({
    targetPlayerFk: foreignKey({
      columns: [table.targetPlayerId],
      foreignColumns: [players.id],
      name: 'tqg_target_player_fk',
    }),

    userStatusIdx: index('idx_tqg_user_status').on(table.userId, table.status),
    startedAtIdx: index('idx_tqg_started_at').on(table.startedAt),
  }),
);
