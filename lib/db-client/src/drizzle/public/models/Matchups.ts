import {
  boolean,
  char,
  decimal,
  foreignKey,
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
import { leagues, teams } from './Leagues';
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
      }),
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
      }),
      leagueWeekPlayerSeasonsPlayerFk: foreignKey({
        columns: [table.playerId],
        foreignColumns: [players.id],
        name: 'league_week_player_seasons_player_fk',
      }),
      leagueWeekPlayerSeasonsUnique: unique(
        'league_week_player_seasons_unique',
      ).on(table.leagueId, table.weekNumber, table.playerId),
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
    battingGameNum: integer('batting_game_num'),
    fieldingGameNum: integer('fielding_game_num'),
    pitchingGameNum: integer('pitching_game_num'),
    fieldingGamePos: char('fielding_game_pos', { length: 2 }),
    statsLoadingStatus: varchar('stats_loading_status', { length: 20 }).default(
      'pending',
    ),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // NOTE: Scores are NOT stored in DB - they are calculated on the frontend
    // using the @legacy-sports/scoring package with league-specific settings
  },
  (table) => {
    return {
      matchupPlayerGamesMatchupPlayerFk: foreignKey({
        columns: [table.matchupPlayerId],
        foreignColumns: [matchupPlayers.id],
        name: 'matchup_player_games_matchup_player_fk',
      }),
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
    };
  },
);
