/**
 * useLeagueWebSocket
 *
 * Subscribes to real-time events from the single shared WebSocketClient
 * provided by LeagueWebSocketContext.  Components should use this hook
 * instead of creating their own WebSocketClient instances.
 *
 * All callbacks are stored in refs so they never need to appear in the
 * effect dependency array — you can safely pass inline arrow functions
 * without causing re-subscriptions.
 */
import { useEffect, useRef } from 'react';
import { ClientNotificationType } from '@legacy-sports/utils';
import type { LeagueChatMessageNotification } from '@legacy-sports/websocket-client';
import { useLeagueWebSocketClient } from '../context/LeagueWebSocketContext';

export interface UseLeagueWebSocketOptions {
  /** Fired when a draft begins for this league. */
  onDraftStarted?: () => void;
  /** Fired when a draft finishes for this league. */
  onDraftCompleted?: () => void;
  /** Fired when a roster is updated (e.g. waiver pickup) in this league. */
  onRosterUpdate?: () => void;
  /** Fired when a trade offer is sent / accepted / rejected / cancelled. */
  onTradeOffer?: () => void;
  /** Fired when all matchup stats have finished loading. */
  onMatchupStatsComplete?: () => void;
  /** Fired when a new chat message arrives in this league's chat room. */
  onLeagueChatMessage?: (n: LeagueChatMessageNotification) => void;
  /**
   * Fired when the socket reconnects after a drop (i.e. *not* the initial
   * connection).  Useful for refetching any data that may have changed while
   * the socket was down.
   */
  onReconnect?: () => void;
}

/**
 * Subscribe to WebSocket notifications from the shared league socket.
 * Returns `{ connected }` reflecting the current connection state.
 */
export function useLeagueWebSocket(options: UseLeagueWebSocketOptions): {
  connected: boolean;
} {
  const { client, connected } = useLeagueWebSocketClient();

  // Store each callback in a ref so the effect only re-runs when `client`
  // changes, not when a callback identity changes.
  const onDraftStartedRef = useRef(options.onDraftStarted);
  onDraftStartedRef.current = options.onDraftStarted;

  const onDraftCompletedRef = useRef(options.onDraftCompleted);
  onDraftCompletedRef.current = options.onDraftCompleted;

  const onRosterUpdateRef = useRef(options.onRosterUpdate);
  onRosterUpdateRef.current = options.onRosterUpdate;

  const onTradeOfferRef = useRef(options.onTradeOffer);
  onTradeOfferRef.current = options.onTradeOffer;

  const onMatchupStatsCompleteRef = useRef(options.onMatchupStatsComplete);
  onMatchupStatsCompleteRef.current = options.onMatchupStatsComplete;

  const onLeagueChatMessageRef = useRef(options.onLeagueChatMessage);
  onLeagueChatMessageRef.current = options.onLeagueChatMessage;

  const onReconnectRef = useRef(options.onReconnect);
  onReconnectRef.current = options.onReconnect;

  useEffect(() => {
    if (!client) return;

    const unsubs: Array<() => void> = [];
    let wasConnected = false;

    unsubs.push(
      client.on('connected', () => {
        if (wasConnected) {
          onReconnectRef.current?.();
        }
        wasConnected = true;
      }),
    );

    unsubs.push(
      client.on(ClientNotificationType.DRAFT_STARTED, () => {
        onDraftStartedRef.current?.();
      }),
    );

    unsubs.push(
      client.on(ClientNotificationType.DRAFT_COMPLETED, () => {
        onDraftCompletedRef.current?.();
      }),
    );

    unsubs.push(
      client.on(ClientNotificationType.ROSTER_UPDATE, () => {
        onRosterUpdateRef.current?.();
      }),
    );

    unsubs.push(
      client.on(ClientNotificationType.TRADE_OFFER, () => {
        onTradeOfferRef.current?.();
      }),
    );

    unsubs.push(
      client.on(ClientNotificationType.MATCHUP_STATS_COMPLETE, () => {
        onMatchupStatsCompleteRef.current?.();
      }),
    );

    unsubs.push(
      client.on(ClientNotificationType.LEAGUE_CHAT_MESSAGE, (n) => {
        onLeagueChatMessageRef.current?.(n as LeagueChatMessageNotification);
      }),
    );

    return () => unsubs.forEach((fn) => fn());
  }, [client]);

  return { connected };
}
