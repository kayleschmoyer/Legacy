import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import {
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
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
import { useRegisterDeviceTokenMutation } from '../../../api/db/graphql.generated';
import { isPhysicalDevice } from '../../../common/utilities/DeviceUtils';

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

type NotificationData = {
  notificationType?: string;
  leagueId?: number;
  matchupId?: number;
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

  const registerToken = useCallback(async () => {
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
      await setNotificationChannelAsync('default', {
        name: 'Default',
        importance: AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    try {
      // Pass projectId when available (required for valid tokens on EAS builds
      // and Expo SDK 54+; optional on development builds without EAS setup).
      const easProjectId = (
        Constants.expoConfig?.extra as
          | { eas?: { projectId?: string } }
          | undefined
      )?.eas?.projectId;
      const tokenData = await getExpoPushTokenAsync(
        easProjectId != null ? { projectId: easProjectId } : undefined,
      );
      const token = tokenData.data;
      LOGGER.info('Registering Expo push token', { platform: Platform.OS });

      await registerDeviceToken({
        variables: {
          input: {
            deviceToken: token,
            platform: Platform.OS, // 'ios' | 'android'
          },
        },
      });
    } catch (error) {
      LOGGER.error(
        'Failed to register push token',
        error instanceof Error ? error.message : String(error),
      );
    }
  }, [userId, registerDeviceToken]);

  // Register on mount / when userId becomes available
  useEffect(() => {
    void registerToken();
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
  return true;
}

function navigateFromNotification(
  router: ReturnType<typeof useRouter>,
  data: NotificationData,
) {
  const { notificationType, leagueId, matchupId } = data;

  if (
    (notificationType === 'DRAFT_STARTED' ||
      notificationType === 'DRAFT_PICK_MADE') &&
    leagueId
  ) {
    router.navigate(`/baseball/league/${leagueId}`);
    return;
  }

  if (notificationType === 'DRAFT_COMPLETED' && leagueId) {
    router.navigate(`/baseball/league/${leagueId}`);
    return;
  }

  if (matchupId && leagueId) {
    router.navigate({
      pathname: '/baseball/matchup',
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
