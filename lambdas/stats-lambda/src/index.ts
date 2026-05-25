// Lambda entry point for AWS - routes to appropriate handler based on message type
import { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import {
  addBreadcrumb,
  captureError,
  getRollbarConfigFromEnv,
  initRollbar,
  withRollbar,
} from '@legacy-sports/rollbar';
import { formatVersionInfo, getVersionInfo } from '@legacy-sports/utils/node';
import { handler as careerHandler } from './load-career';
import { handler as gameHandler } from './load-game';
import {
  isMlbStatsMessage,
  handler as mlbStatsHandler,
} from './load-mlb-stats';
import {
  handler as footballGameHandler,
  isFootballGameMessage,
} from './load-football-game';
import {
  handler as footballSeasonHandler,
  isFootballSeasonMessage,
} from './load-football-season';
import {
  handler as footballScoreHandler,
  isFootballScoreMessage,
} from './handlers/calculate-football-matchup-scores';

// Initialize Rollbar
const rollbarConfig = getRollbarConfigFromEnv();
if (rollbarConfig) {
  initRollbar(rollbarConfig);
}

// Log version information on cold start
const versionInfo = getVersionInfo('legacy-sports-stats-lambda');
LOGGER.info('Stats Lambda initialized', {
  versionFormatted: formatVersionInfo(versionInfo),
  ...versionInfo,
});

const baseHandler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  addBreadcrumb('Processing stats lambda event', {
    recordsCount: event.Records.length,
  });

  // Detect message type from first record
  if (event.Records.length === 0) {
    return { batchItemFailures: [] };
  }

  try {
    const body = event.Records[0].body;
    LOGGER.debug('Received message body', {
      bodyType: typeof body,
      bodyLength: body?.length,
      bodyPreview: body?.substring(0, 200),
      firstChar: body?.[0],
      firstCharCode: body?.[0]?.charCodeAt(0),
    });
    addBreadcrumb('Parsed message body', { bodyLength: body?.length });

    const firstMessage: unknown = JSON.parse(body);

    // MLB provider stats messages have type: 'mlb-player-stats'
    if (isMlbStatsMessage(firstMessage)) {
      LOGGER.debug('Routing to MLB stats handler');
      return mlbStatsHandler(event);
    }

    // Football game stats messages have type: 'football-game-stats'
    if (isFootballGameMessage(firstMessage)) {
      LOGGER.debug('Routing to football game stats handler');
      return footballGameHandler(event);
    }

    // Football season stats messages have type: 'football-season-stats'
    if (isFootballSeasonMessage(firstMessage)) {
      LOGGER.debug('Routing to football season stats handler');
      return footballSeasonHandler(event);
    }

    // Football score calculation messages have type: 'football-calculate-scores'
    if (isFootballScoreMessage(firstMessage)) {
      LOGGER.debug('Routing to football score calculation handler');
      return footballScoreHandler(event);
    }

    // NEW: Matchup stats messages have matchupId and players array
    if (
      typeof firstMessage === 'object' &&
      firstMessage !== null &&
      'matchupId' in firstMessage &&
      'players' in firstMessage
    ) {
      LOGGER.debug('Routing to game stats handler (matchup format)');
      return await gameHandler(event);
    }

    // OLD: Individual game stats messages have statType field (legacy format)
    if (
      typeof firstMessage === 'object' &&
      firstMessage !== null &&
      'statType' in firstMessage &&
      'gameNum' in firstMessage
    ) {
      LOGGER.debug('Routing to game stats handler (legacy format)');
      return await gameHandler(event);
    }

    // Career stats messages are just a brefId string
    if (typeof firstMessage === 'string') {
      LOGGER.debug('Routing to career stats handler');
      return await careerHandler(event);
    }

    LOGGER.error('Unknown message format', { firstMessage });
    const unknownFormatError = new Error('Unknown message format');
    captureError(unknownFormatError, {
      messageFormat: firstMessage,
      recordsCount: event.Records.length,
    });
    return {
      batchItemFailures: event.Records.map((r) => ({
        itemIdentifier: r.messageId,
      })),
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    LOGGER.error('Failed to route message', {
      error: err.message,
      stack: err.stack,
      recordsCount: event.Records.length,
      firstRecordBody: event.Records[0]?.body?.substring(0, 200),
    });
    captureError(err, {
      context: 'stats-lambda-routing',
      recordsCount: event.Records.length,
    });
    return {
      batchItemFailures: event.Records.map((r) => ({
        itemIdentifier: r.messageId,
      })),
    };
  }
};

export const handler = withRollbar(baseHandler);
