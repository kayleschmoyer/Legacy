/**
 * WebSocket Client Types
 * Framework-agnostic type definitions for WebSocket connections
 */

/**
 * Notification data for different event types
 */
export interface DraftCompletedNotification {
  type: 'draft-complete';
  leagueId: number;
  draftType: string;
  completedAt: string;
}

export interface PlayerStatsLoadingNotification {
  type: 'player-stats-loading';
  leagueId: number;
  status: 'loading' | 'complete' | 'error';
  progress?: {
    current: number;
    total: number;
  };
}

export interface PlayerStatsUpdatedNotification {
  type: 'player-stats-updated';
  leagueId: number;
  playerId: number;
  stats: Record<string, unknown>;
}

export interface MatchupStatsCompleteNotification {
  type: 'matchup-stats-complete';
  leagueId: number;
  matchupId: number;
  completedAt: string;
}

export type NotificationData =
  | DraftCompletedNotification
  | PlayerStatsLoadingNotification
  | PlayerStatsUpdatedNotification
  | MatchupStatsCompleteNotification;

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
  viewContext?: 'general' | 'league' | 'matchup' | 'roster';
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
  viewContext: 'general' | 'league' | 'matchup' | 'roster';
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
