import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { LOGGER } from '@legacy-sports/logging';
import { useRegisterDeviceTokenMutation } from '../api/db/graphql.generated';
import { env } from '../config/environment';

const SW_PATH = '/sw.js';
const LOG_TAG = 'WebPush';

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
 * with platform='web'.
 */
export function useWebPushRegistration(): void {
  const { isAuthenticated } = useAuth();
  const [registerToken] = useRegisterDeviceTokenMutation();
  const registeredRef = useRef(false);

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

      await registerToken({
        variables: {
          input: {
            deviceToken: subscriptionJson,
            platform: 'web',
          },
        },
      });

      registeredRef.current = true;
      LOGGER.info(`[${LOG_TAG}] Device token registered with backend`);
    } catch (error) {
      LOGGER.warn(`[${LOG_TAG}] Failed to register push subscription`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [registerToken]);

  useEffect(() => {
    if (isAuthenticated) {
      void register();
    }
  }, [isAuthenticated, register]);
}
