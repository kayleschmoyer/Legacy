import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type DraftCompletedNotification,
  type DraftPickNotification,
  type DraftStartedNotification,
  type LeagueChatMessageNotification,
  type MatchupStatsCompleteNotification,
  type NotificationData,
  type PlayerStatsLoadingNotification,
  type PlayerStatsUpdatedNotification,
  type RosterUpdateNotification,
  WebSocketClient,
  type WebSocketMessage,
} from '@legacy-sports/websocket-client';
import { ClientNotificationType } from '@legacy-sports/utils/notification-types';

// Noop function for optional callbacks
const noop = () => {
  // Intentionally empty - used as fallback unsubscribe function
};

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
  DraftPickNotification,
  DraftStartedNotification,
  LeagueChatMessageNotification,
  PlayerStatsLoadingNotification,
  PlayerStatsUpdatedNotification,
  MatchupStatsCompleteNotification,
  RosterUpdateNotification,
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
  onPlayerStatsLoading?: (notification: PlayerStatsLoadingNotification) => void;
  onPlayerStatsUpdated?: (notification: PlayerStatsUpdatedNotification) => void;
  onMatchupStatsComplete?: (
    notification: MatchupStatsCompleteNotification,
  ) => void;
  onRosterUpdate?: (notification: RosterUpdateNotification) => void;
  onLeagueChatMessage?: (notification: LeagueChatMessageNotification) => void;
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
  onPlayerStatsLoading,
  onPlayerStatsUpdated,
  onMatchupStatsComplete,
  onRosterUpdate,
  onLeagueChatMessage,
  onMessage,
  onError,
}: UseWebSocketOptions = {}) {
  const clientRef = useRef<WebSocketClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get WebSocket URL from environment or passed prop
  const wsUrl = url || process.env.NX_WEBSOCKET_URL;

  // Log connection parameters on mount for debugging
  useEffect(() => {
    console.log('[useWebSocket] init', {
      url: wsUrl ? `${wsUrl.substring(0, 30)}...` : 'NOT SET',
      hasToken: !!token,
      leagueId,
      matchupId,
      viewContext,
      autoConnect,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = useCallback(() => {
    if (!wsUrl) {
      console.warn(
        '[useWebSocket] connect failed: WebSocket URL not configured',
      );
      setError('WebSocket URL not configured');
      return;
    }

    if (clientRef.current) {
      clientRef.current.connect();
    }
  }, [wsUrl]);

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
      console.warn(
        '[useWebSocket] useEffect: no wsUrl, skipping client creation',
      );
      setError('WebSocket URL not configured');
      return;
    }

    console.log('[useWebSocket] creating WebSocketClient', {
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
        console.log(
          '[useWebSocket] reconnected ✓',
          viewContext,
          'leagueId:',
          leagueId,
        );
      } else {
        console.log(
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
        console.warn(
          '[useWebSocket] connection dropped — auto-reconnecting...',
          viewContext,
          'leagueId:',
          leagueId,
        );
      } else {
        console.log(
          '[useWebSocket] disconnected',
          viewContext,
          'leagueId:',
          leagueId,
        );
      }
      setConnected(false);
    });

    const unsubscribeError = client.on('error', (err) => {
      console.error(
        '[useWebSocket] error:',
        err.message,
        '(will auto-reconnect)',
      );
      setError(err.message);
      onError?.(err);
    });

    const unsubscribeMessage = onMessage
      ? client.on('message', onMessage)
      : noop;

    const unsubscribeDraftCompleted = onDraftCompleted
      ? client.on(
          ClientNotificationType.DRAFT_COMPLETED,
          (notification: NotificationData) => {
            onDraftCompleted(notification as DraftCompletedNotification);
          },
        )
      : noop;

    const unsubscribeDraftStarted = onDraftStarted
      ? client.on(
          ClientNotificationType.DRAFT_STARTED,
          (notification: NotificationData) => {
            onDraftStarted(notification as DraftStartedNotification);
          },
        )
      : noop;

    const unsubscribeDraftPickMade = onDraftPickMade
      ? client.on(
          ClientNotificationType.DRAFT_PICK_MADE,
          (notification: NotificationData) => {
            onDraftPickMade(notification as DraftPickNotification);
          },
        )
      : noop;

    const unsubscribePlayerStatsLoading = onPlayerStatsLoading
      ? client.on(
          ClientNotificationType.PLAYER_STATS_LOADING,
          (notification: NotificationData) => {
            onPlayerStatsLoading(
              notification as PlayerStatsLoadingNotification,
            );
          },
        )
      : noop;

    const unsubscribePlayerStatsUpdated = onPlayerStatsUpdated
      ? client.on(
          ClientNotificationType.PLAYER_STATS_UPDATED,
          (notification: NotificationData) => {
            onPlayerStatsUpdated(
              notification as PlayerStatsUpdatedNotification,
            );
          },
        )
      : noop;

    const unsubscribeMatchupStatsComplete = onMatchupStatsComplete
      ? client.on(
          ClientNotificationType.MATCHUP_STATS_COMPLETE,
          (notification: NotificationData) => {
            console.log(
              '[useWebSocket] received matchup-stats-complete',
              notification,
            );
            onMatchupStatsComplete(
              notification as MatchupStatsCompleteNotification,
            );
          },
        )
      : noop;

    const unsubscribeRosterUpdate = onRosterUpdate
      ? client.on(
          ClientNotificationType.ROSTER_UPDATE,
          (notification: NotificationData) => {
            console.log('[useWebSocket] received roster-update', notification);
            onRosterUpdate(notification as RosterUpdateNotification);
          },
        )
      : noop;

    const unsubscribeLeagueChatMessage = onLeagueChatMessage
      ? client.on(
          ClientNotificationType.LEAGUE_CHAT_MESSAGE,
          (notification: NotificationData) => {
            console.log(
              '[useWebSocket] received league-chat-message',
              notification,
            );
            onLeagueChatMessage(notification as LeagueChatMessageNotification);
          },
        )
      : noop;

    // Cleanup on unmount
    return () => {
      cancelled = true;
      unsubscribeConnected();
      unsubscribeDisconnected();
      unsubscribeError();
      unsubscribeMessage();
      unsubscribeDraftCompleted();
      unsubscribeDraftStarted();
      unsubscribeDraftPickMade();
      unsubscribePlayerStatsLoading();
      unsubscribePlayerStatsUpdated();
      unsubscribeMatchupStatsComplete();
      unsubscribeRosterUpdate();
      unsubscribeLeagueChatMessage();
      client.dispose();
    };
  }, [
    wsUrl,
    token,
    leagueId,
    matchupId,
    viewContext,
    autoConnect,
    onDraftStarted,
    onDraftCompleted,
    onDraftPickMade,
    onPlayerStatsLoading,
    onPlayerStatsUpdated,
    onMatchupStatsComplete,
    onRosterUpdate,
    onLeagueChatMessage,
    onMessage,
    onError,
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
