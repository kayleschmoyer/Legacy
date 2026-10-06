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
  /**
   * Heartbeat cadence override. Long-lived rooms (the live draft) pass a
   * tight value so a zombie socket is detected and replaced in seconds
   * instead of the client's 5-minute default (LS-10630).
   */
  heartbeatMs?: number;
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
  heartbeatMs,
}: UseLeagueWebSocketLifecycleOptions): UseLeagueWebSocketLifecycleResult {
  const [client, setClient] = useState<WebSocketClient | null>(null);
  const [connected, setConnected] = useState(false);
  const lastErrorRef = useRef<string | null>(null);

  // Read via ref (not the effect's dependency array) so an authToken update
  // — e.g. the async JWT refresh that resolves shortly after initial mount —
  // doesn't tear down and recreate the socket. The connection is instead kept
  // alive and told about the new token via `updateToken` below; only a real
  // identity change (leagueId/isAuthenticated) warrants a teardown/recreate.
  const authTokenRef = useRef(authToken);
  authTokenRef.current = authToken;

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
      token: authTokenRef.current ?? undefined,
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
    if (heartbeatMs) wsClient.setHeartbeatInterval(heartbeatMs);
    wsClient.connect();

    // The client gives up for good once its bounded reconnect budget is spent
    // (LS-8881), and a hidden tab is throttled so it may never get there. A
    // multi-hour draft room hits both, which silently ended league-chat
    // delivery while picks (on the draft socket, which already does this in
    // useWebSocket) kept flowing (LS-10630). `reconnectNow` is a no-op while
    // connected/connecting, so firing on every signal is safe.
    const handleOnline = () => wsClient.reconnectNow();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') wsClient.reconnectNow();
    };
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      active = false;
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      wsClient.dispose();
      setClient(null);
      setConnected(false);
    };
  }, [leagueId, isAuthenticated, heartbeatMs]);

  // Keep the client's token current for future (re)connects — e.g. once the
  // async JWT refresh resolves, or if the token rotates later — without
  // disposing the live connection above.
  useEffect(() => {
    client?.updateToken(authToken ?? undefined);
  }, [client, authToken]);

  useEffect(() => {
    LOGGER.info(
      '[useLeagueWebSocketLifecycle] WebSocket connected:',
      connected,
    );
  }, [connected]);

  return { client, connected };
}
