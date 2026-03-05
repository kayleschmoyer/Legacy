/**
 * Shared Notification Type Constants
 *
 * Single source of truth for WebSocket notification type strings.
 * Used by both the backend (WebSocketNotificationService in aws-utils)
 * and the client (WebSocketClient in websocket-client).
 *
 * The wire format uses UPPER_SNAKE_CASE as sent over the WebSocket.
 * The client format uses kebab-case as converted by WebSocketClient.handleMessage().
 *
 * Adding a new notification type? Add it to BOTH objects below,
 * then add the corresponding interface in:
 *   - lib/aws-utils/src/notification/WebSocketNotificationService.ts  (wire interface)
 *   - lib/websocket-client/src/types.ts                               (client interface)
 */

/**
 * Notification types as sent over the wire (UPPER_SNAKE_CASE).
 * Used by the backend when constructing notification payloads.
 */
export const WireNotificationType = {
  DRAFT_COMPLETED: 'DRAFT_COMPLETED',
  DRAFT_STARTED: 'DRAFT_STARTED',
  DRAFT_PICK_MADE: 'DRAFT_PICK_MADE',
  DRAFT_PICK_UNDONE: 'DRAFT_PICK_UNDONE',
  DRAFT_PAUSED: 'DRAFT_PAUSED',
  DRAFT_RESUMED: 'DRAFT_RESUMED',
  PLAYER_STATS_LOADING: 'PLAYER_STATS_LOADING',
  PLAYER_STATS_UPDATED: 'PLAYER_STATS_UPDATED',
  MATCHUP_STATS_COMPLETE: 'MATCHUP_STATS_COMPLETE',
  LEAGUE_CHAT_MESSAGE: 'LEAGUE_CHAT_MESSAGE',
  DIRECT_MESSAGE: 'DIRECT_MESSAGE',
  ROSTER_UPDATE: 'ROSTER_UPDATE',
  TRADE_OFFER: 'TRADE_OFFER',
  PLAYOFF_BRACKET_CREATED: 'PLAYOFF_BRACKET_CREATED',
  WEEK_ADVANCED: 'WEEK_ADVANCED',
  USER_JOINED: 'USER_JOINED',
  USER_LEFT: 'USER_LEFT',
  /** Sent to a newly connected client with the list of already-online users. */
  USER_LIST: 'USER_LIST',
} as const;

export type WireNotificationType =
  (typeof WireNotificationType)[keyof typeof WireNotificationType];

/**
 * Notification types as dispatched on the client (kebab-case).
 * The WebSocketClient converts wire types to this format before
 * dispatching to event handlers.
 *
 * Each key matches the corresponding key in WireNotificationType.
 */
export const ClientNotificationType = {
  DRAFT_COMPLETED: 'draft-completed',
  DRAFT_STARTED: 'draft-started',
  DRAFT_PICK_MADE: 'draft-pick-made',
  DRAFT_PICK_UNDONE: 'draft-pick-undone',
  DRAFT_PAUSED: 'draft-paused',
  DRAFT_RESUMED: 'draft-resumed',
  PLAYER_STATS_LOADING: 'player-stats-loading',
  PLAYER_STATS_UPDATED: 'player-stats-updated',
  MATCHUP_STATS_COMPLETE: 'matchup-stats-complete',
  LEAGUE_CHAT_MESSAGE: 'league-chat-message',
  DIRECT_MESSAGE: 'direct-message',
  ROSTER_UPDATE: 'roster-update',
  TRADE_OFFER: 'trade-offer',
  PLAYOFF_BRACKET_CREATED: 'playoff-bracket-created',
  WEEK_ADVANCED: 'week-advanced',
  USER_JOINED: 'user-joined',
  USER_LEFT: 'user-left',
  USER_LIST: 'user-list',
} as const;

export type ClientNotificationType =
  (typeof ClientNotificationType)[keyof typeof ClientNotificationType];

/**
 * Convert a wire-format notification type (UPPER_SNAKE_CASE) to
 * its client event name (kebab-case).
 *
 * This is the same transform applied by WebSocketClient.handleMessage().
 */
export function wireToClientEventName(wireType: string): string {
  return wireType.toLowerCase().replace(/_/g, '-');
}
