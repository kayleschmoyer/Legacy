/**
 * useLeagueWebSocket
 *
 * Subscribes to real-time events from the single shared WebSocketClient
 * provided by LeagueWebSocketContext. Consumers should use this hook
 * instead of creating their own WebSocketClient instances.
 *
 * All callbacks are stored in refs so they never need to appear in the
 * effect dependency array — inline arrow functions can be passed safely
 * without causing re-subscriptions. Mirrors
 * apps/web/src/hooks/useLeagueWebSocket.ts, trimmed to the notification
 * types apps/app's league screen and its child hooks actually consume.
 */
import { useEffect, useRef } from 'react';
import { ClientNotificationType } from '@legacy-sports/utils';
import type {
  LeagueChatMessageNotification,
  SubscriptionUpdatedNotification,
} from '@legacy-sports/websocket-client';
import { useLeagueWebSocketClient } from '../context/LeagueWebSocketContext';

export interface UseLeagueWebSocketOptions {
  /** Fired when a roster is updated (e.g. waiver pickup) in this league. */
  onRosterUpdate?: () => void;
  /** Fired when a trade offer is sent / accepted / rejected / cancelled. */
  onTradeOffer?: () => void;
  /** Fired when a draft finishes for this league. */
  onDraftCompleted?: () => void;
  /** Fired when a new chat message arrives in this league's chat room. */
  onLeagueChatMessage?: (n: LeagueChatMessageNotification) => void;
  /**
   * Fired when the authenticated user's subscription tier or status changes.
   * Use this to refetch subscription data without a full app reload.
   */
  onSubscriptionUpdated?: (n: SubscriptionUpdatedNotification) => void;
}

/**
 * Subscribe to WebSocket notifications from the shared league socket.
 * Returns `{ connected }` reflecting the current connection state.
 */
export function useLeagueWebSocket(options: UseLeagueWebSocketOptions): {
  connected: boolean;
} {
  const { client, connected } = useLeagueWebSocketClient();

  const onRosterUpdateRef = useRef(options.onRosterUpdate);
  onRosterUpdateRef.current = options.onRosterUpdate;

  const onTradeOfferRef = useRef(options.onTradeOffer);
  onTradeOfferRef.current = options.onTradeOffer;

  const onDraftCompletedRef = useRef(options.onDraftCompleted);
  onDraftCompletedRef.current = options.onDraftCompleted;

  const onLeagueChatMessageRef = useRef(options.onLeagueChatMessage);
  onLeagueChatMessageRef.current = options.onLeagueChatMessage;

  const onSubscriptionUpdatedRef = useRef(options.onSubscriptionUpdated);
  onSubscriptionUpdatedRef.current = options.onSubscriptionUpdated;

  useEffect(() => {
    if (!client) return;

    const unsubs: Array<() => void> = [];

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
      client.on(ClientNotificationType.DRAFT_COMPLETED, () => {
        onDraftCompletedRef.current?.();
      }),
    );

    unsubs.push(
      client.on(ClientNotificationType.LEAGUE_CHAT_MESSAGE, (n) => {
        onLeagueChatMessageRef.current?.(n as LeagueChatMessageNotification);
      }),
    );

    unsubs.push(
      client.on(ClientNotificationType.SUBSCRIPTION_UPDATED, (n) => {
        onSubscriptionUpdatedRef.current?.(
          n as SubscriptionUpdatedNotification,
        );
      }),
    );

    return () => unsubs.forEach((fn) => fn());
  }, [client]);

  return { connected };
}
