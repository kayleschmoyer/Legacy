/**
 * LeagueWebSocketContext
 *
 * Holds the single shared WebSocketClient for a league screen. The screen
 * creates one client (via `useLeagueWebSocketLifecycle`) and provides it
 * here; child hooks (chat, subscription/premium status, roster/trade
 * refetches) subscribe to the same socket instead of opening their own
 * connections. Mirrors apps/web/src/context/LeagueWebSocketContext.tsx.
 */
import { createContext, useContext } from 'react';
import type { WebSocketClient } from '@legacy-sports/websocket-client';

export interface LeagueWebSocketContextValue {
  /** The shared WebSocketClient instance, or null before it is created. */
  client: WebSocketClient | null;
  /** Whether the socket is currently connected. */
  connected: boolean;
}

export const LeagueWebSocketContext =
  createContext<LeagueWebSocketContextValue>({
    client: null,
    connected: false,
  });

/**
 * Returns the shared WebSocketClient and connection state. Outside a
 * `<LeagueWebSocketContext.Provider>` (e.g. screens that don't render a
 * league page) this resolves to `{ client: null, connected: false }` —
 * callers should fall back to their own standalone connection in that case.
 */
export function useLeagueWebSocketClient(): LeagueWebSocketContextValue {
  return useContext(LeagueWebSocketContext);
}
