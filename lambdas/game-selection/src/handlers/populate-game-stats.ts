import { EventBridgeEvent } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import {
  addBreadcrumb,
  getSentryConfigFromEnv,
  initSentry,
  withSentry,
} from '@legacy-sports/sentry';

// Initialize Sentry
const sentryConfig = getSentryConfigFromEnv();
if (sentryConfig) {
  initSentry(sentryConfig);
}

export type PopulateGameStatsEvent = EventBridgeEvent<
  'populate-game-stats',
  Record<string, never>
>;

/**
 * Legacy handler — stats are now bulk-loaded by stats-lambda and games are
 * selected by game_identifier in season-game-selector.  This handler is
 * retained only as a no-op entry point so any existing EventBridge rule
 * doesn't fail.
 */
const basePopulateGameStatsHandler = (
  event: PopulateGameStatsEvent,
): Record<string, never> => {
  addBreadcrumb('populate-game-stats invoked (no-op)', {
    eventSource: event.source,
    detailType: event['detail-type'],
  });

  LOGGER.info(
    'populate-game-stats is deprecated — stats are now loaded via stats-lambda SQS flow',
  );

  return {};
};

export const handler = withSentry(basePopulateGameStatsHandler);
