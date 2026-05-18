import { useCallback, useEffect, useRef, useState } from 'react';
import { LOGGER } from '@legacy-sports/logging';
import {
  type DraftCompletedNotification,
  type DraftPausedNotification,
  type DraftPickNotification,
  type DraftPickUndoneNotification,
  type DraftResumedNotification,
  type DraftStartedNotification,
  type LeagueChatMessageNotification,
  type MatchupStatsCompleteNotification,
  type NotificationData,
  type NotificationReceivedNotification,
  type PlayerStatsLoadingNotification,
  type PlayerStatsUpdatedNotification,
  type RosterUpdateNotification,
  type UserJoinedNotification,
  type UserLeftNotification,
  type UserListNotification,
  WebSocketClient,
  type WebSocketMessage,
} from '@legacy-sports/websocket-client';
import { ClientNotificationType } from '@legacy-sports/utils';

/**
 * Store a callback in a ref so that event subscriptions always call the
 * latest version without needing the callback in a dependency array.
 * This prevents unnecessary WebSocket client teardown/recreation when
 * handler references change (e.g. due to upstream state like enrichedPlayers).
 */
function useLatestRef<T>(value: T): React.RefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

/**
 * SECURITY NOTE: Token Handling
 *
 * This hook passes JWT tokens in the WebSocket connection URL query string.
 *
 * Tradeoffs:
 * - Browser WebSocket API doesn't support custom headers during handshake
 * - Query string tokens work across all client types (web, mobile, CLI)
 * - Tokens may appear in API Gateway access logs if enabled
 *
 * Mitigations:
 * - Tokens are redacted in application debug logs
 * - API Gateway access logs are DISABLED (see terraform/websocket.tf)
 * - JWT tokens are short-lived (expiration enforced by jwt-manager)
 * - Tokens are passed via Authorization header when supported (CLI/native)
 *
 * Alternative considered: Sec-WebSocket-Protocol header
 * - Not widely supported across all WebSocket client implementations
 * - Would require custom protocol negotiation
 * - Query string approach is more universal
 */

// Re-export types for backward compatibility
export type {
  DraftCompletedNotification,
  DraftPausedNotification,
  DraftPickNotification,
  DraftPickUndoneNotification,
  DraftResumedNotification,
  DraftStartedNotification,
  LeagueChatMessageNotification,
  NotificationReceivedNotification,
  PlayerStatsLoadingNotification,
  PlayerStatsUpdatedNotification,
  MatchupStatsCompleteNotification,
  RosterUpdateNotification,
  UserJoinedNotification,
  UserLeftNotification,
  UserListNotification,
  WebSocketMessage,
};

interface UseWebSocketOptions {
  url?: string;
  token?: string;
  leagueId?: number;
  matchupId?: number;
  viewContext?: 'general' | 'league' | 'matchup' | 'roster';
  autoConnect?: boolean;
  onDraftStarted?: (notification: DraftStartedNotification) => void;
  onDraftCompleted?: (notification: DraftCompletedNotification) => void;
  onDraftPickMade?: (notification: DraftPickNotification) => void;
  onDraftPickUndone?: (notification: DraftPickUndoneNotification) => void;
  onDraftPaused?: (notification: DraftPausedNotification) => void;
  onDraftResumed?: (notification: DraftResumedNotification) => void;
  onPlayerStatsLoading?: (notification: PlayerStatsLoadingNotification) => void;
  onPlayerStatsUpdated?: (notification: PlayerStatsUpdatedNotification) => void;
  onMatchupStatsComplete?: (
    notification: MatchupStatsCompleteNotification,
  ) => void;
  onRosterUpdate?: (notification: RosterUpdateNotification) => void;
  onLeagueChatMessage?: (notification: LeagueChatMessageNotification) => void;
  onNotificationReceived?: (
    notification: NotificationReceivedNotification,
  ) => void;
  onUserJoined?: (notification: UserJoinedNotification) => void;
  onUserLeft?: (notification: UserLeftNotification) => void;
  onUserList?: (notification: UserListNotification) => void;
  onMessage?: (message: WebSocketMessage) => void;
  onError?: (error: Error) => void;
}

/**
 * Hook for managing WebSocket connections for real-time notifications
 *
 * This hook wraps the `WebSocketClient` class to provide a React-friendly API
 * with automatic lifecycle management and state synchronization.
 *
 * @example
 * ```tsx
 * const { connected, error } = useWebSocket({
 *   leagueId,
 *   onDraftCompleted: (notification) => {
 *     toast.success(`Draft completed for league ${notification.leagueId}`);
 *     refetch(); // Refetch league data
 *   }
 * });
 * ```
 */
export function useWebSocket({
  url,
  token,
  leagueId,
  matchupId,
  viewContext = 'general',
  autoConnect = true,
  onDraftStarted,
  onDraftCompleted,
  onDraftPickMade,
  onDraftPickUndone,
  onDraftPaused,
  onDraftResumed,
  onPlayerStatsLoading,
  onPlayerStatsUpdated,
  onMatchupStatsComplete,
  onRosterUpdate,
  onLeagueChatMessage,
  onNotificationReceived,
  onUserJoined,
  onUserLeft,
  onUserList,
  onMessage,
  onError,
}: UseWebSocketOptions = {}) {
  const clientRef = useRef<WebSocketClient | null>(null);
  const hasLoggedInit = useRef(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Store all callbacks in refs so the main effect doesn't depend on them.
  // This prevents tearing down and recreating the WebSocket client every
  // time a handler's closure captures new state (e.g. enrichedPlayers).
  const onDraftStartedRef = useLatestRef(onDraftStarted);
  const onDraftCompletedRef = useLatestRef(onDraftCompleted);
  const onDraftPickMadeRef = useLatestRef(onDraftPickMade);
  const onDraftPickUndoneRef = useLatestRef(onDraftPickUndone);
  const onDraftPausedRef = useLatestRef(onDraftPaused);
  const onDraftResumedRef = useLatestRef(onDraftResumed);
  const onPlayerStatsLoadingRef = useLatestRef(onPlayerStatsLoading);
  const onPlayerStatsUpdatedRef = useLatestRef(onPlayerStatsUpdated);
  const onMatchupStatsCompleteRef = useLatestRef(onMatchupStatsComplete);
  const onRosterUpdateRef = useLatestRef(onRosterUpdate);
  const onLeagueChatMessageRef = useLatestRef(onLeagueChatMessage);
  const onNotificationReceivedRef = useLatestRef(onNotificationReceived);
  const onUserJoinedRef = useLatestRef(onUserJoined);
  const onUserLeftRef = useLatestRef(onUserLeft);
  const onUserListRef = useLatestRef(onUserList);
  const onMessageRef = useLatestRef(onMessage);
  const onErrorRef = useLatestRef(onError);

  // Get WebSocket URL from environment or passed prop.
  // In Vite (web), callers should pass `url={import.meta.env.VITE_WEBSOCKET_URL}`.
  // In Node/CLI contexts this falls back to process.env.VITE_WEBSOCKET_URL.
  const wsUrl = url || process.env.VITE_WEBSOCKET_URL;

  // Log connection parameters once on mount
  useEffect(() => {
    if (hasLoggedInit.current) return;
    hasLoggedInit.current = true;
    LOGGER.info('[useWebSocket] init', {
      url: wsUrl ? `${wsUrl.substring(0, 30)}...` : 'NOT SET',
      hasToken: !!token,
      leagueId,
      matchupId,
      viewContext,
      autoConnect,
    });
  }, [wsUrl, token, leagueId, matchupId, viewContext, autoConnect]);

  const connect = useCallback(() => {
    if (!wsUrl) {
      LOGGER.warn(
        '[useWebSocket] connect failed: WebSocket URL not configured',
      );
      setError('WebSocket URL not configured');
      return;
    }

    if (!token) {
      LOGGER.warn(
        '[useWebSocket] connect deferred: no auth token available yet',
      );
      return;
    }

    if (clientRef.current) {
      clientRef.current.connect();
    }
  }, [wsUrl, token]);

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect();
    }
  }, []);

  const sendMessage = useCallback((data: unknown) => {
    if (clientRef.current) {
      clientRef.current.send(data as Record<string, unknown>);
    }
  }, []);

  const updateContext = useCallback(
    (newContext: {
      matchupId?: number;
      leagueId?: number;
      viewContext?: 'general' | 'league' | 'matchup' | 'roster';
    }) => {
      if (clientRef.current) {
        clientRef.current.updateContext(newContext);
      }
    },
    [],
  );

  // Create and manage WebSocketClient
  useEffect(() => {
    if (!wsUrl) {
      LOGGER.warn(
        '[useWebSocket] useEffect: no wsUrl, skipping client creation',
      );
      setError('WebSocket URL not configured');
      return;
    }

    if (!token) {
      LOGGER.warn(
        '[useWebSocket] useEffect: no auth token, deferring client creation',
      );
      return;
    }

    LOGGER.info('[useWebSocket] creating WebSocketClient', {
      url: `${wsUrl.substring(0, 30)}...`,
      hasToken: !!token,
      leagueId,
      viewContext,
      autoConnect,
    });

    // Create client with autoConnect=false — we defer connection to avoid
    // React Strict Mode double-invoke creating a WebSocket that gets
    // immediately closed ("closed before the connection is established").
    const client = new WebSocketClient({
      url: wsUrl,
      token,
      leagueId,
      matchupId,
      viewContext,
      autoConnect: false,
    });

    clientRef.current = client;

    // Defer connection to next microtask so Strict Mode cleanup can cancel it
    let cancelled = false;
    if (autoConnect) {
      void Promise.resolve().then(() => {
        if (!cancelled) {
          client.connect();
        }
      });
    }

    // Set up event handlers
    let wasConnected = false;

    const unsubscribeConnected = client.on('connected', () => {
      if (wasConnected) {
        LOGGER.info(
          '[useWebSocket] reconnected ✓',
          viewContext,
          'leagueId:',
          leagueId,
        );
      } else {
        LOGGER.info(
          '[useWebSocket] connected ✓',
          viewContext,
          'leagueId:',
          leagueId,
        );
      }
      wasConnected = true;
      setConnected(true);
      setError(null);
    });

    const unsubscribeDisconnected = client.on('disconnected', () => {
      if (wasConnected) {
        LOGGER.warn(
          '[useWebSocket] connection dropped — auto-reconnecting...',
          viewContext,
          'leagueId:',
          leagueId,
        );
      } else {
        LOGGER.info(
          '[useWebSocket] disconnected',
          viewContext,
          'leagueId:',
          leagueId,
        );
      }
      setConnected(false);
    });

    const unsubscribeError = client.on('error', (err) => {
      LOGGER.warn(
        '[useWebSocket] error:',
        err.message,
        '(will auto-reconnect)',
      );
      setError(err.message);
      onErrorRef.current?.(err);
    });

    // Subscribe to all notification types via refs so the subscriptions
    // are stable — handlers always call through the latest ref.
    const unsubscribeMessage = client.on('message', (msg: WebSocketMessage) => {
      onMessageRef.current?.(msg);
    });

    // Individual notification subscriptions — each callback is type-safe
    // via an explicit narrowing cast from NotificationData.
    const unsubscribeNotifications = [
      client.on(
        ClientNotificationType.DRAFT_COMPLETED,
        (n: NotificationData) => {
          onDraftCompletedRef.current?.(n as DraftCompletedNotification);
        },
      ),
      client.on(ClientNotificationType.DRAFT_STARTED, (n: NotificationData) => {
        onDraftStartedRef.current?.(n as DraftStartedNotification);
      }),
      client.on(
        ClientNotificationType.DRAFT_PICK_MADE,
        (n: NotificationData) => {
          onDraftPickMadeRef.current?.(n as DraftPickNotification);
        },
      ),
      client.on(
        ClientNotificationType.DRAFT_PICK_UNDONE,
        (n: NotificationData) => {
          LOGGER.info('[useWebSocket] received draft-pick-undone', n);
          onDraftPickUndoneRef.current?.(n as DraftPickUndoneNotification);
        },
      ),
      client.on(ClientNotificationType.DRAFT_PAUSED, (n: NotificationData) => {
        onDraftPausedRef.current?.(n as DraftPausedNotification);
      }),
      client.on(ClientNotificationType.DRAFT_RESUMED, (n: NotificationData) => {
        onDraftResumedRef.current?.(n as DraftResumedNotification);
      }),
      client.on(
        ClientNotificationType.PLAYER_STATS_LOADING,
        (n: NotificationData) => {
          onPlayerStatsLoadingRef.current?.(
            n as PlayerStatsLoadingNotification,
          );
        },
      ),
      client.on(
        ClientNotificationType.PLAYER_STATS_UPDATED,
        (n: NotificationData) => {
          onPlayerStatsUpdatedRef.current?.(
            n as PlayerStatsUpdatedNotification,
          );
        },
      ),
      client.on(
        ClientNotificationType.MATCHUP_STATS_COMPLETE,
        (n: NotificationData) => {
          LOGGER.info('[useWebSocket] received matchup-stats-complete', n);
          onMatchupStatsCompleteRef.current?.(
            n as MatchupStatsCompleteNotification,
          );
        },
      ),
      client.on(ClientNotificationType.ROSTER_UPDATE, (n: NotificationData) => {
        LOGGER.info('[useWebSocket] received roster-update', n);
        onRosterUpdateRef.current?.(n as RosterUpdateNotification);
      }),
      client.on(
        ClientNotificationType.LEAGUE_CHAT_MESSAGE,
        (n: NotificationData) => {
          LOGGER.info('[useWebSocket] received league-chat-message', n);
          onLeagueChatMessageRef.current?.(n as LeagueChatMessageNotification);
        },
      ),
      client.on(
        ClientNotificationType.NOTIFICATION_RECEIVED,
        (n: NotificationData) => {
          LOGGER.info('[useWebSocket] received notification-received', n);
          onNotificationReceivedRef.current?.(
            n as NotificationReceivedNotification,
          );
        },
      ),
      client.on(ClientNotificationType.USER_JOINED, (n: NotificationData) => {
        LOGGER.info('[useWebSocket] received user-joined', n);
        onUserJoinedRef.current?.(n as UserJoinedNotification);
      }),
      client.on(ClientNotificationType.USER_LEFT, (n: NotificationData) => {
        LOGGER.info('[useWebSocket] received user-left', n);
        onUserLeftRef.current?.(n as UserLeftNotification);
      }),
      client.on(ClientNotificationType.USER_LIST, (n: NotificationData) => {
        LOGGER.info('[useWebSocket] received user-list', n);
        onUserListRef.current?.(n as UserListNotification);
      }),
    ];

    // Cleanup on unmount
    return () => {
      cancelled = true;
      unsubscribeConnected();
      unsubscribeDisconnected();
      unsubscribeError();
      unsubscribeMessage();
      unsubscribeNotifications.forEach((unsub) => unsub());
      client.dispose();
    };
    // Only reconnect when connection parameters change — NOT when callbacks
    // change.  Callbacks are accessed via refs (stable identity from useRef)
    // so the subscriptions above always invoke the latest version without
    // tearing down the socket.  Refs are included in deps for linter
    // completeness but never trigger re-runs.
  }, [
    wsUrl,
    token,
    leagueId,
    matchupId,
    viewContext,
    autoConnect,
    onDraftStartedRef,
    onDraftCompletedRef,
    onDraftPickMadeRef,
    onDraftPickUndoneRef,
    onDraftPausedRef,
    onDraftResumedRef,
    onPlayerStatsLoadingRef,
    onPlayerStatsUpdatedRef,
    onMatchupStatsCompleteRef,
    onRosterUpdateRef,
    onLeagueChatMessageRef,
    onNotificationReceivedRef,
    onUserJoinedRef,
    onUserLeftRef,
    onUserListRef,
    onMessageRef,
    onErrorRef,
  ]);

  return {
    connected,
    error,
    connect,
    disconnect,
    sendMessage,
    updateContext,
  };
}
