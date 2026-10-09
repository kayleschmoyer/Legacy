import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import {
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  addPushTokenListener,
  AndroidImportance,
  getExpoPushTokenAsync,
  getLastNotificationResponseAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  setNotificationChannelAsync,
  setNotificationHandler,
} from 'expo-notifications';
import type { NotificationResponse } from 'expo-notifications';
import type { EventSubscription } from 'expo-modules-core';
import { useRouter } from 'expo-router';
import { LOGGER } from '@legacy-sports/logging';
import { PermissionStatus } from 'expo-modules-core';
import { useRegisterDeviceTokenMutation } from '@legacy-sports/graphql';
import { ANDROID_NOTIFICATION_CHANNELS } from '@legacy-sports/utils';
import { isPhysicalDevice } from '../../../common/utilities/DeviceUtils';
import { getEasProjectId } from '../getEasProjectId';
import {
  clearPushTokenRegistration,
  isPushTokenAlreadyRegistered,
  recordPushTokenRegistration,
} from '../pushRegistrationFingerprint';

// Configure how notifications appear when app is in foreground
setNotificationHandler({
  handleNotification: () =>
    Promise.resolve({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
});

// Sport prefixes that may be interpolated into a navigation path. `sport`
// arrives from an untrusted notification payload, so anything outside this
// allowlist (e.g. '../../') falls back to the default sport rather than being
// placed into the route.
const ALLOWED_SPORT_PREFIXES: readonly string[] = ['baseball', 'football'];

export type NotificationData = {
  notificationType?: string;
  leagueId?: number;
  matchupId?: number;
  tradeOfferId?: number;
  sport?: string;
  [key: string]: unknown;
};

/**
 * Requests push notification permissions, registers the Expo Push Token with
 * the backend, and sets up listeners for foreground and tapped notifications.
 *
 * Call this hook once inside the authenticated app layout. Pass `userId` only
 * when the user is logged in — the hook skips registration until it receives a
 * truthy userId.
 */
export function usePushNotifications(userId: number | null | undefined) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const [registerDeviceToken] = useRegisterDeviceTokenMutation();
  const notificationListener = useRef<EventSubscription | undefined>(undefined);
  const responseListener = useRef<EventSubscription | undefined>(undefined);
  const lastHandledNotificationId = useRef<string | null>(null);
  const wasSignedInRef = useRef(false);

  /**
   * `force` bypasses the unchanged-token skip. The OS token-rotation listener
   * is the one caller that must always tell the backend, mirroring the web
   * hook's pushsubscriptionchange path.
   */
  const registerToken = useCallback(
    async (force = false) => {
      if (!userId) return;

      // Push notifications only work on physical devices
      if (!isPhysicalDevice) {
        LOGGER.info('Skipping push registration on simulator/emulator');
        return;
      }

      // Request permission
      const existingPermission = await getPermissionsAsync();
      const existingStatus = existingPermission.status;
      let finalStatus = existingStatus;

      if (existingStatus !== PermissionStatus.GRANTED) {
        const updatedPermission = await requestPermissionsAsync();
        finalStatus = updatedPermission.status;
      }

      if (finalStatus !== PermissionStatus.GRANTED) {
        LOGGER.info('Push notification permission denied by user');
        return;
      }

      // Additional Android channel setup
      if (Platform.OS === 'android') {
        // One channel per shared definition so users can mute or re-prioritize
        // categories in OS settings (LS-7650). The server picks the channel via
        // the same list (getAndroidChannelId).
        for (const channel of ANDROID_NOTIFICATION_CHANNELS) {
          await setNotificationChannelAsync(channel.id, {
            name: channel.name,
            importance: AndroidImportance[channel.importance],
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
          });
        }
      }

      // The Expo projectId is required to mint a valid push token on EAS builds
      // and Expo SDK 54+. Without it getExpoPushTokenAsync throws
      // `No "projectId" found` (LS-7955), so skip registration cleanly rather than
      // logging an error on dev builds that have no EAS project configured.
      const projectId = getEasProjectId();
      if (!projectId) {
        LOGGER.info(
          'Skipping push registration: no EAS projectId configured (set EAS_PROJECT_ID)',
        );
        return;
      }

      try {
        const tokenData = await getExpoPushTokenAsync({ projectId });
        const token = tokenData.data;

        if (!force && (await isPushTokenAlreadyRegistered(userId, token))) {
          LOGGER.info('Expo push token unchanged since last registration');
          return;
        }

        LOGGER.info('Registering Expo push token', { platform: Platform.OS });

        await registerDeviceToken({
          variables: {
            input: {
              deviceToken: token,
              platform: Platform.OS, // 'ios' | 'android'
            },
          },
        });

        await recordPushTokenRegistration(userId, token);
      } catch (error) {
        LOGGER.error('Failed to register push token', error as Error);
      }
    },
    [userId, registerDeviceToken],
  );

  // Register on mount / when userId becomes available
  useEffect(() => {
    void registerToken();
  }, [registerToken]);

  // Drop the fingerprint on logout so the next sign-in re-registers, matching
  // the web hook. `wasSignedInRef` keeps a cold start (userId null until auth
  // resolves) from being mistaken for a sign-out.
  useEffect(() => {
    if (userId) {
      wasSignedInRef.current = true;
      return;
    }
    if (wasSignedInRef.current) {
      wasSignedInRef.current = false;
      void clearPushTokenRegistration();
    }
  }, [userId]);

  // Re-register whenever the OS rolls a new device push token (e.g. after an
  // app update or credential rotation). Without this, the old token stays in
  // the backend and push delivery silently fails until the next cold start.
  useEffect(() => {
    const subscription = addPushTokenListener(() => {
      // A rotated token must always reach the backend, even if the fingerprint
      // somehow still matches — this is the path that keeps delivery working.
      void registerToken(true);
    });
    return () => subscription.remove();
  }, [registerToken]);

  // Re-run registration when the app returns to foreground so that tokens are
  // sent after a user grants permissions in system settings then re-opens the
  // app (LS-4976).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void registerToken();
      }
    });
    return () => subscription.remove();
  }, [registerToken]);

  // Foreground notification listener
  useEffect(() => {
    notificationListener.current = addNotificationReceivedListener(
      (notification) => {
        const rawData: unknown = notification.request.content.data;
        const data = isNotificationData(rawData) ? rawData : undefined;
        LOGGER.info('Push notification received in foreground', {
          type: data?.notificationType,
        });
      },
    );

    return () => {
      notificationListener.current?.remove();
    };
  }, []);

  // Unified tap handler — handles both cold-start and foreground taps.
  // Uses routerRef so the listener is installed once on mount and never
  // re-installed due to router identity changes. Dedupes via
  // lastHandledNotificationId so a cold-start response that is also
  // delivered to the foreground listener produces only one navigation.
  useEffect(() => {
    const handleResponse = (
      response: NotificationResponse,
      source: 'cold-start' | 'tap',
    ) => {
      const notificationId = response.notification.request.identifier;
      if (lastHandledNotificationId.current === notificationId) return;
      lastHandledNotificationId.current = notificationId;

      const rawData: unknown = response.notification.request.content.data;
      const data = isNotificationData(rawData) ? rawData : undefined;
      if (!data) return;

      LOGGER.info(`Push notification ${source}`, {
        type: data.notificationType,
        leagueId: data.leagueId,
        matchupId: data.matchupId,
      });

      navigateFromNotification(routerRef.current, data);
    };

    void getLastNotificationResponseAsync().then((response) => {
      if (response) handleResponse(response, 'cold-start');
    });

    responseListener.current = addNotificationResponseReceivedListener(
      (response) => handleResponse(response, 'tap'),
    );

    return () => {
      responseListener.current?.remove();
    };
  }, []);
}

function isNotificationData(value: unknown): value is NotificationData {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if ('notificationType' in obj && typeof obj['notificationType'] !== 'string')
    return false;
  if ('leagueId' in obj && typeof obj['leagueId'] !== 'number') return false;
  if ('matchupId' in obj && typeof obj['matchupId'] !== 'number') return false;
  if ('tradeOfferId' in obj && typeof obj['tradeOfferId'] !== 'number')
    return false;
  if ('sport' in obj && typeof obj['sport'] !== 'string') return false;
  return true;
}

export function navigateFromNotification(
  router: ReturnType<typeof useRouter>,
  data: NotificationData,
) {
  const { notificationType, leagueId, matchupId, tradeOfferId, sport } = data;
  const sportPrefix =
    sport && ALLOWED_SPORT_PREFIXES.includes(sport) ? sport : 'baseball';

  // LS-10593: "your draft has started" / "you're on the clock" are calls to
  // act now, so they open the live draft room directly — the same
  // `/DraftBoardPage` route the league Overview's "Join draft" banner uses
  // (it serves both sports) — rather than the league screen.
  if (
    (notificationType === 'DRAFT_STARTED' ||
      notificationType === 'DRAFT_ON_THE_CLOCK') &&
    leagueId
  ) {
    router.navigate({
      pathname: '/DraftBoardPage',
      params: { leagueId: String(leagueId) },
    });
    return;
  }

  if (notificationType === 'DRAFT_PICK_MADE' && leagueId) {
    router.navigate(`/${sportPrefix}/league/${leagueId}`);
    return;
  }

  if (notificationType === 'DRAFT_COMPLETED' && leagueId) {
    router.navigate(`/${sportPrefix}/league/${leagueId}`);
    return;
  }

  if (notificationType === 'TRADE_OFFER' && leagueId) {
    router.navigate({
      pathname: '/TradeCenterPage',
      params: {
        leagueId: String(leagueId),
        ...(tradeOfferId != null && { tradeOfferId: String(tradeOfferId) }),
      },
    });
    return;
  }

  if (matchupId && leagueId) {
    router.navigate({
      pathname: `/${sportPrefix}/matchup`,
      params: {
        matchupId: String(matchupId),
        leagueId: String(leagueId),
      },
    });
    return;
  }

  // Default: go to notifications screen
  router.navigate('/notifications');
}
