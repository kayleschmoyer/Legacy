import {
  pgTable,
  serial,
  integer,
  varchar,
  boolean,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

/**
 * Server-side user display preferences (LS-7138 / PST-090).
 *
 * Previously the stats-format preference lived only in the browser's
 * `ls_user_preferences` localStorage blob, so clearing site data reset it and
 * multi-device users saw inconsistent formats. This table persists the
 * preference server-side, keyed by user, so it syncs across devices. The web
 * client hydrates the Apollo cache from here and keeps localStorage only as a
 * cold-load fallback.
 *
 * One row per user (`user_id` is unique). Additional display preferences can be
 * added as columns by follow-up tickets.
 */
export const userPreferences = pgTable(
  'user_preferences',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull(),
    // 'standard' | 'expanded' — validated at the service layer.
    statsFormat: varchar('stats_format', { length: 20 })
      .notNull()
      .default('standard'),
    // Opt-in gate for in-app sound effects (LS-10111). Defaults to false —
    // audio never plays unless the user explicitly turns it on.
    audioEnabled: boolean('audio_enabled').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    userIdUnique: unique('user_preferences_user_id_unique').on(table.userId),
  }),
);
