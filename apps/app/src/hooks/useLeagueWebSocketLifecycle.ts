/**
 * useLeagueWebSocketLifecycle
 *
 * Creates and manages the single WebSocketClient connection for a league
 * screen (viewContext 'league'). The screen calls this hook to obtain the
 * client + connection state, then provides both through
 * LeagueWebSocketContext so child hooks (useLeagueChat, useSubscription,
 * roster/trade handlers) can subscribe to events via useLeagueWebSocket
 * without opening their own sockets. Mirrors
 * apps/web/src/hooks/useLeagueWebSocketLifecycle.ts, adapted to native's
 * async keychain-sourced token.
 */
import { useEffect, useState } from 'react';
import { LOGGER } from '@legacy-sports/logging';
import { WebSocketClient } from '@legacy-sports/websocket-client';

export interface UseLeagueWebSocketLifecycleOptions {
  leagueId: number | undefined;
  url: string | undefined;
  token: string | undefined;
}

export interface UseLeagueWebSocketLifecycleResult {
  /** The active WebSocketClient, or null before the hook's effect has first run. */
  client: WebSocketClient | null;
  /** Whether the socket is currently connected. */
  connected: boolean;
}

/**
 * Manages the WebSocketClient lifecycle for a league screen.
 *
 * Handles creation, connection, event wiring, and cleanup of the socket.
 * Returns the client instance and current connection state for the caller
 * to pass into LeagueWebSocketContext.
 */
export function useLeagueWebSocketLifecycle({
  leagueId,
  url,
  token,
}: UseLeagueWebSocketLifecycleOptions): UseLeagueWebSocketLifecycleResult {
  const [client, setClient] = useState<WebSocketClient | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (leagueId == null || isNaN(leagueId) || !url || !token) return;

    let active = true;
    const wsClient = new WebSocketClient({
      url,
      token,
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
      if (active) {
        LOGGER.debug(
          '[useLeagueWebSocketLifecycle] WebSocket error:',
          err.message,
        );
      }
    });
    wsClient.connect();

    return () => {
      active = false;
      wsClient.dispose();
      setClient(null);
      setConnected(false);
    };
  }, [leagueId, url, token]);

  return { client, connected };
}
