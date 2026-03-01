import {
  pgTable,
  serial,
  integer,
  varchar,
  jsonb,
  timestamp,
  index,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { leagues, teams } from './Leagues';

/**
 * Earned badges — one row per badge per user.
 *
 * - Global (non-league) badges: league_id IS NULL, unique on (user_id, badge_key).
 * - Per-league badges: league_id IS NOT NULL, unique on (user_id, badge_key, league_id).
 *
 * The uniqueness is enforced via partial unique indexes defined in the DB migration.
 * Drizzle does not natively support partial indexes for uniqueness enforcement,
 * so deduplication is also handled at the service layer.
 */
export const userBadges = pgTable(
  'user_badges',
  {
    id: serial('id').primaryKey(),
    /** Owning user — references app_internal.users.id (cross-schema, no FK in Drizzle) */
    userId: integer('user_id').notNull(),
    /** Badge definition key (e.g. 'league_champion', 'triple_crown_drafter') */
    badgeKey: varchar('badge_key', { length: 100 }).notNull(),
    /** League this badge is scoped to; null for global (cross-league) badges */
    leagueId: integer('league_id'),
    /** Team associated with the badge earn event; null for user-only badges */
    teamId: integer('team_id'),
    /** Rarity level of the badge */
    rarity: varchar('rarity', { length: 20 }).notNull().default('common'),
    /**
     * Free-form JSON context captured when the badge was awarded.
     * Examples: { matchup_id: 42, score_margin: 87.5, season: 1927 }
     */
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    /** When the badge was first awarded */
    earnedAt: timestamp('earned_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userBadgesLeagueFk: foreignKey({
      columns: [table.leagueId],
      foreignColumns: [leagues.id],
      name: 'user_badges_leagues_id_fk',
    }).onDelete('cascade'),
    userBadgesTeamFk: foreignKey({
      columns: [table.teamId],
      foreignColumns: [teams.id],
      name: 'user_badges_teams_id_fk',
    }).onDelete('set null'),
    userIdIdx: index('user_badges_user_id_idx').on(table.userId),
    leagueIdIdx: index('user_badges_league_id_idx').on(table.leagueId),
    badgeKeyIdx: index('user_badges_badge_key_idx').on(table.badgeKey),
    earnedAtIdx: index('user_badges_earned_at_idx').on(
      table.userId,
      table.earnedAt,
    ),
    // Partial unique indexes (user_badges_uk_global / user_badges_uk_league)
    // are defined in the DB migration and enforced at the service layer.
  }),
);

/**
 * Progress tracking toward not-yet-earned multi-step badges.
 *
 * One row per (user, badge_key[, league_id]). When progress_value reaches
 * progress_target the service awards the badge and can clean up the row.
 */
export const badgeProgress = pgTable(
  'badge_progress',
  {
    id: serial('id').primaryKey(),
    /** Owning user — references app_internal.users.id */
    userId: integer('user_id').notNull(),
    /** Badge definition key being tracked */
    badgeKey: varchar('badge_key', { length: 100 }).notNull(),
    /** League scope; null for global cross-league progress */
    leagueId: integer('league_id'),
    /** Current progress count (e.g. consecutive weeks won) */
    progressValue: integer('progress_value').notNull().default(0),
    /** Target value required to earn the badge */
    progressTarget: integer('progress_target').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    badgeProgressLeagueFk: foreignKey({
      columns: [table.leagueId],
      foreignColumns: [leagues.id],
      name: 'badge_progress_leagues_id_fk',
    }).onDelete('cascade'),
    userIdIdx: index('badge_progress_user_id_idx').on(table.userId),
    leagueIdIdx: index('badge_progress_league_id_idx').on(table.leagueId),
    // Partial unique indexes enforced in DB migration and at service layer.
  }),
);
