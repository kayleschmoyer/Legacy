import {
  pgTable,
  uuid,
  integer,
  text,
  boolean,
  timestamp,
  jsonb,
  foreignKey,
  index,
} from 'drizzle-orm/pg-core';
import { players } from './Players';
import { twentyQuestionsGames } from './TwentyQuestionsGame';

export const twentyQuestionsQuestions = pgTable(
  'twenty_questions_questions',
  {
    id: uuid('id').primaryKey().defaultRandom().notNull(),
    gameId: uuid('game_id').notNull(),
    questionNumber: integer('question_number').notNull(),
    // CHECK: 'position' | 'team' | 'era' | 'hall_of_fame' | 'stat_threshold' |
    //        'batting_hand' | 'throwing_hand' | 'active_status'
    category: text('category').notNull(),
    parameter: jsonb('parameter').notNull().$type<Record<string, unknown>>(),
    answer: boolean('answer').notNull(),
    isGuess: boolean('is_guess').notNull().default(false),
    guessPlayerId: integer('guess_player_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    gameFk: foreignKey({
      columns: [table.gameId],
      foreignColumns: [twentyQuestionsGames.id],
      name: 'tqq_game_fk',
    }).onDelete('cascade'),

    guessPlayerFk: foreignKey({
      columns: [table.guessPlayerId],
      foreignColumns: [players.id],
      name: 'tqq_guess_player_fk',
    }),

    gameIdIdx: index('idx_tqq_game_id').on(table.gameId),
  }),
);
