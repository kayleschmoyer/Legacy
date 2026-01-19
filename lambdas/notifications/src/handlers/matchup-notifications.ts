import { EventBridgeEvent } from 'aws-lambda';
import memoizeOne from 'memoize-one';
import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils';
import { getDbConnection, PublicSchema } from '@legacy-sports/db-client';
import {
  type MatchupNotificationContext,
  sendCloseGameNotifications,
  sendMatchupEndedNotifications,
  sendMatchupStartedNotifications,
} from '../services/notification-service';

// Initialize database connection (memoized)
const getDb = memoizeOne(async () => {
  const opts = getDbOptions();
  const connection = getDbConnection(opts, PublicSchema);
  await connection.initialize();
  return connection;
});

/**
 * Event payload for matchup notifications
 */
interface MatchupNotificationEvent {
  type: 'matchup_started' | 'matchup_ended' | 'matchup_close_game';
  matchupId: number;
  leagueId: number;
  team1Id: number;
  team2Id: number;
  team1Score?: string;
  team2Score?: string;
  weekNumber: number;
}

/**
 * Main Lambda handler for matchup notifications
 * Can be triggered by EventBridge or manually
 */
export async function handler(
  event: EventBridgeEvent<string, MatchupNotificationEvent>,
): Promise<{ statusCode: number; body: string }> {
  LOGGER.info('Processing matchup notification event', {
    type: event['detail-type'],
    source: event.source,
  });

  try {
    const dbClient = await getDb();
    const notification = event.detail;

    const context: MatchupNotificationContext = {
      matchupId: notification.matchupId,
      leagueId: notification.leagueId,
      team1Id: notification.team1Id,
      team2Id: notification.team2Id,
      team1Score: notification.team1Score,
      team2Score: notification.team2Score,
      weekNumber: notification.weekNumber,
    };

    switch (notification.type) {
      case 'matchup_started':
        await sendMatchupStartedNotifications(dbClient.db, context);
        break;
      case 'matchup_ended':
        await sendMatchupEndedNotifications(dbClient.db, context);
        break;
      case 'matchup_close_game':
        await sendCloseGameNotifications(dbClient.db, context);
        break;
      default:
        LOGGER.warn('Unknown notification type', { type: notification.type });
    }

    LOGGER.info('Matchup notification processed successfully', {
      type: notification.type,
      matchupId: notification.matchupId,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Notifications sent successfully' }),
    };
  } catch (error: unknown) {
    LOGGER.error('Error processing matchup notification', { error });
    throw error;
  }
}
