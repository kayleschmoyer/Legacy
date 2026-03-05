import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  timestamp,
} from 'drizzle-orm/pg-core';

/**
 * League activity event types — maps 1:1 with the DB enum
 * `public.league_activity_event_type`.
 */
export const leagueActivityEventType = pgEnum('league_activity_event_type', [
  'trade_proposed',
  'trade_accepted',
  'trade_rejected',
  'trade_cancelled',
  'trade_vetoed',
  'waiver_claimed',
  'waiver_cancelled',
  'waiver_claim_approved',
  'waiver_claim_rejected',
  'draft_pick_made',
  'league_announcement',
]);

export type LeagueActivityEventType =
  (typeof leagueActivityEventType.enumValues)[number];

/**
 * league_activity_log — structured event log for each league.
 *
 * Used by the LeagueActivityFeed component to display a real-time
 * timeline of league events (trades, waivers, draft picks, etc.).
 *
 * Indexes:
 *   - league_id + occurred_at DESC: main feed query
 *   - event_type: filtering by activity category
 *   - team_id: per-team history view
 */
export const leagueActivityLog = pgTable(
  'league_activity_log',
  {
    id: serial('id').primaryKey().notNull(),
    /** League this event belongs to */
    leagueId: integer('league_id').notNull(),
    /** Team primarily involved in the event (nullable for league-wide events) */
    teamId: integer('team_id'),
    /** User who performed the action (null for system events) */
    actorUserId: integer('actor_user_id'),
    /** Structured event type */
    eventType: leagueActivityEventType('event_type').notNull(),
    /** Freeform JSON payload — shape depends on event_type */
    payload: jsonb('payload').notNull().default({}),
    /** When the event occurred */
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    leagueOccurredAtIdx: index(
      'league_activity_log_league_id_occurred_at_idx',
    ).on(table.leagueId, table.occurredAt),
    eventTypeIdx: index('league_activity_log_event_type_idx').on(
      table.eventType,
    ),
    teamIdIdx: index('league_activity_log_team_id_idx').on(table.teamId),
  }),
);
