import type {
  CreateNotificationInput,
  PublicDb,
} from '@legacy-sports/db-client';
import {
  createNotificationHistory,
  getUserDeviceTokens,
  getUserNotificationPreferences,
} from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { sendPushNotification } from './sns-service';

const logger = LOGGER;

export interface MatchupNotificationContext {
  matchupId: number;
  leagueId: number;
  team1Id: number;
  team2Id: number;
  team1Score?: string;
  team2Score?: string;
  weekNumber: number;
}

/**
 * Send matchup started notifications to all users in the matchup
 */
export async function sendMatchupStartedNotifications(
  db: PublicDb,
  context: MatchupNotificationContext,
): Promise<void> {
  try {
    // Get team members (would need to implement team member query)
    const userIds = await getTeamMemberUserIds(db, [
      context.team1Id,
      context.team2Id,
    ]);

    logger.info('Sending matchup started notifications', {
      matchupId: context.matchupId,
      userCount: userIds.length,
    });

    for (const userId of userIds) {
      await sendNotificationToUser(db, {
        userId,
        notificationType: 'matchup_started',
        channel: 'push',
        matchupId: context.matchupId,
        leagueId: context.leagueId,
        title: 'Matchup Started',
        message: `Your week ${context.weekNumber} matchup has begun!`,
        metadata: {
          matchupId: context.matchupId,
          weekNumber: context.weekNumber,
        },
      });
    }
  } catch (error: unknown) {
    logger.error('Error sending matchup started notifications', { error });
    throw error;
  }
}

/**
 * Send matchup ended notifications with results
 */
export async function sendMatchupEndedNotifications(
  db: PublicDb,
  context: MatchupNotificationContext,
): Promise<void> {
  try {
    const userIds = await getTeamMemberUserIds(db, [
      context.team1Id,
      context.team2Id,
    ]);

    const team1Score = parseFloat(context.team1Score || '0');
    const team2Score = parseFloat(context.team2Score || '0');

    logger.info('Sending matchup ended notifications', {
      matchupId: context.matchupId,
      userCount: userIds.length,
    });

    for (const userId of userIds) {
      const userTeamId = await getUserTeamId(db, userId, context.leagueId);
      const isWinner =
        (userTeamId === context.team1Id && team1Score > team2Score) ||
        (userTeamId === context.team2Id && team2Score > team1Score);
      const isTie = team1Score === team2Score;

      let message = '';
      if (isTie) {
        message = `Your week ${context.weekNumber} matchup ended in a tie! Final score: ${context.team1Score} - ${context.team2Score}`;
      } else if (isWinner) {
        message = `You won your week ${context.weekNumber} matchup! Final score: ${context.team1Score} - ${context.team2Score}`;
      } else {
        message = `Your week ${context.weekNumber} matchup has ended. Final score: ${context.team1Score} - ${context.team2Score}`;
      }

      await sendNotificationToUser(db, {
        userId,
        notificationType: 'matchup_ended',
        channel: 'push',
        matchupId: context.matchupId,
        leagueId: context.leagueId,
        title: 'Matchup Complete',
        message,
        metadata: {
          matchupId: context.matchupId,
          weekNumber: context.weekNumber,
          team1Score: context.team1Score,
          team2Score: context.team2Score,
          isWinner,
          isTie,
        },
      });
    }
  } catch (error: unknown) {
    logger.error('Error sending matchup ended notifications', { error });
    throw error;
  }
}

/**
 * Send close game notifications
 */
export async function sendCloseGameNotifications(
  db: PublicDb,
  context: MatchupNotificationContext,
): Promise<void> {
  try {
    const team1Score = parseFloat(context.team1Score || '0');
    const team2Score = parseFloat(context.team2Score || '0');
    const scoreDiff = Math.abs(team1Score - team2Score);

    const userIds = await getTeamMemberUserIds(db, [
      context.team1Id,
      context.team2Id,
    ]);

    logger.info('Sending close game notifications', {
      matchupId: context.matchupId,
      scoreDiff,
      userCount: userIds.length,
    });

    for (const userId of userIds) {
      // Check user's close game threshold preference
      const prefs = await getUserNotificationPreferences(db, userId);
      if (!prefs.matchupCloseGameEnabled) {
        continue;
      }

      const threshold = parseFloat(prefs.closeGameThreshold || '5.0');
      if (scoreDiff > threshold) {
        continue;
      }

      await sendNotificationToUser(db, {
        userId,
        notificationType: 'matchup_close_game',
        channel: 'push',
        matchupId: context.matchupId,
        leagueId: context.leagueId,
        title: 'Close Matchup!',
        message: `Your week ${context.weekNumber} matchup is close! Current score: ${context.team1Score} - ${context.team2Score}`,
        metadata: {
          matchupId: context.matchupId,
          weekNumber: context.weekNumber,
          team1Score: context.team1Score,
          team2Score: context.team2Score,
          scoreDiff,
        },
      });
    }
  } catch (error: unknown) {
    logger.error('Error sending close game notifications', { error });
    throw error;
  }
}

/**
 * Send a notification to a specific user
 */
async function sendNotificationToUser(
  db: PublicDb,
  notificationInput: CreateNotificationInput,
): Promise<void> {
  try {
    const userId = notificationInput.userId;
    // Get user preferences
    const prefs = await getUserNotificationPreferences(db, userId);

    // Check if notification type is enabled
    const typeEnabled = getNotificationTypeEnabled(
      prefs,
      notificationInput.notificationType,
    );

    if (!typeEnabled) {
      logger.debug('Notification type disabled for user', {
        userId,
        notificationType: notificationInput.notificationType,
      });
      return;
    }

    // Check if push notifications are enabled
    if (!prefs.pushEnabled) {
      logger.debug('Push notifications disabled for user', { userId });
      return;
    }

    // Get user's device tokens
    const deviceTokens = await getUserDeviceTokens(db, userId);

    if (deviceTokens.length === 0) {
      logger.debug('No device tokens found for user', { userId });
      // Still create history record for in-app notification
      await createNotificationHistory(db, {
        ...notificationInput,
        channel: 'in_app',
      });
      return;
    }

    // Send push notification to all devices
    const pushPromises = deviceTokens.map(async (token) => {
      if (!token.endpointArn) {
        logger.warn('Device token missing endpoint ARN', {
          userId,
          tokenId: token.id,
        });
        return;
      }

      try {
        await sendPushNotification({
          endpointArn: token.endpointArn,
          title: notificationInput.title,
          message: notificationInput.message,
          data: notificationInput.metadata,
        });
      } catch (error: unknown) {
        logger.error('Failed to send push notification to device', {
          error,
          userId,
          tokenId: token.id,
        });
      }
    });

    await Promise.allSettled(pushPromises);

    // Create notification history record
    await createNotificationHistory(db, notificationInput);

    logger.info('Notification sent to user', {
      userId,
      notificationType: notificationInput.notificationType,
      deviceCount: deviceTokens.length,
    });
  } catch (error: unknown) {
    logger.error('Error sending notification to user', {
      error,
      userId: notificationInput.userId,
    });
    throw error;
  }
}

/**
 * Check if notification type is enabled for user
 */
function getNotificationTypeEnabled(
  prefs: Awaited<ReturnType<typeof getUserNotificationPreferences>>,
  notificationType: CreateNotificationInput['notificationType'],
): boolean {
  switch (notificationType) {
    case 'matchup_started':
      return prefs.matchupStartedEnabled;
    case 'matchup_ended':
      return prefs.matchupEndedEnabled;
    case 'matchup_close_game':
      return prefs.matchupCloseGameEnabled;
    case 'matchup_reminder':
      return prefs.matchupReminderEnabled;
    default:
      return false;
  }
}

/**
 * Get user IDs for team members (placeholder - needs actual implementation)
 * @param _db - Database client (unused in placeholder)
 * @param _teamIds - Team IDs (unused in placeholder)
 * @returns Empty array until implementation is complete
 */
function getTeamMemberUserIds(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _db: PublicDb,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _teamIds: number[],
): Promise<number[]> {
  // TODO: Implement actual team member query
  // For now, return empty array
  logger.warn('getTeamMemberUserIds not implemented - returning empty array');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return Promise.resolve([]);
}

/**
 * Get user's team ID in a league (placeholder - needs actual implementation)
 * @param _db - Database client (unused in placeholder)
 * @param _userId - User ID (unused in placeholder)
 * @param _leagueId - League ID (unused in placeholder)
 * @returns Null until implementation is complete
 */
function getUserTeamId(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _db: PublicDb,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _userId: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _leagueId: number,
): Promise<number | null> {
  // TODO: Implement actual user team query
  logger.warn('getUserTeamId not implemented - returning null');
  return Promise.resolve(null);
}
