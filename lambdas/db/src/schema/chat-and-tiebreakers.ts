import { PublicSchema } from '@legacy-sports/db-client';
import { createNotificationService } from '@legacy-sports/aws-utils';
import { LOGGER } from '@legacy-sports/logging';
import { and, asc, desc, eq, or } from 'drizzle-orm';
import { builder } from './builder';
import { Team } from './leagues/types';

/**
 * Chat System & Tiebreaker Rules Schema (LS-90)
 *
 * Implements matchup chat messaging, moderation, reactions, blocking,
 * and tiebreaker rules for resolving matchup ties.
 */

// ============================================================================
// ENUMS
// ============================================================================

const MatchupMessageType = builder.enumType('MatchupMessageType', {
  values: ['text', 'gif', 'system'] as const,
  description: 'Type of matchup message',
});

const MatchupChatBlockScope = builder.enumType('MatchupChatBlockScope', {
  values: ['matchup', 'league', 'global'] as const,
  description: 'Scope of chat block (matchup-specific, league-wide, or global)',
});

const MatchupMessageReactionType = builder.enumType(
  'MatchupMessageReactionType',
  {
    values: ['like', 'fire', 'laugh', 'wow', 'trophy', 'thumbs_down'] as const,
    description: 'Available reaction types for messages',
  },
);

const MatchupMessageReportStatus = builder.enumType(
  'MatchupMessageReportStatus',
  {
    values: ['pending', 'reviewing', 'resolved', 'dismissed'] as const,
    description: 'Status of message moderation report',
  },
);

const TiebreakerMethod = builder.enumType('TiebreakerMethod', {
  values: [
    'highest_category',
    'total_season_points',
    'head_to_head_record',
    'random',
    'co_champion',
  ] as const,
  description: 'Method for resolving tiebreaker scenarios',
});

// ============================================================================
// CHAT SYSTEM TYPES
// ============================================================================

/**
 * Matchup Message - Real-time chat message in matchup
 */
const MatchupMessage = builder.objectRef<{
  id: number;
  matchupId: number;
  leagueId: number;
  senderId: number;
  messageType: 'text' | 'gif' | 'system';
  message: string;
  gifUrl: string | null;
  metadata: Record<string, unknown>;
  containsProfanity: boolean;
  isFlagged: boolean;
  flaggedBy: number | null;
  flaggedReason: string | null;
  moderatedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  replyToMessageId: number | null;
  pinnedAt: string | null;
}>('MatchupMessage');

builder.objectType(MatchupMessage, {
  description: 'Chat message in matchup with moderation features',
  fields: (t) => ({
    id: t.exposeID('id'),
    matchupId: t.exposeInt('matchupId'),
    leagueId: t.exposeInt('leagueId'),
    senderId: t.exposeInt('senderId'),
    messageType: t.field({
      type: MatchupMessageType,
      resolve: (msg) => msg.messageType,
    }),
    message: t.exposeString('message'),
    gifUrl: t.exposeString('gifUrl', { nullable: true }),
    containsProfanity: t.exposeBoolean('containsProfanity'),
    isFlagged: t.exposeBoolean('isFlagged'),
    flaggedBy: t.exposeInt('flaggedBy', { nullable: true }),
    flaggedReason: t.exposeString('flaggedReason', { nullable: true }),
    moderatedAt: t.exposeString('moderatedAt', { nullable: true }),
    deletedAt: t.exposeString('deletedAt', { nullable: true }),
    createdAt: t.exposeString('createdAt'),
    updatedAt: t.exposeString('updatedAt'),
    replyToMessageId: t.exposeInt('replyToMessageId', { nullable: true }),
    pinnedAt: t.exposeString('pinnedAt', { nullable: true }),
    // Relational fields
    sender: t.field({
      type: 'User',
      nullable: true,
      resolve: async (msg, _args, context) => {
        return context.loaders.users.load(msg.senderId);
      },
    }),
    replyToMessage: t.field({
      type: MatchupMessage,
      nullable: true,
      resolve: async (msg, _args, context) => {
        if (!msg.replyToMessageId) return null;
        return context.loaders.matchupMessages.load(msg.replyToMessageId);
      },
    }),
  }),
});

/**
 * Matchup Chat Block - User blocking relationship
 */
const MatchupChatBlock = builder.objectRef<{
  id: number;
  leagueId: number;
  matchupId: number | null;
  blockingUserId: number;
  blockedUserId: number;
  scope: 'matchup' | 'league' | 'global';
  createdAt: string;
  expiresAt: string | null;
  updatedAt: string;
}>('MatchupChatBlock');

builder.objectType(MatchupChatBlock, {
  description: 'User blocking relationship for chat',
  fields: (t) => ({
    id: t.exposeID('id'),
    leagueId: t.exposeInt('leagueId'),
    matchupId: t.exposeInt('matchupId', { nullable: true }),
    blockingUserId: t.exposeInt('blockingUserId'),
    blockedUserId: t.exposeInt('blockedUserId'),
    scope: t.field({
      type: MatchupChatBlockScope,
      resolve: (block) => block.scope,
    }),
    createdAt: t.exposeString('createdAt'),
    expiresAt: t.exposeString('expiresAt', { nullable: true }),
    updatedAt: t.exposeString('updatedAt'),
  }),
});

/**
 * Matchup Message Reaction - Reactions to messages
 */
const MatchupMessageReaction = builder.objectRef<{
  id: number;
  messageId: number;
  userId: number;
  reactionType: 'like' | 'fire' | 'laugh' | 'wow' | 'trophy' | 'thumbs_down';
  createdAt: string;
  updatedAt: string;
}>('MatchupMessageReaction');

builder.objectType(MatchupMessageReaction, {
  description: 'Reaction to a matchup message',
  fields: (t) => ({
    id: t.exposeID('id'),
    messageId: t.exposeInt('messageId'),
    userId: t.exposeInt('userId'),
    reactionType: t.field({
      type: MatchupMessageReactionType,
      resolve: (reaction) => reaction.reactionType,
    }),
    createdAt: t.exposeString('createdAt'),
    updatedAt: t.exposeString('updatedAt'),
  }),
});

/**
 * Matchup Message Report - Moderation reports
 */
const MatchupMessageReport = builder.objectRef<{
  id: number;
  messageId: number;
  reportedBy: number;
  reason: string;
  status: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
  createdAt: string;
  resolvedAt: string | null;
  reviewedBy: number | null;
  moderatorNotes: string | null;
  resolution: string | null;
  updatedAt: string;
}>('MatchupMessageReport');

builder.objectType(MatchupMessageReport, {
  description: 'Message moderation report',
  fields: (t) => ({
    id: t.exposeID('id'),
    messageId: t.exposeInt('messageId'),
    reportedBy: t.exposeInt('reportedBy'),
    reason: t.exposeString('reason'),
    status: t.field({
      type: MatchupMessageReportStatus,
      resolve: (report) => report.status,
    }),
    createdAt: t.exposeString('createdAt'),
    resolvedAt: t.exposeString('resolvedAt', { nullable: true }),
    reviewedBy: t.exposeInt('reviewedBy', { nullable: true }),
    moderatorNotes: t.exposeString('moderatorNotes', { nullable: true }),
    resolution: t.exposeString('resolution', { nullable: true }),
    updatedAt: t.exposeString('updatedAt'),
  }),
});

/**
 * Matchup Message Connection - WebSocket connection tracking
 */
const MatchupMessageConnection = builder.objectRef<{
  connectionId: string;
  leagueId: number;
  matchupId: number;
  userId: number;
  platform: string;
  connectedAt: string;
  lastSeenAt: string;
}>('MatchupMessageConnection');

builder.objectType(MatchupMessageConnection, {
  description: 'WebSocket connection tracking for real-time chat',
  fields: (t) => ({
    connectionId: t.exposeString('connectionId'),
    leagueId: t.exposeInt('leagueId'),
    matchupId: t.exposeInt('matchupId'),
    userId: t.exposeInt('userId'),
    platform: t.exposeString('platform'),
    connectedAt: t.exposeString('connectedAt'),
    lastSeenAt: t.exposeString('lastSeenAt'),
  }),
});

// ============================================================================
// LEAGUE & DIRECT-MESSAGE CHAT TYPES
// ============================================================================

/**
 * LeagueChatMessage — a message in the league-wide chat room.
 * Backed by the `league_messages` table.
 */
const LeagueChatMessage = builder.objectRef<{
  id: number;
  leagueId: number;
  userId: number | null;
  messageText: string;
  timestamp: string | null;
  messageType: string;
  metadata: Record<string, unknown> | null;
}>('LeagueChatMessage');

builder.objectType(LeagueChatMessage, {
  description: 'A message posted to the league-wide chat room',
  fields: (t) => ({
    id: t.exposeID('id'),
    leagueId: t.exposeInt('leagueId'),
    userId: t.exposeInt('userId', { nullable: true }),
    messageText: t.exposeString('messageText'),
    timestamp: t.exposeString('timestamp', { nullable: true }),
    messageType: t.exposeString('messageType'),
    metadata: t.field({
      type: 'String',
      nullable: true,
      resolve: (msg) => (msg.metadata ? JSON.stringify(msg.metadata) : null),
    }),
    sender: t.field({
      type: 'User',
      nullable: true,
      resolve: async (msg, _args, context) =>
        msg.userId != null ? context.loaders.users.load(msg.userId) : null,
    }),
  }),
});

/**
 * DirectMessage — a private message between two players.
 * Backed by the `direct_messages` table.
 */
const DirectMessage = builder.objectRef<{
  id: number;
  fromUserId: number;
  toUserId: number;
  leagueId: number | null;
  messageText: string;
  readAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}>('DirectMessage');

builder.objectType(DirectMessage, {
  description: 'A private direct message between two players',
  fields: (t) => ({
    id: t.exposeID('id'),
    fromUserId: t.exposeInt('fromUserId'),
    toUserId: t.exposeInt('toUserId'),
    leagueId: t.exposeInt('leagueId', { nullable: true }),
    messageText: t.exposeString('messageText'),
    readAt: t.exposeString('readAt', { nullable: true }),
    deletedAt: t.exposeString('deletedAt', { nullable: true }),
    createdAt: t.exposeString('createdAt'),
    updatedAt: t.exposeString('updatedAt'),
    sender: t.field({
      type: 'User',
      nullable: true,
      resolve: async (msg, _args, context) =>
        context.loaders.users.load(msg.fromUserId),
    }),
    recipient: t.field({
      type: 'User',
      nullable: true,
      resolve: async (msg, _args, context) =>
        context.loaders.users.load(msg.toUserId),
    }),
  }),
});

// ============================================================================
// TIEBREAKER SYSTEM TYPES
// ============================================================================

/**
 * Tiebreaker Rules - League tiebreaker configuration
 */
const TiebreakerRule = builder.objectRef<{
  id: number;
  leagueId: number;
  primaryMethod:
    | 'highest_category'
    | 'total_season_points'
    | 'head_to_head_record'
    | 'random'
    | 'co_champion';
  secondaryMethod:
    | 'highest_category'
    | 'total_season_points'
    | 'head_to_head_record'
    | 'random'
    | 'co_champion'
    | null;
  tertiaryMethod:
    | 'highest_category'
    | 'total_season_points'
    | 'head_to_head_record'
    | 'random'
    | 'co_champion'
    | null;
  allowCommissionerOverride: boolean;
  config: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}>('TiebreakerRule');

builder.objectType(TiebreakerRule, {
  description: 'Tiebreaker configuration for a league',
  fields: (t) => ({
    id: t.exposeID('id'),
    leagueId: t.exposeInt('leagueId'),
    primaryMethod: t.field({
      type: TiebreakerMethod,
      resolve: (rule) => rule.primaryMethod,
    }),
    secondaryMethod: t.field({
      type: TiebreakerMethod,
      nullable: true,
      resolve: (rule) => rule.secondaryMethod,
    }),
    tertiaryMethod: t.field({
      type: TiebreakerMethod,
      nullable: true,
      resolve: (rule) => rule.tertiaryMethod,
    }),
    allowCommissionerOverride: t.exposeBoolean('allowCommissionerOverride'),
    config: t.string({
      nullable: true,
      resolve: (rule) => (rule.config ? JSON.stringify(rule.config) : null),
    }),
    createdAt: t.exposeString('createdAt'),
    updatedAt: t.exposeString('updatedAt'),
  }),
});

/**
 * Tiebreaker History - Audit log of tiebreaker resolutions
 */
const TiebreakerHistory = builder.objectRef<{
  id: number;
  matchupId: number;
  appliedMethod:
    | 'highest_category'
    | 'total_season_points'
    | 'head_to_head_record'
    | 'random'
    | 'co_champion';
  wasCommissionerOverride: boolean;
  commissionerUserId: number | null;
  winnerId: number | null;
  reason: string | null;
  resolvedAt: string;
  createdAt: string;
  updatedAt: string;
}>('TiebreakerHistory');

builder.objectType(TiebreakerHistory, {
  description: 'Historical record of tiebreaker resolution',
  fields: (t) => ({
    id: t.exposeID('id'),
    matchupId: t.exposeInt('matchupId'),
    appliedMethod: t.field({
      type: TiebreakerMethod,
      resolve: (history) => history.appliedMethod,
    }),
    wasCommissionerOverride: t.exposeBoolean('wasCommissionerOverride'),
    commissionerUserId: t.exposeInt('commissionerUserId', { nullable: true }),
    winnerId: t.exposeInt('winnerId', { nullable: true }),
    reason: t.exposeString('reason', { nullable: true }),
    resolvedAt: t.exposeString('resolvedAt'),
    createdAt: t.exposeString('createdAt'),
    updatedAt: t.exposeString('updatedAt'),
    // Relational fields
    winner: t.field({
      type: Team,
      nullable: true,
      resolve: async (history, _args, context) => {
        if (!history.winnerId) return null;
        const results = await context.db
          .select({
            id: PublicSchema.teams.id,
            name: PublicSchema.teams.name,
            leagueId: PublicSchema.teams.leagueId,
            divisionId: PublicSchema.teams.divisionId,
            createdAt: PublicSchema.teams.createdAt,
            updatedAt: PublicSchema.teams.updatedAt,
            waiverOrder: PublicSchema.teams.waiverOrder,
            faabBudget: PublicSchema.teams.faabBudget,
          })
          .from(PublicSchema.teams)
          .where(eq(PublicSchema.teams.id, history.winnerId))
          .limit(1);
        return results[0] || null;
      },
    }),
  }),
});

// ============================================================================
// QUERIES
// ============================================================================

// Query: getMatchupMessages
builder.queryField('getMatchupMessages', (t) =>
  t.field({
    type: [MatchupMessage],
    args: {
      matchupId: t.arg.int({ required: true }),
      limit: t.arg.int({ required: false }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const query = context.db
        .select()
        .from(PublicSchema.matchupMessages)
        .where(eq(PublicSchema.matchupMessages.matchupId, args.matchupId))
        .orderBy(desc(PublicSchema.matchupMessages.createdAt));

      const results = args.limit ? await query.limit(args.limit) : await query;

      return results.map((msg) => ({
        ...msg,
        metadata: msg.metadata as Record<string, unknown>,
      }));
    },
  }),
);

// Query: getTiebreakerRules
builder.queryField('getTiebreakerRules', (t) =>
  t.field({
    type: TiebreakerRule,
    nullable: true,
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const results = await context.db
        .select()
        .from(PublicSchema.tiebreakerRules)
        .where(eq(PublicSchema.tiebreakerRules.leagueId, args.leagueId))
        .limit(1);

      const rule = results[0];
      if (!rule) return null;
      return {
        ...rule,
        config: rule.config as Record<string, unknown> | null,
      };
    },
  }),
);

// Query: getTiebreakerHistory
builder.queryField('getTiebreakerHistory', (t) =>
  t.field({
    type: [TiebreakerHistory],
    args: {
      matchupId: t.arg.int({ required: false }),
      leagueId: t.arg.int({ required: false }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      if (!args.matchupId && !args.leagueId) {
        throw new Error('Either matchupId or leagueId must be provided');
      }

      if (args.matchupId) {
        const results = await context.db
          .select()
          .from(PublicSchema.tiebreakerHistory)
          .where(eq(PublicSchema.tiebreakerHistory.matchupId, args.matchupId))
          .orderBy(desc(PublicSchema.tiebreakerHistory.resolvedAt));
        return results.map((history) => ({
          ...history,
          createdAt: history.createdAt.toISOString(),
          updatedAt: history.updatedAt.toISOString(),
        }));
      }

      // Get all tiebreakers for a league (join through matchups)
      if (!args.leagueId) {
        throw new Error('leagueId is required when matchupId is not provided');
      }

      const matchups = await context.db
        .select({ id: PublicSchema.matchups.id })
        .from(PublicSchema.matchups)
        .where(eq(PublicSchema.matchups.leagueId, args.leagueId));

      const matchupIds = matchups.map((m) => m.id);

      if (matchupIds.length === 0) {
        return [];
      }

      const results = await context.db
        .select()
        .from(PublicSchema.tiebreakerHistory)
        .where(
          and(
            ...matchupIds.map((id) =>
              eq(PublicSchema.tiebreakerHistory.matchupId, id),
            ),
          ),
        )
        .orderBy(desc(PublicSchema.tiebreakerHistory.resolvedAt));
      return results.map((history) => ({
        ...history,
        createdAt: history.createdAt.toISOString(),
        updatedAt: history.updatedAt.toISOString(),
      }));
    },
  }),
);

// Query: getLeagueMessages — fetch recent messages in the league chat room
builder.queryField('getLeagueMessages', (t) =>
  t.field({
    type: [LeagueChatMessage],
    args: {
      leagueId: t.arg.int({ required: true }),
      limit: t.arg.int({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      // Verify caller is a member of the league
      const membership = await context.db
        .select()
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, args.leagueId),
            eq(PublicSchema.leagueMembers.userId, context.user.id),
          ),
        )
        .limit(1);

      if (membership.length === 0) {
        throw new Error('Not a member of this league');
      }

      const query = context.db
        .select()
        .from(PublicSchema.leagueMessages)
        .where(eq(PublicSchema.leagueMessages.leagueId, args.leagueId))
        .orderBy(desc(PublicSchema.leagueMessages.timestamp));

      const results = args.limit ? await query.limit(args.limit) : await query;

      return results.map((msg) => ({
        id: msg.id,
        leagueId: msg.leagueId,
        userId: msg.userId,
        messageText: msg.messageText,
        timestamp: msg.timestamp ?? null,
        messageType: msg.messageType ?? 'text',
        metadata: msg.metadata ?? null,
      }));
    },
  }),
);

// Query: getDirectMessages — fetch the conversation thread between two users
builder.queryField('getDirectMessages', (t) =>
  t.field({
    type: [DirectMessage],
    args: {
      otherUserId: t.arg.int({ required: true }),
      limit: t.arg.int({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const selfId = context.user.id;
      const otherId = args.otherUserId;

      const query = context.db
        .select()
        .from(PublicSchema.directMessages)
        .where(
          or(
            and(
              eq(PublicSchema.directMessages.fromUserId, selfId),
              eq(PublicSchema.directMessages.toUserId, otherId),
            ),
            and(
              eq(PublicSchema.directMessages.fromUserId, otherId),
              eq(PublicSchema.directMessages.toUserId, selfId),
            ),
          ),
        )
        .orderBy(asc(PublicSchema.directMessages.createdAt));

      const results = args.limit ? await query.limit(args.limit) : await query;

      return results.map((msg) => ({
        id: msg.id,
        fromUserId: msg.fromUserId,
        toUserId: msg.toUserId,
        leagueId: msg.leagueId ?? null,
        messageText: msg.messageText,
        readAt:
          msg.readAt instanceof Date
            ? msg.readAt.toISOString()
            : (msg.readAt ?? null),
        deletedAt:
          msg.deletedAt instanceof Date
            ? msg.deletedAt.toISOString()
            : (msg.deletedAt ?? null),
        createdAt:
          msg.createdAt instanceof Date
            ? msg.createdAt.toISOString()
            : String(msg.createdAt),
        updatedAt:
          msg.updatedAt instanceof Date
            ? msg.updatedAt.toISOString()
            : String(msg.updatedAt),
      }));
    },
  }),
);

// ============================================================================
// MUTATIONS
// ============================================================================

// Mutation: sendMatchupMessage
builder.mutationField('sendMatchupMessage', (t) =>
  t.field({
    type: MatchupMessage,
    args: {
      matchupId: t.arg.int({ required: true }),
      message: t.arg.string({ required: true }),
      gifUrl: t.arg.string({ required: false }),
      replyToMessageId: t.arg.int({ required: false }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      // Get matchup to verify it exists and get leagueId
      const matchup = await context.db
        .select({ leagueId: PublicSchema.matchups.leagueId })
        .from(PublicSchema.matchups)
        .where(eq(PublicSchema.matchups.id, args.matchupId))
        .limit(1);

      if (!matchup[0]) {
        throw new Error('Matchup not found');
      }

      const results = await context.db
        .insert(PublicSchema.matchupMessages)
        .values({
          matchupId: args.matchupId,
          leagueId: matchup[0].leagueId,
          senderId: context.user.id,
          messageType: args.gifUrl ? 'gif' : 'text',
          message: args.message,
          gifUrl: args.gifUrl ?? null,
          metadata: {},
          containsProfanity: false, // TODO: Add profanity detection
          isFlagged: false,
          replyToMessageId: args.replyToMessageId ?? null,
        })
        .returning();

      return {
        ...results[0],
        metadata: results[0].metadata as Record<string, unknown>,
      };
    },
  }),
);

// Mutation: createTiebreakerRules
builder.mutationField('createTiebreakerRules', (t) =>
  t.field({
    type: TiebreakerRule,
    args: {
      leagueId: t.arg.int({ required: true }),
      primaryMethod: t.arg({ type: TiebreakerMethod, required: true }),
      secondaryMethod: t.arg({ type: TiebreakerMethod, required: false }),
      tertiaryMethod: t.arg({ type: TiebreakerMethod, required: false }),
      allowCommissionerOverride: t.arg.boolean({ required: false }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const results = await context.db
        .insert(PublicSchema.tiebreakerRules)
        .values({
          leagueId: args.leagueId,
          primaryMethod: args.primaryMethod,
          secondaryMethod: args.secondaryMethod ?? null,
          tertiaryMethod: args.tertiaryMethod ?? null,
          allowCommissionerOverride: args.allowCommissionerOverride ?? true,
          config: null,
        })
        .returning();

      return {
        ...results[0],
        config: results[0].config as Record<string, unknown> | null,
      };
    },
  }),
);

// Mutation: sendLeagueMessage
// Persists a league chat message and broadcasts a WebSocket notification to
// all connected league members.
builder.mutationField('sendLeagueMessage', (t) =>
  t.field({
    type: LeagueChatMessage,
    args: {
      leagueId: t.arg.int({ required: true }),
      messageText: t.arg.string({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const text = args.messageText.trim();
      if (text.length === 0) {
        throw new Error('Message cannot be empty');
      }
      if (text.length > 2000) {
        throw new Error('Message cannot exceed 2000 characters');
      }

      // Verify the caller is a member of the league
      const membership = await context.db
        .select()
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, args.leagueId),
            eq(PublicSchema.leagueMembers.userId, context.user.id),
          ),
        )
        .limit(1);

      if (membership.length === 0) {
        throw new Error('Not a member of this league');
      }

      // Persist the message
      const rows = await context.db
        .insert(PublicSchema.leagueMessages)
        .values({
          leagueId: args.leagueId,
          userId: context.user.id,
          messageText: text,
        })
        .returning();

      const msg = rows[0];

      // Dispatch WebSocket notification — MUST be awaited so the Lambda
      // execution context is not frozen before the API Gateway PostToConnection
      // calls complete.  Fire-and-forget caused silent notification loss.
      const notificationService = createNotificationService();
      if (notificationService) {
        try {
          await notificationService.notifyLeagueChatMessage(args.leagueId, {
            leagueId: args.leagueId,
            messageId: msg.id,
            senderId: context.user.id,
            senderUsername: context.user.username ?? `user_${context.user.id}`,
            messageText: text,
            timestamp: msg.timestamp ?? new Date().toISOString(),
          });
        } catch (err: unknown) {
          // Never let a notification failure block the mutation response
          LOGGER.warn('Failed to send league chat WS notification', { err });
        }
      }

      return {
        id: msg.id,
        leagueId: msg.leagueId,
        userId: msg.userId,
        messageText: msg.messageText,
        timestamp: msg.timestamp ?? null,
        messageType: msg.messageType ?? 'text',
        metadata: null,
      };
    },
  }),
);

// Mutation: sendDirectMessage
// Delivers a private message between two players, persists it to
// `direct_messages`, and pushes a WebSocket notification to the recipient's
// active connections.
builder.mutationField('sendDirectMessage', (t) =>
  t.field({
    type: DirectMessage,
    args: {
      toUserId: t.arg.int({ required: true }),
      messageText: t.arg.string({ required: true }),
      /** Optional: scope this DM to a shared league for context */
      leagueId: t.arg.int({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      if (args.toUserId === context.user.id) {
        throw new Error('Cannot send a direct message to yourself');
      }

      const text = args.messageText.trim();
      if (text.length === 0) {
        throw new Error('Message cannot be empty');
      }
      if (text.length > 2000) {
        throw new Error('Message cannot exceed 2000 characters');
      }

      // Persist the direct message
      const rows = await context.db
        .insert(PublicSchema.directMessages)
        .values({
          fromUserId: context.user.id,
          toUserId: args.toUserId,
          leagueId: args.leagueId ?? null,
          messageText: text,
        })
        .returning();

      const msg = rows[0];

      const toIso = (v: Date | string | null): string | null => {
        if (v === null || v === undefined) return null;
        return v instanceof Date ? v.toISOString() : String(v);
      };

      const createdAt =
        msg.createdAt instanceof Date
          ? msg.createdAt.toISOString()
          : String(msg.createdAt);

      // Dispatch WebSocket notification to the recipient's active connections
      const notificationService = createNotificationService();
      if (notificationService) {
        notificationService
          .notifyDirectMessage(args.toUserId, {
            messageId: msg.id,
            fromUserId: context.user.id,
            fromUsername: context.user.username ?? `user_${context.user.id}`,
            toUserId: args.toUserId,
            leagueId: msg.leagueId ?? null,
            messageText: text,
            createdAt,
          })
          .catch((err: unknown) => {
            LOGGER.warn('Failed to deliver DM WebSocket notification', { err });
          });
      }

      return {
        id: msg.id,
        fromUserId: msg.fromUserId,
        toUserId: msg.toUserId,
        leagueId: msg.leagueId ?? null,
        messageText: msg.messageText,
        readAt: toIso(msg.readAt),
        deletedAt: toIso(msg.deletedAt),
        createdAt,
        updatedAt:
          msg.updatedAt instanceof Date
            ? msg.updatedAt.toISOString()
            : String(msg.updatedAt),
      };
    },
  }),
);
