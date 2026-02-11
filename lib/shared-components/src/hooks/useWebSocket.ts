import { useCallback, useEffect, useRef, useState } from 'react';
import { LOGGER } from '@legacy-sports/logging';

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
export interface WebSocketMessage {
  type: string;
  data: unknown;
}

export interface DraftCompletedNotification {
  type: 'DRAFT_COMPLETED';
  leagueId: number;
  draftType: string;
  completedAt: string;
}

export interface PlayerStatsLoadingNotification {
  type: 'PLAYER_STATS_LOADING';
  playerId: number;
  matchupId: number;
  leagueId: number;
  progress?: {
    loaded: number;
    total: number;
  };
}

export interface PlayerStatsUpdatedNotification {
  type: 'PLAYER_STATS_UPDATED';
  playerId: number;
  matchupId: number;
  leagueId: number;
  stats: unknown;
}

export interface MatchupStatsCompleteNotification {
  type: 'MATCHUP_STATS_COMPLETE';
  matchupId: number;
  leagueId: number;
  totalPlayers: number;
  completedAt: string;
}

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
  onError?: (error: Event) => void;
}

/**
 * Hook for managing WebSocket connections for real-time notifications
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
  const wsRef = useRef<WebSocket | null>(null);
  const isMountedRef = useRef(true);
  const shouldReconnectRef = useRef(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pongTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastMessageTimeRef = useRef<number>(Date.now());
  const consecutivePingsRef = useRef<number>(0);
  const isAliveRef = useRef<boolean>(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const safeSetConnected = useCallback((value: boolean) => {
    if (isMountedRef.current) {
      setConnected(value);
    }
  }, []);

  const safeSetError = useCallback((value: string | null) => {
    if (isMountedRef.current) {
      setError(value);
    }
  }, []);

  const MAX_CONSECUTIVE_PINGS = 3; // Disconnect after 24 minutes of only pings
  const EIGHT_MINUTES = 480000; // 8 minutes in milliseconds

  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (pongTimeoutRef.current) {
      clearTimeout(pongTimeoutRef.current);
      pongTimeoutRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback(() => {
    stopHeartbeat();

    // Check every 8 minutes if we need to send a ping
    heartbeatIntervalRef.current = setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        return;
      }

      const timeSinceLastMessage = Date.now() - lastMessageTimeRef.current;

      // Only send ping if we haven't received any messages in 8+ minutes
      if (timeSinceLastMessage < EIGHT_MINUTES) {
        LOGGER.debug(
          `Skipping ping - received message ${Math.round(timeSinceLastMessage / 1000)}s ago`,
        );
        consecutivePingsRef.current = 0; // Reset counter when we have recent messages
        return;
      }

      // Check if we've sent too many consecutive pings without data
      if (consecutivePingsRef.current >= MAX_CONSECUTIVE_PINGS) {
        LOGGER.warn(
          `WebSocket idle for ${MAX_CONSECUTIVE_PINGS * 8}+ minutes with no data, disconnecting`,
        );
        ws.close();
        return;
      }

      if (!isAliveRef.current) {
        LOGGER.warn('WebSocket not responding to pings, closing connection');
        ws.close();
        return;
      }

      isAliveRef.current = false;
      consecutivePingsRef.current++;
      LOGGER.debug(
        `Sending WebSocket ping #${consecutivePingsRef.current} (idle for 8+ minutes)`,
      );

      try {
        ws.send(JSON.stringify({ type: 'ping' }));

        // Set timeout for pong response (30 seconds)
        pongTimeoutRef.current = setTimeout(() => {
          if (!isAliveRef.current) {
            LOGGER.warn('No pong received within 30 seconds');
            ws.close();
          }
        }, 30000);
      } catch (err) {
        LOGGER.warn(
          'Failed to send ping:',
          err instanceof Error ? err : String(err),
        );
      }
    }, EIGHT_MINUTES);
  }, [MAX_CONSECUTIVE_PINGS, EIGHT_MINUTES, stopHeartbeat]);

  const connect = useCallback(() => {
    // Get WebSocket URL from environment or passed prop
    const wsUrl = url || process.env.NX_WEBSOCKET_URL;

    if (!wsUrl) {
      safeSetError('WebSocket URL not configured');
      LOGGER.warn('WebSocket URL not configured');
      return;
    }

    try {
      shouldReconnectRef.current = true;

      // Build connection URL with query params
      const params = new URLSearchParams();
      if (token) params.append('token', token);
      if (leagueId) params.append('leagueId', leagueId.toString());
      if (matchupId) params.append('matchupId', matchupId.toString());
      if (viewContext) params.append('viewContext', viewContext);

      const connectionUrl = `${wsUrl}?${params.toString()}`;

      // Redact token for logging (security best practice)
      const debugParams = new URLSearchParams(params);
      if (debugParams.has('token')) {
        debugParams.set('token', 'REDACTED');
      }
      const debugUrl = `${wsUrl}?${debugParams.toString()}`;

      LOGGER.debug('Connecting to WebSocket', { url: debugUrl });

      const ws = new WebSocket(connectionUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        LOGGER.info('WebSocket connected');
        safeSetConnected(true);
        safeSetError(null);
        lastMessageTimeRef.current = Date.now();
        consecutivePingsRef.current = 0;
        isAliveRef.current = true;
        startHeartbeat();
      };

      ws.onmessage = (event) => {
        try {
          // Update last message time for any message received
          lastMessageTimeRef.current = Date.now();

          const message = JSON.parse(event.data as string) as WebSocketMessage;

          // Handle pong response
          if (message.type === 'pong') {
            LOGGER.debug('Received WebSocket pong');
            isAliveRef.current = true;
            if (pongTimeoutRef.current) {
              clearTimeout(pongTimeoutRef.current);
              pongTimeoutRef.current = null;
            }
            return; // Don't process pong as a regular message
          }

          // Any non-pong message is actual data, reset consecutive ping counter
          consecutivePingsRef.current = 0;

          LOGGER.debug('WebSocket message received', { message });

          // Handle notifications
          if (message.type === 'notification' && message.data) {
            const notification = message.data as
              | DraftCompletedNotification
              | PlayerStatsLoadingNotification
              | PlayerStatsUpdatedNotification
              | MatchupStatsCompleteNotification;

            if (notification.type === 'DRAFT_COMPLETED') {
              LOGGER.debug(
                'Draft completed notification received',
                notification,
              );
              onDraftCompleted?.(notification);
            } else if (notification.type === 'PLAYER_STATS_LOADING') {
              LOGGER.debug(
                'Player stats loading notification received',
                notification,
              );
              onPlayerStatsLoading?.(notification);
            } else if (notification.type === 'PLAYER_STATS_UPDATED') {
              LOGGER.debug(
                'Player stats updated notification received',
                notification,
              );
              onPlayerStatsUpdated?.(notification);
            } else if (notification.type === 'MATCHUP_STATS_COMPLETE') {
              LOGGER.debug(
                'Matchup stats complete notification received',
                notification,
              );
              onMatchupStatsComplete?.(notification);
            }
          }

          // Call generic message handler
          onMessage?.(message);
        } catch (err) {
          LOGGER.error('Error parsing WebSocket message', err as Error);
        }
      };

      ws.onerror = (event) => {
        LOGGER.error('WebSocket error', event);
        safeSetError('WebSocket connection error');
        onError?.(event);
      };

      ws.onclose = () => {
        LOGGER.debug('WebSocket disconnected');
        safeSetConnected(false);
        stopHeartbeat();

        if (shouldReconnectRef.current) {
          // Attempt to reconnect after 5 seconds
          reconnectTimeoutRef.current = setTimeout(() => {
            if (!shouldReconnectRef.current) {
              return;
            }
            LOGGER.debug('Attempting to reconnect WebSocket');
            connect();
          }, 5000);
        }
      };
    } catch (err) {
      LOGGER.error('Error creating WebSocket connection', err as Error);
      safeSetError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [
    url,
    token,
    leagueId,
    matchupId,
    viewContext,
    onDraftCompleted,
    onPlayerStatsLoading,
    onPlayerStatsUpdated,
    onMatchupStatsComplete,
    onMessage,
    onError,
    startHeartbeat,
    stopHeartbeat,
    safeSetConnected,
    safeSetError,
  ]);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    stopHeartbeat();

    if (wsRef.current) {
      LOGGER.debug('Disconnecting WebSocket');
      wsRef.current.close();
      wsRef.current = null;
      safeSetConnected(false);
    }
  }, [safeSetConnected, stopHeartbeat]);

  const sendMessage = useCallback((data: unknown) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    } else {
      LOGGER.warn('Cannot send message - WebSocket not connected');
    }
  }, []);

  const updateContext = useCallback(
    (newContext: {
      matchupId?: number;
      leagueId?: number;
      viewContext?: string;
    }) => {
      sendMessage({
        action: 'updateContext',
        data: newContext,
      });
    },
    [sendMessage],
  );

  // Auto-connect on mount if enabled
  useEffect(() => {
    isMountedRef.current = true;

    if (autoConnect) {
      connect();
    }

    return () => {
      isMountedRef.current = false;
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    connected,
    error,
    connect,
    disconnect,
    sendMessage,
    updateContext,
  };
}
