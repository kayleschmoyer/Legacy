import {
  pgTable,
  serial,
  integer,
  varchar,
  boolean,
  jsonb,
  text,
  timestamp,
  foreignKey,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { drafts, leagues } from './Leagues';
import { users } from './Users';
import { eraFilter, invitationStatus, playerPool } from './Enums';

/**
 * Draft-first tables (LS-10073, epic LS-9252). Created ahead of the slices
 * that read and write them; nothing uses them yet. draft_participants lives in
 * Leagues.ts because draft_picks and draft_queue reference it.
 */

/**
 * Player-pool rules for a mock draft — what a mock draft used to borrow from
 * its throwaway league. League drafts keep reading these from `leagues`.
 */
export const mockDraftSettings = pgTable(
  'mock_draft_settings',
  {
    draftId: integer('draft_id').primaryKey().notNull(),
    playerPool: playerPool('player_pool').notNull().default('all'),
    rosterSize: integer('roster_size').notNull().default(25),
    /** 'dst' | 'idp' (CHECK). Defaults to 'idp' — career_football_defense is
     *  empty, so a 'dst' mock draft could never fill its DST slot (LS-9475). */
    defensiveFormat: varchar('defensive_format', { length: 10 })
      .notNull()
      .default('idp'),
    eraFilter: eraFilter('era_filter').notNull().default('all'),
    hofOnly: boolean('hof_only').notNull().default(false),
    customEraStartYear: integer('custom_era_start_year'),
    customEraEndYear: integer('custom_era_end_year'),
    minCareerGames: integer('min_career_games').notNull().default(0),
    minCareerSeasons: integer('min_career_seasons').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      mockDraftSettingsDraftsIdFk: foreignKey({
        columns: [table.draftId],
        foreignColumns: [drafts.id],
        name: 'mock_draft_settings_drafts_id_fk',
      }).onDelete('cascade'),
    };
  },
);

/**
 * Append-only ledger of mock drafts created, one row per draft (LS-10483).
 * The free-tier weekly cap counts these rows, not live `drafts`, so deleting a
 * mock draft never refunds quota. Written by the drafts_record_mock_usage
 * AFTER INSERT trigger on `drafts`; draft_id is intentionally not a foreign
 * key so the row outlives its draft.
 */
export const mockDraftUsage = pgTable(
  'mock_draft_usage',
  {
    id: serial('id').primaryKey().notNull(),
    userId: integer('user_id').notNull(),
    draftId: integer('draft_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      mockDraftUsageUserIdFk: foreignKey({
        columns: [table.userId],
        foreignColumns: [users.id],
        name: 'mock_draft_usage_user_id_fkey',
      }).onDelete('cascade'),
      userIdCreatedAtIdx: index('mock_draft_usage_user_id_created_at_idx').on(
        table.userId,
        table.createdAt,
      ),
    };
  },
);

/**
 * Direct per-user invite to a mock draft or a league (exactly one target —
 * CHECK invitations_target_ck). Shareable codes stay on their targets
 * (drafts.invite_code / leagues.invite_code). reservedSlot holds a mock-draft
 * seat while the invite is pending.
 */
export const invitations = pgTable(
  'invitations',
  {
    id: serial('id').primaryKey().notNull(),
    draftId: integer('draft_id'),
    leagueId: integer('league_id'),
    invitedUserId: integer('invited_user_id').notNull(),
    invitedBy: integer('invited_by').notNull(),
    status: invitationStatus('status').notNull().default('pending'),
    reservedSlot: integer('reserved_slot'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      invitationsDraftsIdFk: foreignKey({
        columns: [table.draftId],
        foreignColumns: [drafts.id],
        name: 'invitations_drafts_id_fk',
      }).onDelete('cascade'),
      invitationsLeaguesIdFk: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'invitations_leagues_id_fk',
      }).onDelete('cascade'),
      invitationsInvitedUserIdFk: foreignKey({
        columns: [table.invitedUserId],
        foreignColumns: [users.id],
        name: 'invitations_invited_user_id_fk',
      }).onDelete('cascade'),
      invitationsInvitedByFk: foreignKey({
        columns: [table.invitedBy],
        foreignColumns: [users.id],
        name: 'invitations_invited_by_fk',
      }).onDelete('cascade'),
      ukPendingDraftUser: uniqueIndex('invitations_uk_pending_draft_user')
        .on(table.draftId, table.invitedUserId)
        .where(sql`status = 'pending' AND draft_id IS NOT NULL`),
      ukPendingLeagueUser: uniqueIndex('invitations_uk_pending_league_user')
        .on(table.leagueId, table.invitedUserId)
        .where(sql`status = 'pending' AND league_id IS NOT NULL`),
      invitedUserStatusIdx: index('invitations_invited_user_status_idx').on(
        table.invitedUserId,
        table.status,
      ),
    };
  },
);

/** Mock-draft chat. League drafts keep using league_messages. */
export const draftMessages = pgTable(
  'draft_messages',
  {
    id: serial('id').primaryKey().notNull(),
    draftId: integer('draft_id').notNull(),
    userId: integer('user_id'),
    messageText: varchar('message_text').notNull(),
    messageType: varchar('message_type', { length: 50 })
      .notNull()
      .default('text'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    /** URL of GIF attachment; null for text messages */
    gifUrl: text('gif_url'),
    /** Server-side profanity check result, as on league_messages. */
    containsProfanity: boolean('contains_profanity').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      draftMessagesDraftsIdFk: foreignKey({
        columns: [table.draftId],
        foreignColumns: [drafts.id],
        name: 'draft_messages_drafts_id_fk',
      }).onDelete('cascade'),
      draftMessagesUserIdFk: foreignKey({
        columns: [table.userId],
        foreignColumns: [users.id],
        name: 'draft_messages_user_id_fk',
      }).onDelete('set null'),
      draftIdCreatedAtIdx: index('draft_messages_draft_id_created_at_idx').on(
        table.draftId,
        table.createdAt,
      ),
    };
  },
);
