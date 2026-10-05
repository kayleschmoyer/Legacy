/**
 * WebSocket Client Types
 * Framework-agnostic type definitions for WebSocket connections
 */

import { ClientNotificationType } from '@legacy-sports/utils';

/**
 * Notification data for different event types
 */
export interface DraftCompletedNotification {
  type: typeof ClientNotificationType.DRAFT_COMPLETED;
  /** `null` for a mock draft, which has no league (LS-10076). */
  leagueId: number | null;
  /**
   * `null` only for an automated-draft SQS message without a draftId; that
   * event is delivered on the league channel alone.
   */
  draftId: number | null;
  selectionMethod: string;
  completedAt: string;
}

export interface DraftStartedNotification {
  type: typeof ClientNotificationType.DRAFT_STARTED;
  /** `null` for a mock draft, which has no league (LS-10076). */
  leagueId: number | null;
  draftId: number;
  draftOrder: string;
  teamCount: number;
  pickTimeLimitSeconds: number;
  currentPickDeadline: string;
  startedAt: string;
}

export interface DraftPickNotification {
  type: typeof ClientNotificationType.DRAFT_PICK_MADE;
  /** `null` for a mock draft, which has no league (LS-10076). */
  leagueId: number | null;
  draftId: number;
  pickId: number;
  /** `null` for a mock-draft seat: key on `participantId` (LS-10076). */
  teamId: number | null;
  /** The seat that made the pick. Absent from servers before LS-10076. */
  participantId?: number;
  playerId: number;
  round: number;
  pickNumber: number;
  overallPick: number;
  pickedAt: string;
  wasAutoPick: boolean;
  autoPickReason: string | null;
  currentPickDeadline: string | null;
  nextPick?: {
    teamId: number | null;
    participantId?: number;
    round: number;
    pickNumber: number;
    overallPick: number;
  };
}

export interface DraftPausedNotification {
  type: typeof ClientNotificationType.DRAFT_PAUSED;
  /** `null` for a mock draft, which has no league (LS-10076). */
  leagueId: number | null;
  draftId: number;
  pausedAt: string;
}

export interface DraftPickUndoneNotification {
  type: typeof ClientNotificationType.DRAFT_PICK_UNDONE;
  /** `null` for a mock draft, which has no league (LS-10076). */
  leagueId: number | null;
  draftId: number;
  undonePickId: number;
  playerId: number;
  teamId: number | null;
  overallPick: number;
  newCurrentPick: number;
  newPickDeadline: string;
  undoneAt: string;
}

export interface DraftResumedNotification {
  type: typeof ClientNotificationType.DRAFT_RESUMED;
  /** `null` for a mock draft, which has no league (LS-10076). */
  leagueId: number | null;
  draftId: number;
  currentPickDeadline: string;
  resumedAt: string;
}

/**
 * A mock draft's lobby changed (LS-10076). The payload is thin on purpose —
 * refetch `draftRoom` for the new seat list.
 */
export interface DraftLobbyUpdatedNotification {
  type: typeof ClientNotificationType.DRAFT_LOBBY_UPDATED;
  draftId: number;
  reason:
    | 'seat-claimed'
    | 'seat-freed'
    | 'seat-kicked'
    | 'settings'
    | 'host'
    | 'expired'
    | 'invite';
  filledSeats: number;
  totalSeats: number;
  updatedAt: string;
}

/** A chat message in a mock draft's own chat (LS-10076). */
export interface DraftChatMessageNotification {
  type: typeof ClientNotificationType.DRAFT_CHAT_MESSAGE;
  draftId: number;
  messageId: number;
  senderId: number;
  senderUsername: string;
  messageText: string;
  gifUrl: string | null;
  timestamp: string;
}

export interface PlayerStatsLoadingNotification {
  type: typeof ClientNotificationType.PLAYER_STATS_LOADING;
  leagueId: number;
  status: 'loading' | 'complete' | 'error';
  progress?: {
    current: number;
    total: number;
  };
}

export interface PlayerStatsUpdatedNotification {
  type: typeof ClientNotificationType.PLAYER_STATS_UPDATED;
  leagueId: number;
  playerId: number;
  stats: Record<string, unknown>;
}

export interface MatchupStatsCompleteNotification {
  type: typeof ClientNotificationType.MATCHUP_STATS_COMPLETE;
  leagueId: number;
  matchupId: number;
  completedAt: string;
}

/**
 * Sent whenever the scoring system writes a matchup's score, including
 * single-player stat corrections outside of batch completion (LS-6396).
 */
export interface MatchupScoreUpdatedNotification {
  type: typeof ClientNotificationType.MATCHUP_SCORE_UPDATED;
  leagueId: number;
  matchupId: number;
  team1Score: number | null;
  team2Score: number | null;
  updatedAt: string;
}

/**
 * New chat message posted to a league chat room.
 * Broadcast to all WebSocket connections scoped to `leagueId`.
 */
export interface LeagueChatMessageNotification {
  type: typeof ClientNotificationType.LEAGUE_CHAT_MESSAGE;
  leagueId: number;
  messageId: number;
  senderId: number;
  senderUsername: string;
  messageText: string;
  /** ISO-8601 timestamp */
  timestamp: string;
  /** Discriminates rendering: 'text' | 'gif' | 'trade' | 'waiver' | 'draft_settings' */
  messageType?: string;
  /** GIF URL for gif-type messages */
  gifUrl?: string | null;
  /** Parsed JSON metadata for card rendering */
  metadata?: Record<string, unknown> | null;
}

/**
 * A direct message delivered to a specific recipient.
 * Pushed only to the recipient's active WebSocket connections.
 */
export interface DirectMessageNotification {
  type: typeof ClientNotificationType.DIRECT_MESSAGE;
  messageId: number;
  fromUserId: number;
  fromUsername: string;
  toUserId: number;
  /** Optional league context in which the DM was sent */
  leagueId: number | null;
  messageText: string;
  /** ISO-8601 creation timestamp */
  createdAt: string;
}

export interface RosterUpdateNotification {
  type: typeof ClientNotificationType.ROSTER_UPDATE;
  leagueId: number;
  updatedAt: string;
}

/**
 * A new trade offer sent to the receiving team's manager.
 * Pushed only to the recipient's active WebSocket connections.
 */
export interface TradeOfferNotification {
  type: typeof ClientNotificationType.TRADE_OFFER;
  leagueId: number;
  tradeOfferId: number;
  proposingTeamId: number;
  receivingTeamId: number;
  proposingTeamName: string;
  receivingTeamName: string;
  playerCount: number;
  /** ISO-8601 */
  proposedAt: string;
}

export interface PlayoffBracketCreatedNotification {
  type: typeof ClientNotificationType.PLAYOFF_BRACKET_CREATED;
  leagueId: number;
  bracketId: number;
  season: number;
  format: string;
  startWeek: number;
  /** ISO-8601 */
  createdAt: string;
}

export interface WeekAdvancedNotification {
  type: typeof ClientNotificationType.WEEK_ADVANCED;
  leagueId: number;
  previousWeek: number;
  newWeek: number;
  /** ISO-8601 */
  advancedAt: string;
}

/**
 * Broadcast to all connections in a league when a user connects.
 * Also received by the connecting user via the USER_LIST notification.
 */
export interface UserJoinedNotification {
  type: typeof ClientNotificationType.USER_JOINED;
  leagueId: number;
  userId: number;
  username: string;
}

/**
 * Broadcast to all connections in a league when a user disconnects.
 */
export interface UserLeftNotification {
  type: typeof ClientNotificationType.USER_LEFT;
  leagueId: number;
  userId: number;
}

/**
 * Sent only to the newly connected client to bootstrap their presence state
 * with the list of users already connected to this league.
 */
export interface UserListNotification {
  type: typeof ClientNotificationType.USER_LIST;
  leagueId: number;
  users: Array<{ userId: number; username: string }>;
}

/**
 * Sent to a specific user when their subscription tier or status changes.
 * Delivered only to the affected user's active WebSocket connections.
 */
export interface SubscriptionUpdatedNotification {
  type: typeof ClientNotificationType.SUBSCRIPTION_UPDATED;
  tier: 'free' | 'premium';
  status: string;
}

/**
 * Sent to a user 3 days before their free trial ends (Stripe trial_will_end event).
 * Delivered only to the affected user's active WebSocket connections.
 */
export interface TrialWillEndNotification {
  type: typeof ClientNotificationType.TRIAL_WILL_END;
  /** ISO-8601 timestamp when the trial will end. */
  trialEndsAt: string;
}

/**
 * A new in-app notification was logged to notification_history for this user.
 * Pushed only to the recipient's active WebSocket connections. Drives the
 * notification bell badge so the unread count updates without polling.
 *
 * **Payload intentionally omits user-facing content** (title / body).
 * Consumers should refetch the rendered row from GraphQL on receipt; the
 * WebSocket transport never carries free-form text that would become a
 * new XSS surface.
 */
export interface NotificationReceivedNotification {
  type: typeof ClientNotificationType.NOTIFICATION_RECEIVED;
  /** notification_history row id, or null if the history insert was non-fatal-failed. */
  historyId: number | null;
  /** Discriminator for the notification kind (e.g. `matchup_started`). Not user-rendered. */
  notificationType: string;
  /** ISO-8601 receipt timestamp. */
  receivedAt: string;
}

export type NotificationData =
  | DraftCompletedNotification
  | DraftStartedNotification
  | DraftPickNotification
  | DraftPickUndoneNotification
  | DraftPausedNotification
  | DraftResumedNotification
  | DraftLobbyUpdatedNotification
  | DraftChatMessageNotification
  | PlayerStatsLoadingNotification
  | PlayerStatsUpdatedNotification
  | MatchupStatsCompleteNotification
  | MatchupScoreUpdatedNotification
  | LeagueChatMessageNotification
  | DirectMessageNotification
  | RosterUpdateNotification
  | TradeOfferNotification
  | PlayoffBracketCreatedNotification
  | WeekAdvancedNotification
  | UserJoinedNotification
  | UserLeftNotification
  | UserListNotification
  | SubscriptionUpdatedNotification
  | TrialWillEndNotification
  | NotificationReceivedNotification;

/**
 * WebSocket message structure
 */
export interface WebSocketMessage {
  type: string;
  leagueId?: number;
  matchupId?: number;
  status?: string;
  progress?: {
    current: number;
    total: number;
  };
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Connection state
 */
export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

/**
 * What a connection is looking at. `'draft'` / `'draft-preview'` put the
 * connection on a draft's own channel (keyed by `draftId`, LS-10075); a
 * preview connection receives lobby events only. Draft-room events (picks,
 * undo, pause/resume, draft chat) are sent on the draft channel only; a league
 * connection receives just DRAFT_STARTED and DRAFT_COMPLETED (LS-10080).
 */
export type WebSocketViewContext =
  | 'general'
  | 'league'
  | 'matchup'
  | 'roster'
  | 'chat'
  | 'dm'
  | 'draft'
  | 'draft-preview';

/**
 * WebSocket client configuration options
 */
export interface WebSocketClientOptions {
  /** WebSocket URL */
  url: string;
  /** Authentication token */
  token?: string;
  /** League ID for context */
  leagueId?: number;
  /** Matchup ID for context */
  matchupId?: number;
  /**
   * Draft ID for a draft-channel connection (LS-10075). Exclusive of
   * `leagueId`/`matchupId`; pair with a `'draft'` or `'draft-preview'`
   * viewContext.
   */
  draftId?: number;
  /** View context for notifications */
  viewContext?: WebSocketViewContext;
  /** Auto-connect on instantiation */
  autoConnect?: boolean;
  /** Enable auto-reconnect on disconnect */
  reconnect?: boolean;
  /** Maximum reconnection attempts (default: 10 — see LS-8881) */
  maxReconnectAttempts?: number;
  /** Initial reconnection delay in ms (default: 1000) */
  reconnectDelay?: number;
  /** Maximum reconnection delay in ms (default: 30000) */
  maxReconnectDelay?: number;
}

/**
 * Internal type with required fields for WebSocketClient
 * Users can pass optional fields, but internally we need them set
 */
export interface RequiredWebSocketClientOptions {
  url: string;
  token?: string;
  leagueId?: number;
  matchupId?: number;
  draftId?: number;
  viewContext: WebSocketViewContext;
  autoConnect: boolean;
  reconnect: boolean;
  maxReconnectAttempts: number;
  reconnectDelay: number;
  maxReconnectDelay: number;
}

/**
 * Event handler function type
 */
export type EventHandler<T = WebSocketMessage> = (data: T) => void;

/**
 * Unsubscribe function returned by event listeners
 */
export type UnsubscribeFn = () => void;
