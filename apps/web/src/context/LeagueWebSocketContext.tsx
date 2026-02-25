/**
 * LeagueWebSocketContext
 *
 * Holds the single shared WebSocketClient for a league page.
 * LeagueDetailPage creates one client and provides it here; all child
 * components (chat, trade panel, roster) subscribe to the same socket
 * instead of opening their own connections.
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
 * Returns the shared WebSocketClient and connection state.
 * Must be called inside a component tree that is wrapped by
 * `<LeagueWebSocketContext.Provider>`.
 */
export function useLeagueWebSocketClient(): LeagueWebSocketContextValue {
  return useContext(LeagueWebSocketContext);
}
