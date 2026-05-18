import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import webpush from 'web-push';
import { LOGGER } from '@legacy-sports/logging';
import { createNotificationService as createWsNotificationService } from '@legacy-sports/aws-utils';
import { createDatabaseService } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils/node';
import type { NotificationEvent, SendResult } from './types';

const expo = new Expo({ useFcmV1: true });
const dbService = createDatabaseService(getDbOptions());
const wsNotificationService = createWsNotificationService();

// Configure VAPID for Web Push (keys from environment)
const VAPID_PUBLIC_KEY = process.env['VAPID_PUBLIC_KEY'] ?? '';
const VAPID_PRIVATE_KEY = process.env['VAPID_PRIVATE_KEY'] ?? '';
const VAPID_SUBJECT =
  process.env['VAPID_SUBJECT'] ?? 'mailto:push@legacysports.app';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

/**
 * Delivers a single notification event:
 * 1. Checks user push preferences (skip if pushEnabled = false)
 * 2. Loads active device tokens for the user
 * 3. Sends push notifications via Expo Push API
 * 4. Logs the notification to notification_history
 * 5. Deactivates any tokens rejected by Expo as invalid
 */
export async function deliverNotification(
  event: NotificationEvent,
): Promise<SendResult> {
  const { userId, notificationType, title, body, data = {} } = event;

  // 1. Check preferences — skip if user has push disabled
  const prefs =
    await dbService.notifications.getUserNotificationPreferences(userId);
  if (prefs && !prefs.pushEnabled) {
    LOGGER.info('Push notifications disabled for user, skipping', { userId });
    return {
      userId,
      tokensAttempted: 0,
      tokensSent: 0,
      tokensFailed: 0,
      historyId: null,
    };
  }

  // 2. Load active device tokens
  const tokens = await dbService.notifications.getUserDeviceTokens(userId);
  const activeTokens = tokens.filter((t) => t.isActive);

  if (activeTokens.length === 0) {
    LOGGER.info('No active device tokens for user', { userId });
    // Still log to history so in-app notification bell is populated
    const historyId = await dbService.notifications.logNotificationHistory(
      userId,
      notificationType,
      title,
      body,
      data,
    );
    await pushNotificationReceivedEvent({
      userId,
      historyId,
      notificationType,
    });
    return {
      userId,
      tokensAttempted: 0,
      tokensSent: 0,
      tokensFailed: 0,
      historyId,
    };
  }

  // 3. Separate web push tokens from Expo tokens
  const webTokens: typeof activeTokens = [];
  const messages: ExpoPushMessage[] = [];
  const expoTokens: string[] = [];

  for (const token of activeTokens) {
    if (token.platform === 'web') {
      webTokens.push(token);
      continue;
    }
    if (!Expo.isExpoPushToken(token.deviceToken)) {
      LOGGER.warn('Skipping non-Expo push token', {
        userId,
        platform: token.platform,
      });
      continue;
    }
    expoTokens.push(token.deviceToken);
    messages.push({
      to: token.deviceToken,
      title,
      body,
      data: { ...data, notificationType },
      sound: 'default',
    });
  }

  let tokensSent = 0;
  let tokensFailed = 0;
  const vapidConfigured = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
  const webTokensAttempted = vapidConfigured ? webTokens.length : 0;
  const totalAttempted = expoTokens.length + webTokensAttempted;

  if (webTokens.length > 0 && !vapidConfigured) {
    LOGGER.warn('Skipping web push: VAPID keys not configured', {
      userId,
      skippedWebTokens: webTokens.length,
    });
  }

  // 4a. Send Expo push notifications
  if (messages.length > 0) {
    const chunks = expo.chunkPushNotifications(messages);
    const tickets: ExpoPushTicket[] = [];

    for (const chunk of chunks) {
      const chunkTickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...chunkTickets);
    }

    await Promise.all(
      tickets.map(async (ticket, index) => {
        const token = expoTokens[index];
        if (ticket.status === 'ok') {
          tokensSent++;
        } else {
          tokensFailed++;
          LOGGER.warn('Expo push ticket error', {
            userId,
            details: ticket.details,
            message: ticket.message,
          });
          if (ticket.details?.error === 'DeviceNotRegistered' && token) {
            await dbService.notifications.disableDeviceToken(userId, token);
            LOGGER.info('Deactivated stale device token', { userId });
          }
        }
      }),
    );
  }

  // 4b. Send Web Push notifications (VAPID)
  if (webTokens.length > 0 && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    const webPayload = JSON.stringify({ title, body, data, notificationType });

    await Promise.all(
      webTokens.map(async (token) => {
        try {
          const subscription = JSON.parse(
            token.deviceToken,
          ) as webpush.PushSubscription;
          await webpush.sendNotification(subscription, webPayload);
          tokensSent++;
        } catch (error) {
          tokensFailed++;
          const statusCode =
            error instanceof webpush.WebPushError ? error.statusCode : 0;
          LOGGER.warn('Web Push delivery error', {
            userId,
            statusCode,
            error: error instanceof Error ? error.message : String(error),
          });
          // 410 Gone or 404 = subscription expired/invalid
          if (statusCode === 410 || statusCode === 404) {
            await dbService.notifications.disableDeviceToken(
              userId,
              token.deviceToken,
            );
            LOGGER.info('Deactivated expired web push subscription', {
              userId,
            });
          }
        }
      }),
    );
  }

  // 6. Log notification to history
  const historyId = await dbService.notifications.logNotificationHistory(
    userId,
    notificationType,
    title,
    body,
    data,
  );

  // 7. Push WebSocket `notification-received` event so the in-app bell
  //    badge updates within ~1s instead of waiting for the next poll.
  await pushNotificationReceivedEvent({
    userId,
    historyId,
    notificationType,
  });

  LOGGER.info('Notification delivery complete', {
    userId,
    notificationType,
    tokensAttempted: totalAttempted,
    tokensSent,
    tokensFailed,
    historyId,
  });

  return {
    userId,
    tokensAttempted: totalAttempted,
    tokensSent,
    tokensFailed,
    historyId,
  };
}

/**
 * Push a `notification-received` WebSocket event so the recipient's
 * notification-bell badge updates immediately without polling.
 *
 * Non-fatal: WebSocket delivery failures are logged but never surfaced
 * to the SQS handler — push notifications and history logging are the
 * primary outcomes of this Lambda, and the badge will recover on next
 * page load / explicit refetch if the WebSocket push is lost.
 */
async function pushNotificationReceivedEvent(params: {
  userId: number;
  historyId: number | null;
  notificationType: string;
}): Promise<void> {
  if (!wsNotificationService) return;
  try {
    await wsNotificationService.notifyNotificationReceived(params.userId, {
      historyId: params.historyId,
      notificationType: params.notificationType,
    });
  } catch (error) {
    LOGGER.warn(
      'WebSocket notification-received push failed (non-fatal)',
      error instanceof Error ? error : new Error(String(error)),
      { userId: params.userId },
    );
  }
}
