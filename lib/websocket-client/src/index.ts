/**
 * @legacy-sports/websocket-client
 *
 * Framework-agnostic WebSocket client for real-time notifications
 * Works in browsers, React Native, and Node.js
 */

// Import polyfill first to ensure WebSocket is available in Node.js
import './polyfill';

export { WebSocketClient } from './WebSocketClient';
export type {
  WebSocketClientOptions,
  WebSocketViewContext,
  WebSocketMessage,
  ConnectionState,
  EventHandler,
  UnsubscribeFn,
  NotificationData,
  DraftCompletedNotification,
  DraftStartedNotification,
  DraftPickNotification,
  DraftPickUndoneNotification,
  DraftPausedNotification,
  LeagueDeletedNotification,
  DraftResumedNotification,
  PlayerStatsLoadingNotification,
  PlayerStatsUpdatedNotification,
  MatchupStatsCompleteNotification,
  MatchupScoreUpdatedNotification,
  LeagueChatMessageNotification,
  DirectMessageNotification,
  RosterUpdateNotification,
  TradeOfferNotification,
  UserJoinedNotification,
  UserLeftNotification,
  UserListNotification,
  SubscriptionUpdatedNotification,
  NotificationReceivedNotification,
} from './types';
