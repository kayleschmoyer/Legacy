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
import { AppState } from 'react-native';
import { useIsFocused } from 'expo-router';
import { LOGGER } from '@legacy-sports/logging';
import { WebSocketClient } from '@legacy-sports/websocket-client';

export interface UseLeagueWebSocketLifecycleOptions {
  leagueId: number | undefined;
  url: string | undefined;
  token: string | undefined;
  /** Heartbeat cadence override for long-lived rooms such as the live draft (LS-10630). */
  heartbeatMs?: number;
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
  heartbeatMs,
}: UseLeagueWebSocketLifecycleOptions): UseLeagueWebSocketLifecycleResult {
  const [client, setClient] = useState<WebSocketClient | null>(null);
  const [connected, setConnected] = useState(false);
  // React Navigation's native stack keeps prior screens mounted (for the
  // back gesture) when a league screen is pushed on top of another, so
  // `useIsFocused` — not mount state — is what tells a backgrounded league
  // screen to tear down its socket instead of listening indefinitely.
  const isFocused = useIsFocused();

  useEffect(() => {
    if (leagueId == null || isNaN(leagueId) || !url || !token || !isFocused)
      return;

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
    if (heartbeatMs) wsClient.setHeartbeatInterval(heartbeatMs);
    wsClient.connect();

    return () => {
      active = false;
      wsClient.dispose();
      setClient(null);
      setConnected(false);
    };
  }, [leagueId, url, token, isFocused, heartbeatMs]);

  // A stretch of flaky mobile network (subway, elevator, wifi/cellular
  // handoff) can burn through the client's bounded reconnect budget and it
  // gives up for good (LS-8881) — silently, since the error above is only
  // logged at debug level. Without this, realtime stays dead for the rest of
  // the screen's lifetime even after connectivity returns, because nothing
  // else re-triggers the leagueId/url/token/isFocused effect above. Treat the
  // app returning to the foreground as a signal worth a fresh attempt,
  // mirroring the resume-refetch pattern in FootballMatchupScreen (LS-6388).
  //
  // The mirror image: while the app is minimized the OS drops or freezes the
  // socket, and the client's heartbeat/backoff would keep reconnecting (and
  // burning its attempt budget) in the background. Park it on `background`
  // (not the transient `inactive`) and resume with one clean connect on
  // `active` (LS-10625).
  useEffect(() => {
    if (!client) return;

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background') {
        client.suspend();
      } else if (nextState === 'active') {
        // `resume` is a no-op unless suspended, so keep `reconnectNow` for
        // the give-up revival it has always covered (LS-8985).
        client.resume();
        client.reconnectNow();
      }
    });
    return () => subscription.remove();
  }, [client]);

  return { client, connected };
}
