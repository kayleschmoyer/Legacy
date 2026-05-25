import {
  boolean,
  char,
  decimal,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { leagues, leaguePosition, teams } from './Leagues';
import { players } from './Players';
import { users } from './Users';
import {
  matchupChatBlockScope,
  matchupMessageReactionType,
  matchupMessageReportStatus,
  matchupMessageType,
} from './Enums';

export const matchupStatus = pgEnum('matchup_status', [
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
]);

export const statsLoadingStatus = pgEnum('stats_loading_status', [
  'not_started',
  'queued',
  'loading',
  'completed',
  'failed',
  'retry',
]);

export const matchups = pgTable(
  'matchups',
  {
    id: serial('id').primaryKey().notNull(),
    leagueId: integer('league_id').notNull(),
    weekNumber: integer('week_number').notNull(),
    team1Id: integer('team1_id'),
    team2Id: integer('team2_id'),
    team1Score: decimal('team1_score', { precision: 10, scale: 2 }),
    team2Score: decimal('team2_score', { precision: 10, scale: 2 }),
    status: matchupStatus('status').notNull().default('scheduled'),
    statsLoadingStatus: statsLoadingStatus('stats_loading_status')
      .notNull()
      .default('not_started'),
    gamesPerMatchup: integer('games_per_matchup'),
    pitcherStartsPerMatchup: integer('pitcher_starts_per_matchup'),
    startTime: timestamp('start_time', { mode: 'string' }),
    endTime: timestamp('end_time', { mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      matchupsLeagueFk: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'matchups_league_fk',
      }).onDelete('cascade'),
      matchupsTeam1Fk: foreignKey({
        columns: [table.team1Id],
        foreignColumns: [teams.id],
        name: 'matchups_team1_fk',
      }).onDelete('cascade'),
      matchupsTeam2Fk: foreignKey({
        columns: [table.team2Id],
        foreignColumns: [teams.id],
        name: 'matchups_team2_fk',
      }).onDelete('cascade'),
      // Note: Removed unique constraint on (leagueId, weekNumber) as a league
      // needs to support multiple matchups per week (one for each team pairing)
      leagueIdIdx: index('matchups_league_id_idx').on(table.leagueId),
      team1IdIdx: index('matchups_team1_id_idx').on(table.team1Id),
      team2IdIdx: index('matchups_team2_id_idx').on(table.team2Id),
      statsLoadingStatusIdx: index('matchups_stats_loading_status_idx').on(
        table.statsLoadingStatus,
      ),
      // Composite partial indexes to help the planner use index scans for
      // getWinStreakMatchupsForTeam (always filters status = 'completed').
      team1IdEndTimeIdx: index('matchups_team1_id_end_time_idx')
        .on(table.team1Id, table.endTime)
        .where(sql`status = 'completed'`),
      team2IdEndTimeIdx: index('matchups_team2_id_end_time_idx')
        .on(table.team2Id, table.endTime)
        .where(sql`status = 'completed'`),
    };
  },
);

export const matchupPlayers = pgTable(
  'matchup_players',
  {
    id: serial('id').primaryKey().notNull(),
    matchupId: integer('matchup_id').notNull(),
    playerId: integer('player_id').notNull(),
    teamId: integer('team_id').notNull(),
    /** Position assignment for this matchup (persisted separately from team_members) */
    positionId: integer('position_id'),
    /**
     * True when this row's positionId was explicitly set via the matchup
     * lineup editor.  Rows with manuallyEdited = true are skipped during
     * roster-tab propagation so intentional future-week edits are preserved.
     */
    manuallyEdited: boolean('manually_edited').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      matchupPlayersMatchupFk: foreignKey({
        columns: [table.matchupId],
        foreignColumns: [matchups.id],
        name: 'matchup_players_matchup_fk',
      }).onDelete('cascade'),
      matchupPlayersPlayerFk: foreignKey({
        columns: [table.playerId],
        foreignColumns: [players.id],
        name: 'matchup_players_player_fk',
      }),
      matchupPlayersTeamFk: foreignKey({
        columns: [table.teamId],
        foreignColumns: [teams.id],
        name: 'matchup_players_team_fk',
      }).onDelete('cascade'),
      matchupPlayersPositionFk: foreignKey({
        columns: [table.positionId],
        foreignColumns: [leaguePosition.id],
        name: 'matchup_players_position_fk',
      }).onDelete('set null'),
      teamIdIdx: index('team_members_team_id_idx').on(table.teamId),
      playerIdIdx: index('team_members_player_id_idx').on(table.playerId),
      matchupTeamIdx: index('matchup_players_matchup_team_idx').on(
        table.matchupId,
        table.teamId,
      ),
      matchupPlayerTeamUnique: unique(
        'matchup_players_matchup_player_team_unique',
      ).on(table.matchupId, table.playerId, table.teamId),
    };
  },
);

export const leagueWeekPlayerSeasons = pgTable(
  'league_week_player_seasons',
  {
    id: serial('id').primaryKey().notNull(),
    leagueId: integer('league_id').notNull(),
    weekNumber: integer('week_number').notNull(),
    playerId: integer('player_id').notNull(),
    season: integer('season').notNull(),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow(),
  },
  (table) => {
    return {
      leagueWeekPlayerSeasonsLeagueFk: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'league_week_player_seasons_league_fk',
      }).onDelete('cascade'),
      leagueWeekPlayerSeasonsPlayerFk: foreignKey({
        columns: [table.playerId],
        foreignColumns: [players.id],
        name: 'league_week_player_seasons_player_fk',
      }),
      leagueWeekPlayerSeasonsUnique: unique(
        'league_week_player_seasons_unique',
      ).on(table.leagueId, table.weekNumber, table.playerId),
      leagueIdWeekNumberIdx: index(
        'league_week_player_seasons_league_id_week_number_idx',
      ).on(table.leagueId, table.weekNumber),
    };
  },
);

export const matchupPlayerGames = pgTable(
  'matchup_player_games',
  {
    id: serial('id').primaryKey().notNull(),
    matchupPlayerId: integer('matchup_player_id').notNull(),
    gameNum: integer('game_num').notNull(),
    gameIdentifier: varchar('game_identifier', { length: 20 }),
    gamePosition: char('game_position', { length: 2 }),
    statsLoadingStatus: varchar('stats_loading_status', { length: 20 }).default(
      'pending',
    ),
    /** True when an SP was probabilistically skipped for this game day (not starting). */
    pitcherStartSkipped: boolean('pitcher_start_skipped')
      .notNull()
      .default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // NOTE: Per-game scores are NOT stored. They are computed server-side in the
    // stats-lambda using league-specific scoring settings. Only the final team
    // totals (team1_score / team2_score) are persisted to the matchups table.
  },
  (table) => {
    return {
      matchupPlayerGamesMatchupPlayerFk: foreignKey({
        columns: [table.matchupPlayerId],
        foreignColumns: [matchupPlayers.id],
        name: 'matchup_player_games_matchup_player_fk',
      }).onDelete('cascade'),
      statsLoadingStatusIdx: index(
        'matchup_player_games_stats_loading_status_idx',
      ).on(table.statsLoadingStatus),
      // Composite for game-count queries (LS-910)
      matchupPlayerGameNumIdx: index('idx_matchup_player_games_player_game').on(
        table.matchupPlayerId,
        table.gameNum,
      ),
    };
  },
);

/**
 * Matchup Chat System (LS-37)
 *
 * Real-time messaging system for matchup participants with moderation,
 * reactions, blocking, and WebSocket connection tracking.
 */

export const matchupMessages = pgTable(
  'matchup_messages',
  {
    id: serial('id').primaryKey().notNull(),
    matchupId: integer('matchup_id').notNull(),
    leagueId: integer('league_id').notNull(),
    senderId: integer('sender_id').notNull(),
    messageType: matchupMessageType('message_type').notNull().default('text'),
    message: text('message').notNull().default(''),
    gifUrl: text('gif_url'),
    metadata: jsonb('metadata').notNull().default({}),
    containsProfanity: boolean('contains_profanity').notNull().default(false),
    isFlagged: boolean('is_flagged').notNull().default(false),
    flaggedBy: integer('flagged_by'),
    flaggedReason: text('flagged_reason'),
    moderatedAt: timestamp('moderated_at', { mode: 'string' }),
    deletedAt: timestamp('deleted_at', { mode: 'string' }),
    createdAt: timestamp('created_at', { mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'string' })
      .notNull()
      .defaultNow(),
    replyToMessageId: integer('reply_to_message_id'),
    pinnedAt: timestamp('pinned_at', { mode: 'string' }),
  },
  (table) => {
    return {
      matchupMessagesMatchupFk: foreignKey({
        columns: [table.matchupId],
        foreignColumns: [matchups.id],
        name: 'matchup_messages_matchup_fk',
      }).onDelete('cascade'),
      matchupMessagesLeagueFk: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'matchup_messages_league_fk',
      }).onDelete('cascade'),
      matchupMessagesSenderFk: foreignKey({
        columns: [table.senderId],
        foreignColumns: [users.id],
        name: 'matchup_messages_sender_fk',
      }).onDelete('cascade'),
      matchupMessagesFlaggedByFk: foreignKey({
        columns: [table.flaggedBy],
        foreignColumns: [users.id],
        name: 'matchup_messages_flagged_by_fk',
      }).onDelete('set null'),
      matchupMessagesReplyFk: foreignKey({
        columns: [table.replyToMessageId],
        foreignColumns: [table.id],
        name: 'matchup_messages_reply_fk',
      }).onDelete('set null'),
      matchupMessagesFlaggerFk: foreignKey({
        columns: [table.flaggedBy],
        foreignColumns: [users.id],
        name: 'matchup_messages_flagger_fk',
      }).onDelete('set null'),
      leagueIdIdx: index('matchup_messages_league_id_idx').on(table.leagueId),
      matchupIdCreatedAtIdx: index(
        'matchup_messages_matchup_id_created_at_idx',
      ).on(table.matchupId, table.createdAt.desc()),
      senderIdIdx: index('matchup_messages_sender_id_idx').on(table.senderId),
      isFlaggedIdx: index('matchup_messages_is_flagged_idx')
        .on(table.isFlagged)
        .where(sql`${table.isFlagged} = true`),
      flaggedByIdx: index('matchup_messages_flagged_by_idx')
        .on(table.flaggedBy)
        .where(sql`${table.flaggedBy} IS NOT NULL`),
      replyToMessageIdIdx: index('matchup_messages_reply_to_message_id_idx')
        .on(table.replyToMessageId)
        .where(sql`${table.replyToMessageId} IS NOT NULL`),
    };
  },
);

export const matchupChatBlocks = pgTable(
  'matchup_chat_blocks',
  {
    id: serial('id').primaryKey().notNull(),
    leagueId: integer('league_id').notNull(),
    matchupId: integer('matchup_id'),
    blockingUserId: integer('blocking_user_id').notNull(),
    blockedUserId: integer('blocked_user_id').notNull(),
    scope: matchupChatBlockScope('scope').notNull().default('matchup'),
    createdAt: timestamp('created_at', { mode: 'string' })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { mode: 'string' }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      matchupChatBlocksBlockingFk: foreignKey({
        columns: [table.blockingUserId],
        foreignColumns: [users.id],
        name: 'matchup_chat_blocks_blocking_fk',
      }).onDelete('cascade'),
      matchupChatBlocksBlockedFk: foreignKey({
        columns: [table.blockedUserId],
        foreignColumns: [users.id],
        name: 'matchup_chat_blocks_blocked_fk',
      }).onDelete('cascade'),
      blockingUserIdIdx: index('matchup_chat_blocks_blocking_user_id_idx').on(
        table.blockingUserId,
      ),
      blockedUserIdIdx: index('matchup_chat_blocks_blocked_user_id_idx').on(
        table.blockedUserId,
      ),
      leagueIdIdx: index('matchup_chat_blocks_league_id_idx').on(
        table.leagueId,
      ),
    };
  },
);

export const matchupMessageConnections = pgTable(
  'matchup_message_connections',
  {
    connectionId: varchar('connection_id', { length: 128 })
      .primaryKey()
      .notNull(),
    leagueId: integer('league_id').notNull(),
    matchupId: integer('matchup_id').notNull(),
    userId: integer('user_id').notNull(),
    platform: varchar('platform', { length: 32 }).notNull().default('web'),
    connectedAt: timestamp('connected_at', { mode: 'string' })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      leagueIdIdx: index('matchup_message_connections_league_id_idx').on(
        table.leagueId,
      ),
      matchupIdIdx: index('matchup_message_connections_matchup_id_idx').on(
        table.matchupId,
      ),
      userIdIdx: index('matchup_message_connections_user_id_idx').on(
        table.userId,
      ),
      lastSeenAtIdx: index('matchup_message_connections_last_seen_at_idx').on(
        table.lastSeenAt,
      ),
    };
  },
);

export const matchupMessageReactions = pgTable(
  'matchup_message_reactions',
  {
    id: serial('id').primaryKey().notNull(),
    messageId: integer('message_id').notNull(),
    userId: integer('user_id').notNull(),
    reactionType: matchupMessageReactionType('reaction_type')
      .notNull()
      .default('like'),
    createdAt: timestamp('created_at', { mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      matchupMessageReactionsMessageFk: foreignKey({
        columns: [table.messageId],
        foreignColumns: [matchupMessages.id],
        name: 'matchup_message_reactions_message_fk',
      }).onDelete('cascade'),
      matchupMessageReactionsUserFk: foreignKey({
        columns: [table.userId],
        foreignColumns: [users.id],
        name: 'matchup_message_reactions_user_fk',
      }).onDelete('cascade'),
      matchupMessageReactionsUnique: unique(
        'matchup_message_reactions_unique',
      ).on(table.messageId, table.userId, table.reactionType),
      messageIdIdx: index('matchup_message_reactions_message_id_idx').on(
        table.messageId,
      ),
    };
  },
);

export const matchupMessageReports = pgTable(
  'matchup_message_reports',
  {
    id: serial('id').primaryKey().notNull(),
    messageId: integer('message_id').notNull(),
    reportedBy: integer('reported_by').notNull(),
    reason: text('reason').notNull(),
    status: matchupMessageReportStatus('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { mode: 'string' })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp('resolved_at', { mode: 'string' }),
    reviewedBy: integer('reviewed_by'),
    moderatorNotes: text('moderator_notes'),
    resolution: text('resolution'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      matchupMessageReportsMessageFk: foreignKey({
        columns: [table.messageId],
        foreignColumns: [matchupMessages.id],
        name: 'matchup_message_reports_message_fk',
      }).onDelete('cascade'),
      matchupMessageReportsReporterFk: foreignKey({
        columns: [table.reportedBy],
        foreignColumns: [users.id],
        name: 'matchup_message_reports_reporter_fk',
      }).onDelete('cascade'),
      matchupMessageReportsReviewerFk: foreignKey({
        columns: [table.reviewedBy],
        foreignColumns: [users.id],
        name: 'matchup_message_reports_reviewer_fk',
      }).onDelete('set null'),
      messageIdIdx: index('matchup_message_reports_message_id_idx').on(
        table.messageId,
      ),
      statusIdx: index('matchup_message_reports_status_idx').on(table.status),
      reportedByIdx: index('matchup_message_reports_reported_by_idx').on(
        table.reportedBy,
      ),
      reviewedByIdx: index('matchup_message_reports_reviewed_by_idx')
        .on(table.reviewedBy)
        .where(sql`${table.reviewedBy} IS NOT NULL`),
    };
  },
);
