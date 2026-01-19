// Lambda entry point for AWS - routes to appropriate handler based on message type
import { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import { handler as careerHandler } from './load-career';
import { handler as gameHandler } from './load-game';

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
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

    const firstMessage: unknown = JSON.parse(body);

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
    return {
      batchItemFailures: event.Records.map((r) => ({
        itemIdentifier: r.messageId,
      })),
    };
  } catch (error) {
    LOGGER.error('Failed to route message', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      recordsCount: event.Records.length,
      firstRecordBody: event.Records[0]?.body?.substring(0, 200),
    });
    return {
      batchItemFailures: event.Records.map((r) => ({
        itemIdentifier: r.messageId,
      })),
    };
  }
};
