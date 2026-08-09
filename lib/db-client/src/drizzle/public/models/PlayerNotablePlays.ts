import {
  date,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Per-player notable-play cache (LS-9095).
 *
 * One row per MLB Stats API player id holding that player's most notable
 * Statcast play summary. Refreshed on a schedule by the refreshNotablePlays
 * system mutation; read by the draft spectator pick-splash stat graphic.
 * play_id is the Statcast play UUID used only to build a Film Room link-out —
 * never to fetch or embed video (MLB ToS, spike LS-8945).
 */
export const playerNotablePlays = pgTable('player_notable_plays', {
  mlbPlayerId: integer('mlb_player_id').primaryKey(),
  playerRole: varchar('player_role', { length: 7 }).notNull(),
  gamePk: integer('game_pk').notNull(),
  gameDate: date('game_date').notNull(),
  playId: varchar('play_id', { length: 64 }),
  eventType: varchar('event_type', { length: 40 }).notNull(),
  description: text('description').notNull(),
  exitVelocity: real('exit_velocity'),
  launchAngle: real('launch_angle'),
  hitDistance: real('hit_distance'),
  pitchSpeed: real('pitch_speed'),
  pitchType: varchar('pitch_type', { length: 40 }),
  notabilityScore: real('notability_score').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
