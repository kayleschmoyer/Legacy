import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { WebSocketClient } from '@legacy-sports/websocket-client';
import {
  ClientNotificationType,
  type EntitlementKey,
} from '@legacy-sports/utils';
import { captureError } from '@legacy-sports/rollbar/native';
import { config } from '@legacy-sports/app-config/native';
import {
  useCreateBillingPortalSessionMutation,
  useCreateCheckoutSessionMutation,
  useGetMySubscriptionQuery,
  useMyEntitlementsQuery,
} from '@legacy-sports/graphql';
import { readKeychainValue, Secret } from '../../common/auth/AuthHooks';
import { useLeagueWebSocketClient } from '../../context/LeagueWebSocketContext';
import { silentlyRefreshJwt } from '../../common/auth/jwtRefresh';

export interface SubscriptionData {
  status: string | null;
  tier: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean | null;
  gracePeriodEndsAt: string | null;
  trialEndsAt: string | null;
}

/**
 * Subscribe to user-scoped SUBSCRIPTION_UPDATED push notifications (emitted by
 * the stripe-webhook lambda after every Stripe state change) and invoke
 * `onUpdate` on receipt. The WebSocket is created once on mount; the latest
 * `onUpdate` is always called via a ref so callers can pass an inline closure
 * without re-creating the socket. Without this the mobile hooks only poll, so
 * real-time changes — grace-period expiry, admin adjustments, entitlement
 * changes — were missed until the app was restarted.
 *
 * When rendered inside a league screen's LeagueWebSocketContext (e.g. the
 * commissioner tab), reuse that shared socket instead of opening a second
 * one (LS-8885). Outside that context (the other ~40 call sites across the
 * app), fall back to this hook's own standalone connection exactly as
 * before.
 */
function useOnSubscriptionUpdated(onUpdate: () => void): void {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const { client: sharedClient } = useLeagueWebSocketClient();
  const clientRef = useRef<WebSocketClient | null>(null);
  useEffect(() => {
    if (sharedClient) {
      const unsubscribe = sharedClient.on(
        ClientNotificationType.SUBSCRIPTION_UPDATED,
        () => {
          onUpdateRef.current();
        },
      );
      return unsubscribe;
    }

    let active = true;
    let appStateSubscription: { remove: () => void } | null = null;

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
          onUpdateRef.current();
        });

        clientRef.current = client;

        // A stretch of flaky mobile network can burn through this client's
        // bounded reconnect budget the same way it can for the league socket
        // (LS-8985), but unlike useLeagueWebSocketLifecycle this standalone
        // connection — used at the ~40 call sites outside a league screen,
        // e.g. Home-tab subscription/entitlement gating — never wired up the
        // AppState foreground signal, so it stayed dead for the rest of the
        // app session once its budget (plus the LS-9489 give-up-cooldown
        // retry) was exhausted. Mirror the same fix here.
        appStateSubscription = AppState.addEventListener(
          'change',
          (nextState) => {
            if (nextState === 'active') {
              client.reconnectNow();
            }
          },
        );
      } catch (err) {
        if (!active) return;
        captureError(err instanceof Error ? err : new Error(String(err)));
      }
    };

    void connect();

    return () => {
      active = false;
      appStateSubscription?.remove();
      clientRef.current?.dispose();
      clientRef.current = null;
    };
  }, [sharedClient]);
}

export function useSubscription() {
  const { data, loading, error, refetch } = useGetMySubscriptionQuery();
  const subscription = data?.mySubscription ?? null;

  const isPremium = subscription?.tier === 'premium';
  const tier = subscription?.tier ?? 'free';

  useOnSubscriptionUpdated(() => {
    // Proactive path (LS-8645): re-mint the JWT so the fresh entitlement claim
    // propagates before any request is rejected as stale, then refresh the
    // coarse subscription state the UI displays.
    void silentlyRefreshJwt();
    void refetch().catch((err: unknown) => {
      captureError(err instanceof Error ? err : new Error(String(err)));
    });
  });

  return {
    subscription: subscription as SubscriptionData | null,
    isPremium,
    tier,
    loading,
    error,
    refetch,
  };
}

/**
 * Returns the set of entitlement lookup_keys the current user's plan grants,
 * read from the server's `myEntitlements` resolver (LS-8645) which derives them
 * from the token's Stripe-minted entitlement claim (admins receive the full
 * catalog server-side). On a SUBSCRIPTION_UPDATED notification it re-mints the
 * JWT and refetches so a plan change propagates without an app restart.
 */
export function useEntitlements(): {
  entitlements: EntitlementKey[];
  loading: boolean;
} {
  const { data, loading, refetch } = useMyEntitlementsQuery();

  useOnSubscriptionUpdated(() => {
    void silentlyRefreshJwt()
      .then(() => refetch())
      .catch((err: unknown) => {
        captureError(err instanceof Error ? err : new Error(String(err)));
      });
  });

  return {
    entitlements: (data?.myEntitlements ?? []) as EntitlementKey[],
    loading,
  };
}

/**
 * Returns whether the current user's plan grants a specific entitlement. Mobile
 * counterpart of the web `useHasEntitlement` hook — prefer it over a bare
 * `isPremium` check at feature gates so each gate is framed around the Stripe
 * entitlement it unlocks.
 *
 * Backed by the token's per-user Stripe entitlement claim (LS-8645) via
 * {@link useEntitlements}, so a plan can grant only a subset of premium
 * features. Returns `false` while the entitlement set is still loading.
 */
export function useHasEntitlement(key: EntitlementKey): boolean {
  const { entitlements, loading } = useEntitlements();
  if (loading) return false;
  return entitlements.includes(key);
}

export function useCheckoutSession() {
  return useCreateCheckoutSessionMutation();
}

export function useBillingPortalSession() {
  return useCreateBillingPortalSessionMutation();
}
