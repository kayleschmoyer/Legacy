import { useCallback, useEffect, useRef } from 'react';
import { LOGGER } from '@legacy-sports/logging';
import { type EntitlementKey } from '@legacy-sports/utils';
import { useAuth } from '@legacy-sports/shared-components/auth';
import {
  useGetUserByIdQuery,
  useMyEntitlementsQuery,
} from '@legacy-sports/graphql';
import { useLeagueWebSocket } from './useLeagueWebSocket';
import { silentlyRefreshJwt } from '../lib/jwt-refresh';
import { useLeagueWebSocketClient } from '../context/LeagueWebSocketContext';

/**
 * Returns whether the current user has premium access.
 *
 * Returns `false` while auth or the user query is loading to prevent granting
 * access before status is confirmed. Checks `subscriptionTier === 'premium'`
 * from the database; admins are always treated as premium regardless of tier.
 */
export function useIsPremium(): boolean {
  const { isPremium } = useIsPremiumStatus();
  return isPremium;
}

/**
 * Same as `useIsPremium` but also exposes loading state.
 * Use this when you need to block actions until premium status is resolved
 * (e.g. preventing free users from selecting premium features during load).
 *
 * Stays fresh mid-session by listening for `SUBSCRIPTION_UPDATED` push
 * notifications (emitted by the stripe-webhook lambda after every Stripe
 * state change) and refetching the user record on receipt. End-to-end lag
 * is sub-second on pages wrapped in `LeagueWebSocketContext`. On pages
 * without that context (no live socket available), we fall back to refetching
 * on window focus so a Stripe state change is picked up the next time the
 * tab regains focus instead of being silently missed.
 *
 * Additionally, if the hook mounts while `?checkout=success` is present in
 * the URL (Stripe same-tab redirect flow), it immediately refetches so the
 * premium badge updates without waiting for a focus or WebSocket event.
 */
export function useIsPremiumStatus(): {
  isPremium: boolean;
  isLoading: boolean;
} {
  const { user, isLoading: authLoading } = useAuth();
  const { client: wsClient } = useLeagueWebSocketClient();

  const {
    data,
    loading: userLoading,
    refetch,
  } = useGetUserByIdQuery({
    variables: { id: user?.id ?? 0 },
    skip: !user?.id,
  });

  const userId = user?.id;
  const refetchSafely = useCallback(
    (reason: string) => {
      if (!userId) return;
      refetch().catch((err: unknown) => {
        LOGGER.error(
          `useIsPremium: refetch after ${reason} failed`,
          err instanceof Error ? err : new Error(String(err)),
          { userId },
        );
      });
    },
    [userId, refetch],
  );

  // Capture at mount whether we landed from a Stripe same-tab redirect.
  // We use a ref so the flag stays true even after the page navigates away
  // the checkout query params (which happens before userId may be available).
  const isCheckoutRedirect = useRef(
    new URLSearchParams(window.location.search).get('checkout') === 'success',
  );

  useLeagueWebSocket({
    onSubscriptionUpdated: () => {
      // Proactive path (LS-8645): a Stripe entitlement change bumps the user's
      // `entitlements_updated_at` marker, so silently re-mint the JWT with the
      // fresh entitlement claim + new `iat` before any request is rejected as
      // stale. `silentlyRefreshJwt` dedupes concurrent calls and dispatches
      // `auth:token-refreshed` on success, which refetches the entitlement set.
      void silentlyRefreshJwt();
      refetchSafely('SUBSCRIPTION_UPDATED');
    },
  });

  // Immediately refetch after a same-tab Stripe checkout redirect so the
  // premium badge updates without waiting for a focus event. Runs as soon as
  // refetchSafely stabilises (i.e. userId is available); the ref ensures the
  // URL check survives the navigate() that cleans up the query param.
  useEffect(() => {
    if (!isCheckoutRedirect.current) return;
    refetchSafely('checkout redirect');
  }, [refetchSafely]);

  // Fallback for pages outside LeagueWebSocketContext: refetch when the tab
  // regains focus so we never silently miss a Stripe state change.
  useEffect(() => {
    if (wsClient || !userId) return;
    const onFocus = () => refetchSafely('window focus');
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [wsClient, userId, refetchSafely]);

  // Guard against stale Apollo cache data during a logout/login cycle.
  // When user.id changes, Apollo may still return the previous user's record
  // while the new query is in-flight. Only trust data that belongs to the
  // currently-authenticated user; treat a mismatch as still-loading.
  const dataIsForCurrentUser =
    data?.user?.id == null || data.user.id === user?.id;
  const isLoading = authLoading || userLoading || !dataIsForCurrentUser;

  if (isLoading) return { isPremium: false, isLoading };
  // Source the admin→premium shortcut from the server response, NOT the
  // client-side `user.accessLevel`. The auth-state accessLevel is hydrated from
  // localStorage (`ls_user_profile`), which is written from a JWT whose
  // signature is never verified in the browser — a forged `accessLevel: 'admin'`
  // claim could otherwise unlock premium UI for a free user (LGN-013). The
  // `GetUserById` response reads accessLevel from the DB and is already guarded
  // by `dataIsForCurrentUser`, mirroring the trusted pattern in AdminUsersPage.
  if (data?.user?.accessLevel === 'admin')
    return { isPremium: true, isLoading };
  return {
    isPremium: data?.user?.subscriptionTier === 'premium',
    isLoading,
  };
}

/**
 * Returns the set of entitlement lookup_keys the current user's plan grants,
 * read from the server's `myEntitlements` resolver (LS-8645), which derives them
 * from the token's Stripe-minted entitlement claim. Admins receive the full
 * catalog server-side.
 *
 * The set only changes when the JWT changes, so it refetches on
 * `auth:token-refreshed` — dispatched after both the proactive
 * `SUBSCRIPTION_UPDATED` re-mint and the Apollo error-link's `ENTITLEMENTS_STALE`
 * retry — so a plan change propagates without a reload. Returns an empty set
 * (and `isLoading: true`) until auth and the query resolve.
 */
export function useEntitlements(): {
  entitlements: EntitlementKey[];
  isLoading: boolean;
} {
  const { user, isLoading: authLoading } = useAuth();

  const {
    data,
    loading: queryLoading,
    refetch,
  } = useMyEntitlementsQuery({ skip: !user?.id });

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    const onTokenRefreshed = () => {
      refetch().catch((err: unknown) => {
        LOGGER.error(
          'useEntitlements: refetch after token refresh failed',
          err instanceof Error ? err : new Error(String(err)),
          { userId },
        );
      });
    };
    window.addEventListener('auth:token-refreshed', onTokenRefreshed);
    return () =>
      window.removeEventListener('auth:token-refreshed', onTokenRefreshed);
  }, [userId, refetch]);

  const isLoading = authLoading || queryLoading;
  return {
    entitlements: (data?.myEntitlements ?? []) as EntitlementKey[],
    isLoading,
  };
}

/**
 * Returns whether the current user's plan grants a specific entitlement. Prefer
 * this over `useIsPremium()` at feature gates so each gate is framed around the
 * capability it unlocks (the Stripe entitlement) rather than the tier that
 * happens to grant it today.
 *
 * Backed by the token's per-user Stripe entitlement claim (LS-8645) via
 * {@link useEntitlements}, so a plan can grant only a subset of premium features.
 * Returns `false` while the entitlement set is still loading (same conservative
 * behavior as `useIsPremium`).
 */
export function useHasEntitlement(key: EntitlementKey): boolean {
  const { entitlements, isLoading } = useEntitlements();
  if (isLoading) return false;
  return entitlements.includes(key);
}
