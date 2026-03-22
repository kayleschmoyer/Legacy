import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
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
import type { EventSubscription } from 'expo-modules-core';
import { isDevice } from 'expo-device';
import { useRouter } from 'expo-router';
import { LOGGER } from '@legacy-sports/logging';
import { PermissionStatus } from 'expo-modules-core';
import { useRegisterDeviceTokenMutation } from '../../../api/db/graphql.generated';

// Configure how notifications appear when app is in foreground
setNotificationHandler({
  handleNotification: () =>
    Promise.resolve({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
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
  const [registerDeviceToken] = useRegisterDeviceTokenMutation();
  const notificationListener = useRef<EventSubscription>();
  const responseListener = useRef<EventSubscription>();

  const registerToken = useCallback(async () => {
    if (!userId) return;

    // Push notifications only work on physical devices
    if (!isDevice) {
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
      const tokenData = await getExpoPushTokenAsync();
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
        const data = notification.request.content.data as
          | NotificationData
          | undefined;
        LOGGER.info('Push notification received in foreground', {
          type: data?.notificationType,
        });
      },
    );

    return () => {
      notificationListener.current?.remove();
    };
  }, []);

  // Cold-start: check if app was opened via a notification tap
  useEffect(() => {
    void getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response.notification.request.content.data as
        | NotificationData
        | undefined;
      if (!data) return;

      LOGGER.info('Push notification cold-start tap', {
        type: data.notificationType,
        leagueId: data.leagueId,
        matchupId: data.matchupId,
      });

      navigateFromNotification(router, data);
    });
  }, [router]);

  // Tap / interaction listener — used for deep-link navigation
  useEffect(() => {
    responseListener.current = addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as
          | NotificationData
          | undefined;
        if (!data) return;

        LOGGER.info('Push notification tapped', {
          type: data.notificationType,
          leagueId: data.leagueId,
          matchupId: data.matchupId,
        });

        navigateFromNotification(router, data);
      },
    );

    return () => {
      responseListener.current?.remove();
    };
  }, [router]);
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
