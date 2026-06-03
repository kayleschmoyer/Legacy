import { useEffect, useRef } from 'react';
import { WebSocketClient } from '@legacy-sports/websocket-client';
import { ClientNotificationType } from '@legacy-sports/utils';
import { captureError } from '@legacy-sports/rollbar/native';
import { config } from '@legacy-sports/app-config/native';
import {
  useCreateBillingPortalSessionMutation,
  useCreateCheckoutSessionMutation,
  useGetMySubscriptionQuery,
} from '../../api/db/graphql.generated';
import { readKeychainValue, Secret } from '../../common/auth/AuthHooks';

export interface SubscriptionData {
  status: string | null;
  tier: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean | null;
  gracePeriodEndsAt: string | null;
}

export function useSubscription() {
  const { data, loading, error, refetch } = useGetMySubscriptionQuery();
  const subscription = data?.mySubscription ?? null;

  const isPremium = subscription?.tier === 'premium';
  const tier = subscription?.tier ?? 'free';

  // Keep the latest refetch in a ref so the WebSocket effect can run once on
  // mount yet always invoke the current refetch without re-creating the socket.
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  // Mirror the web `useIsPremium` hook: listen for SUBSCRIPTION_UPDATED push
  // notifications (emitted by the stripe-webhook lambda after every Stripe
  // state change) and refetch the subscription on receipt. Without this the
  // mobile hook only polls, so real-time tier changes — grace-period expiry,
  // admin adjustments — were missed until the app was restarted.
  const clientRef = useRef<WebSocketClient | null>(null);
  useEffect(() => {
    let active = true;

    const connect = async () => {
      try {
        const token = await readKeychainValue(Secret.INTERNAL_JWT);
        if (!active || !token) return;

        const wsUrl = config.websocketUrl ?? '';
        if (!wsUrl) return;

        // No leagueId: subscription updates are user-scoped, so connect with the
        // general view context rather than a league room.
        const client = new WebSocketClient({
          url: wsUrl,
          token,
          viewContext: 'general',
          autoConnect: true,
          reconnect: true,
        });

        // client.on dispatches only for the subscribed type, so no per-event
        // type guard is needed here.
        client.on(ClientNotificationType.SUBSCRIPTION_UPDATED, () => {
          void refetchRef.current().catch((err: unknown) => {
            captureError(err instanceof Error ? err : new Error(String(err)));
          });
        });

        clientRef.current = client;
      } catch (err) {
        if (!active) return;
        captureError(err instanceof Error ? err : new Error(String(err)));
      }
    };

    void connect();

    return () => {
      active = false;
      clientRef.current?.dispose();
      clientRef.current = null;
    };
  }, []);

  return {
    subscription: subscription as SubscriptionData | null,
    isPremium,
    tier,
    loading,
    error,
    refetch,
  };
}

export function useCheckoutSession() {
  return useCreateCheckoutSessionMutation();
}

export function useBillingPortalSession() {
  return useCreateBillingPortalSessionMutation();
}
