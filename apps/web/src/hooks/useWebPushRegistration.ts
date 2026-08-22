import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { LOGGER } from '@legacy-sports/logging';
import { useRegisterDeviceTokenMutation } from '@legacy-sports/graphql';
import { env } from '../config/environment';

const SW_PATH = '/sw.js';
const LOG_TAG = 'WebPush';

/**
 * Fingerprint of the last subscription this browser successfully sent to the
 * backend. Persisted because the registration is a property of the browser's
 * push subscription, not of the page session — an in-memory ref resets on every
 * page load and made the hook re-POST an unchanged subscription each time
 * (LS-9541).
 */
const STORAGE_KEY = 'ls.webpush.lastRegistration';

/**
 * Re-assert an unchanged registration once a week. The backend row could be
 * dropped without the browser ever knowing (pruning, a restore, a manual
 * delete), and push failures surface no error to the user — so the skip is
 * bounded rather than permanent.
 */
const REGISTRATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface StoredRegistration {
  userId: number;
  subscription: string;
  registeredAt: number;
}

function readLastRegistration(): StoredRegistration | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    const { userId, subscription, registeredAt } = record;
    if (
      typeof userId !== 'number' ||
      typeof subscription !== 'string' ||
      typeof registeredAt !== 'number'
    ) {
      return null;
    }
    return { userId, subscription, registeredAt };
  } catch {
    // Unavailable (private mode, storage disabled) or corrupt — fail open so
    // registration still happens.
    return null;
  }
}

function writeLastRegistration(entry: StoredRegistration): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    LOGGER.debug(`[${LOG_TAG}] Could not persist registration fingerprint`);
  }
}

/**
 * Invalidate the fingerprint so the next sign-in re-registers. Wired into the
 * AuthProvider's `onLogout` (apps/web/src/main.tsx) because the hook's own
 * component unmounts on logout and its effect may never observe the
 * transition.
 */
export function clearWebPushRegistration(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    LOGGER.debug(`[${LOG_TAG}] Could not clear registration fingerprint`);
  }
}

/**
 * True only when this exact user + subscription pair was registered recently.
 * Every uncertain case (no user id, no record, different user, different
 * subscription, stale or future-dated timestamp) falls through to registering.
 */
function isAlreadyRegistered(
  userId: number | null,
  subscriptionJson: string,
): boolean {
  if (userId === null) return false;
  const last = readLastRegistration();
  if (!last) return false;
  if (last.userId !== userId) return false;
  if (last.subscription !== subscriptionJson) return false;
  const age = Date.now() - last.registeredAt;
  return age >= 0 && age < REGISTRATION_TTL_MS;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Registers the service worker and subscribes to Web Push notifications
 * when the user is authenticated and a VAPID public key is configured.
 *
 * Sends the PushSubscription JSON to the backend via registerDeviceToken
 * with platform='web' — but only when the subscription is new, changed, or
 * has not been re-asserted for REGISTRATION_TTL_MS.
 */
export function useWebPushRegistration(): void {
  const { isAuthenticated, user } = useAuth();
  const userId = user?.id ?? null;
  const [registerToken] = useRegisterDeviceTokenMutation();
  const registeredRef = useRef(false);
  // Distinguishes a real logout (authenticated -> not) from the unauthenticated
  // first paint of a fresh page load, which must not clear the fingerprint.
  const wasAuthenticatedRef = useRef(false);

  const register = useCallback(async () => {
    if (registeredRef.current) return;
    if (!env.vapidPublicKey) {
      LOGGER.debug(`[${LOG_TAG}] No VAPID public key configured, skipping`);
      return;
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      LOGGER.debug(`[${LOG_TAG}] Web Push not supported in this browser`);
      return;
    }

    try {
      const registration = await navigator.serviceWorker.register(SW_PATH);
      LOGGER.info(`[${LOG_TAG}] Service worker registered`, {
        scope: registration.scope,
      });

      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        const applicationServerKey = urlBase64ToUint8Array(env.vapidPublicKey);
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
        });
        LOGGER.info(`[${LOG_TAG}] Push subscription created`);
      }

      const subscriptionJson = JSON.stringify(subscription.toJSON());

      if (isAlreadyRegistered(userId, subscriptionJson)) {
        registeredRef.current = true;
        LOGGER.debug(
          `[${LOG_TAG}] Subscription unchanged since last registration, skipping mutation`,
        );
        return;
      }

      await registerToken({
        variables: {
          input: {
            deviceToken: subscriptionJson,
            platform: 'web',
          },
        },
      });

      if (userId !== null) {
        writeLastRegistration({
          userId,
          subscription: subscriptionJson,
          registeredAt: Date.now(),
        });
      }

      registeredRef.current = true;
      LOGGER.info(`[${LOG_TAG}] Device token registered with backend`);
    } catch (error) {
      LOGGER.warn(
        `[${LOG_TAG}] Failed to register push subscription`,
        error as Error,
      );
    }
  }, [registerToken, userId]);

  useEffect(() => {
    if (isAuthenticated) {
      wasAuthenticatedRef.current = true;
      void register();
      return;
    }

    // Reset so a subsequent login attempt triggers a fresh registration.
    registeredRef.current = false;

    if (wasAuthenticatedRef.current) {
      // A genuine logout, not the unauthenticated first paint of a page load.
      // Drop the fingerprint so logging back in re-registers, preserving the
      // pre-LS-9541 behaviour of resetting registeredRef on logout.
      wasAuthenticatedRef.current = false;
      clearWebPushRegistration();
    }
  }, [isAuthenticated, register]);

  // Handle pushsubscriptionchange messages from the service worker.
  // The SW cannot make authenticated API calls, so it forwards the new
  // subscription JSON here for us to re-register with the backend.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleMessage = (event: MessageEvent<unknown>) => {
      if (
        typeof event.data !== 'object' ||
        event.data === null ||
        (event.data as Record<string, unknown>)['type'] !==
          'PUSH_SUBSCRIPTION_CHANGED'
      ) {
        return;
      }
      const subscription = (event.data as Record<string, unknown>)[
        'subscription'
      ];
      if (typeof subscription !== 'string') return;

      void registerToken({
        variables: { input: { deviceToken: subscription, platform: 'web' } },
      })
        .then(() => {
          // Keep the fingerprint in step with what the backend last received,
          // so the next page load recognises the rotated subscription as
          // registered.
          if (userId !== null) {
            writeLastRegistration({
              userId,
              subscription,
              registeredAt: Date.now(),
            });
          }
        })
        .catch((error: unknown) => {
          LOGGER.warn(
            `[${LOG_TAG}] Failed to re-register rotated subscription`,
            error as Error,
          );
        });
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () =>
      navigator.serviceWorker.removeEventListener('message', handleMessage);
  }, [registerToken, userId]);
}
