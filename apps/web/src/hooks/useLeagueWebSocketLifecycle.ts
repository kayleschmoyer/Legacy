/**
 * useLeagueWebSocketLifecycle
 *
 * Creates and manages the WebSocketClient connection for a league page.
 * LeagueDetailPage calls this hook to obtain the client + connection state,
 * then provides both through LeagueWebSocketContext so child components can
 * subscribe to events via useLeagueWebSocket without opening their own sockets.
 */
import { useEffect, useRef, useState } from 'react';
import { LOGGER } from '@legacy-sports/logging';
import { WebSocketClient } from '@legacy-sports/websocket-client';
import { env } from '../config/environment';

export interface UseLeagueWebSocketLifecycleOptions {
  leagueId: number;
  isAuthenticated: boolean;
  authToken: string | null | undefined;
}

export interface UseLeagueWebSocketLifecycleResult {
  /** The active WebSocketClient, or null before the hook's effect has first run. */
  client: WebSocketClient | null;
  /** Whether the socket is currently connected. */
  connected: boolean;
}

/**
 * Manages the WebSocketClient lifecycle for a league page.
 *
 * Handles creation, connection, event wiring, and cleanup of the socket.
 * Returns the client instance and current connection state for the caller
 * to pass into LeagueWebSocketContext.
 */
export function useLeagueWebSocketLifecycle({
  leagueId,
  isAuthenticated,
  authToken,
}: UseLeagueWebSocketLifecycleOptions): UseLeagueWebSocketLifecycleResult {
  const [client, setClient] = useState<WebSocketClient | null>(null);
  const [connected, setConnected] = useState(false);
  const lastErrorRef = useRef<string | null>(null);

  useEffect(() => {
    const wsUrl = env.websocketUrl;
    LOGGER.info('[useLeagueWebSocketLifecycle] WebSocket config', {
      websocketUrl: wsUrl ? `${wsUrl.substring(0, 30)}...` : 'NOT SET',
      isAuthenticated,
      leagueId,
    });
    if (!wsUrl || !isAuthenticated || isNaN(leagueId)) return;

    let active = true;
    const wsClient = new WebSocketClient({
      url: wsUrl,
      // Pass the in-memory JWT as a query param so the server can authenticate
      // even when the HttpOnly cookie isn't sent (e.g. when the WS endpoint is
      // on a different subdomain and the cookie domain wasn't set at login time).
      // Falls back to cookie-based auth when the token isn't available yet.
      token: authToken ?? undefined,
      leagueId,
      viewContext: 'league',
      autoConnect: false,
    });
    setClient(wsClient);
    wsClient.on('connected', () => {
      if (active) setConnected(true);
    });
    wsClient.on('disconnected', () => {
      if (active) setConnected(false);
    });
    wsClient.on('error', (err: Error) => {
      if (active && err.message !== lastErrorRef.current) {
        lastErrorRef.current = err.message;
        LOGGER.debug(
          '[useLeagueWebSocketLifecycle] WebSocket error:',
          err.message,
        );
      }
    });
    void Promise.resolve().then(() => {
      if (active) wsClient.connect();
    });
    return () => {
      active = false;
      wsClient.dispose();
      setClient(null);
      setConnected(false);
    };
  }, [leagueId, isAuthenticated, authToken]);

  useEffect(() => {
    LOGGER.info(
      '[useLeagueWebSocketLifecycle] WebSocket connected:',
      connected,
    );
  }, [connected]);

  return { client, connected };
}
