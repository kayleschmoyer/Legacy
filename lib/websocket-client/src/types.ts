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
  leagueId: number;
  selectionMethod: string;
  completedAt: string;
}

export interface DraftStartedNotification {
  type: typeof ClientNotificationType.DRAFT_STARTED;
  leagueId: number;
  draftId: number;
  draftOrder: string;
  teamCount: number;
  pickTimeLimitSeconds: number;
  currentPickDeadline: string;
  startedAt: string;
}

export interface DraftPickNotification {
  type: typeof ClientNotificationType.DRAFT_PICK_MADE;
  leagueId: number;
  draftId: number;
  pickId: number;
  teamId: number;
  playerId: number;
  round: number;
  pickNumber: number;
  overallPick: number;
  pickedAt: string;
  wasAutoPick: boolean;
  autoPickReason: string | null;
  currentPickDeadline: string | null;
  nextPick?: {
    teamId: number;
    round: number;
    pickNumber: number;
    overallPick: number;
  };
}

export interface DraftPausedNotification {
  type: typeof ClientNotificationType.DRAFT_PAUSED;
  leagueId: number;
  pausedAt: string;
}

export interface DraftPickUndoneNotification {
  type: typeof ClientNotificationType.DRAFT_PICK_UNDONE;
  leagueId: number;
  draftId: number;
  undonePickId: number;
  playerId: number;
  teamId: number;
  overallPick: number;
  newCurrentPick: number;
  newPickDeadline: string;
  undoneAt: string;
}

export interface DraftResumedNotification {
  type: typeof ClientNotificationType.DRAFT_RESUMED;
  leagueId: number;
  currentPickDeadline: string;
  resumedAt: string;
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

export type NotificationData =
  | DraftCompletedNotification
  | DraftStartedNotification
  | DraftPickNotification
  | DraftPickUndoneNotification
  | DraftPausedNotification
  | DraftResumedNotification
  | PlayerStatsLoadingNotification
  | PlayerStatsUpdatedNotification
  | MatchupStatsCompleteNotification
  | LeagueChatMessageNotification
  | DirectMessageNotification
  | RosterUpdateNotification
  | TradeOfferNotification
  | PlayoffBracketCreatedNotification
  | WeekAdvancedNotification
  | UserJoinedNotification
  | UserLeftNotification
  | UserListNotification
  | SubscriptionUpdatedNotification;

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
  /** View context for notifications */
  viewContext?: 'general' | 'league' | 'matchup' | 'roster' | 'chat' | 'dm';
  /** Auto-connect on instantiation */
  autoConnect?: boolean;
  /** Enable auto-reconnect on disconnect */
  reconnect?: boolean;
  /** Maximum reconnection attempts (default: Infinity) */
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
  viewContext: 'general' | 'league' | 'matchup' | 'roster' | 'chat' | 'dm';
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
