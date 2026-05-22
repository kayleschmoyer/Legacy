import {
  pgTable,
  varchar,
  integer,
  text,
  timestamp,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';

/**
 * Sport-tagged player pool definitions (LS-4633).
 *
 * Allows querying the available pool keys per sport — e.g. baseball
 * ('all', 'nl', 'al') vs football ('nfl', 'afc', 'nfc'). Pool keys mirror the
 * values stored in `leagues.player_pool` (the `player_pool` enum).
 */
export const sportPlayerPools = pgTable(
  'sport_player_pools',
  {
    sport: varchar('sport', { length: 20 }).notNull(),
    key: varchar('key', { length: 50 }).notNull(),
    label: varchar('label', { length: 100 }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      pk: primaryKey({
        columns: [table.sport, table.key],
        name: 'sport_player_pools_pk',
      }),
      sportIdx: index('sport_player_pools_sport_idx').on(table.sport),
    };
  },
);

/**
 * Sport-tagged era window definitions (LS-4633).
 *
 * Each row represents a historical era (e.g. baseball "Golden Age", football
 * "Super Bowl Era") with optional start/end years. Era keys mirror the values
 * stored in `leagues.era_filter` (the `era_filter` enum). A NULL `endYear`
 * means the era extends to the present.
 */
/**
 * Static slot-eligibility mapping used by the draft auto-pick candidate-pool
 * query (LS-4694). Mirrors the baseball entries in
 * `ALLOWED_POSITIONS_BY_SPORT.baseball` (lib/utils/src/lib/allowed-positions.ts).
 * Promoted from an inline `VALUES` CTE to a real table so the planner has
 * statistics for join ordering.
 */
export const positionSlotMapping = pgTable(
  'position_slot_mapping',
  {
    slotType: text('slot_type').notNull(),
    statPos: text('stat_pos').notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({
        columns: [table.slotType, table.statPos],
        name: 'position_slot_mapping_pk',
      }),
    };
  },
);

export const sportEras = pgTable(
  'sport_eras',
  {
    sport: varchar('sport', { length: 20 }).notNull(),
    key: varchar('key', { length: 50 }).notNull(),
    label: varchar('label', { length: 100 }).notNull(),
    startYear: integer('start_year'),
    endYear: integer('end_year'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      pk: primaryKey({
        columns: [table.sport, table.key],
        name: 'sport_eras_pk',
      }),
      sportIdx: index('sport_eras_sport_idx').on(table.sport),
    };
  },
);
