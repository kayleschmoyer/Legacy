import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type DraftCompletedNotification,
  type MatchupStatsCompleteNotification,
  type NotificationData,
  type PlayerStatsLoadingNotification,
  type PlayerStatsUpdatedNotification,
  WebSocketClient,
  type WebSocketMessage,
} from '@legacy-sports/websocket-client';

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
  PlayerStatsLoadingNotification,
  PlayerStatsUpdatedNotification,
  MatchupStatsCompleteNotification,
  WebSocketMessage,
};

interface UseWebSocketOptions {
  url?: string;
  token?: string;
  leagueId?: number;
  matchupId?: number;
  viewContext?: 'general' | 'league' | 'matchup' | 'roster';
  autoConnect?: boolean;
  onDraftCompleted?: (notification: DraftCompletedNotification) => void;
  onPlayerStatsLoading?: (notification: PlayerStatsLoadingNotification) => void;
  onPlayerStatsUpdated?: (notification: PlayerStatsUpdatedNotification) => void;
  onMatchupStatsComplete?: (
    notification: MatchupStatsCompleteNotification,
  ) => void;
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
  onDraftCompleted,
  onPlayerStatsLoading,
  onPlayerStatsUpdated,
  onMatchupStatsComplete,
  onMessage,
  onError,
}: UseWebSocketOptions = {}) {
  const clientRef = useRef<WebSocketClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get WebSocket URL from environment or passed prop
  const wsUrl = url || process.env.NX_WEBSOCKET_URL;

  const connect = useCallback(() => {
    if (!wsUrl) {
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
      setError('WebSocket URL not configured');
      return;
    }

    const client = new WebSocketClient({
      url: wsUrl,
      token,
      leagueId,
      matchupId,
      viewContext,
      autoConnect,
    });

    clientRef.current = client;

    // Set up event handlers
    const unsubscribeConnected = client.on('connected', () => {
      setConnected(true);
      setError(null);
    });

    const unsubscribeDisconnected = client.on('disconnected', () => {
      setConnected(false);
    });

    const unsubscribeError = client.on('error', (err) => {
      setError(err.message);
      onError?.(err);
    });

    const unsubscribeMessage = onMessage
      ? client.on('message', onMessage)
      : noop;

    const unsubscribeDraftCompleted = onDraftCompleted
      ? client.on('draft-complete', (notification: NotificationData) => {
          onDraftCompleted(notification as DraftCompletedNotification);
        })
      : noop;

    const unsubscribePlayerStatsLoading = onPlayerStatsLoading
      ? client.on('player-stats-loading', (notification: NotificationData) => {
          onPlayerStatsLoading(notification as PlayerStatsLoadingNotification);
        })
      : noop;

    const unsubscribePlayerStatsUpdated = onPlayerStatsUpdated
      ? client.on('player-stats-updated', (notification: NotificationData) => {
          onPlayerStatsUpdated(notification as PlayerStatsUpdatedNotification);
        })
      : noop;

    const unsubscribeMatchupStatsComplete = onMatchupStatsComplete
      ? client.on(
          'matchup-stats-complete',
          (notification: NotificationData) => {
            onMatchupStatsComplete(
              notification as MatchupStatsCompleteNotification,
            );
          },
        )
      : noop;

    // Cleanup on unmount
    return () => {
      unsubscribeConnected();
      unsubscribeDisconnected();
      unsubscribeError();
      unsubscribeMessage();
      unsubscribeDraftCompleted();
      unsubscribePlayerStatsLoading();
      unsubscribePlayerStatsUpdated();
      unsubscribeMatchupStatsComplete();
      client.dispose();
    };
  }, [
    wsUrl,
    token,
    leagueId,
    matchupId,
    viewContext,
    autoConnect,
    onDraftCompleted,
    onPlayerStatsLoading,
    onPlayerStatsUpdated,
    onMatchupStatsComplete,
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
