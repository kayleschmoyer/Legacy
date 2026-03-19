import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { LOGGER } from '@legacy-sports/logging';
import { createDatabaseService } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils/node';
import type { NotificationEvent, SendResult } from './types';

const expo = new Expo({ useFcmV1: true });
const dbService = createDatabaseService(getDbOptions());

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
    return {
      userId,
      tokensAttempted: 0,
      tokensSent: 0,
      tokensFailed: 0,
      historyId,
    };
  }

  // 3. Build Expo push messages (skip non-Expo tokens)
  const messages: ExpoPushMessage[] = [];
  const expoTokens: string[] = [];

  for (const token of activeTokens) {
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

  // 4. Send in chunks (Expo recommends ≤100 per request)
  const chunks = expo.chunkPushNotifications(messages);
  const tickets: ExpoPushTicket[] = [];

  for (const chunk of chunks) {
    const chunkTickets = await expo.sendPushNotificationsAsync(chunk);
    tickets.push(...chunkTickets);
  }

  // 5. Count results and deactivate invalid tokens
  let tokensSent = 0;
  let tokensFailed = 0;

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
        // Deactivate DeviceNotRegistered tokens so we stop sending to them
        if (ticket.details?.error === 'DeviceNotRegistered' && token) {
          await dbService.notifications.disableDeviceToken(userId, token);
          LOGGER.info('Deactivated stale device token', { userId });
        }
      }
    }),
  );

  // 6. Log notification to history
  const historyId = await dbService.notifications.logNotificationHistory(
    userId,
    notificationType,
    title,
    body,
    data,
  );

  LOGGER.info('Notification delivery complete', {
    userId,
    notificationType,
    tokensAttempted: expoTokens.length,
    tokensSent,
    tokensFailed,
    historyId,
  });

  return {
    userId,
    tokensAttempted: expoTokens.length,
    tokensSent,
    tokensFailed,
    historyId,
  };
}
