import {
  pgTable,
  serial,
  integer,
  boolean,
  timestamp,
  foreignKey,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { leagues, leagueMembers } from './Leagues';

/**
 * Per-league dues configuration. One row per league.
 * Commissioners toggle dues on/off, set an amount, and configure reminders.
 */
export const leagueDuesSettings = pgTable(
  'league_dues_settings',
  {
    id: serial('id').primaryKey().notNull(),
    leagueId: integer('league_id').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    amountCents: integer('amount_cents').notNull().default(0),
    reminderEnabled: boolean('reminder_enabled').notNull().default(false),
    reminderDayOfWeek: integer('reminder_day_of_week'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      leagueFk: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'league_dues_settings_league_fk',
      }).onDelete('cascade'),
      leagueUk: unique('league_dues_settings_league_uk').on(table.leagueId),
    };
  },
);

/**
 * Per-member payment status within a league.
 * Commissioners mark members as paid/unpaid; all members can view status.
 */
export const leagueMemberPaymentStatus = pgTable(
  'league_member_payment_status',
  {
    id: serial('id').primaryKey().notNull(),
    leagueId: integer('league_id').notNull(),
    userId: integer('user_id').notNull(),
    paid: boolean('paid').notNull().default(false),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    markedBy: integer('marked_by'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      leagueFk: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'league_member_payment_status_league_fk',
      }).onDelete('cascade'),
      memberFk: foreignKey({
        columns: [table.leagueId, table.userId],
        foreignColumns: [leagueMembers.leagueId, leagueMembers.userId],
        name: 'league_member_payment_status_member_fk',
      }).onDelete('cascade'),
      memberUk: unique('league_member_payment_status_uk').on(
        table.leagueId,
        table.userId,
      ),
      leagueIdIdx: index('league_member_payment_status_league_id_idx').on(
        table.leagueId,
      ),
      userIdIdx: index('league_member_payment_status_user_id_idx').on(
        table.userId,
      ),
    };
  },
);
