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
  WebSocketMessage,
  ConnectionState,
  EventHandler,
  UnsubscribeFn,
  NotificationData,
  DraftCompletedNotification,
  DraftStartedNotification,
  DraftPickNotification,
  DraftPausedNotification,
  DraftResumedNotification,
  PlayerStatsLoadingNotification,
  PlayerStatsUpdatedNotification,
  MatchupStatsCompleteNotification,
  LeagueChatMessageNotification,
  DirectMessageNotification,
  RosterUpdateNotification,
} from './types';
