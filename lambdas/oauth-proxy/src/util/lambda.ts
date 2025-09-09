import { LOGGER } from '@legacy-sports/logging';
import { APIGatewayEvent } from 'aws-lambda';

export function parseEventBody<T>(event: APIGatewayEvent): T {
  LOGGER.debug('Processing event', { event });

  if (!event.body) {
    throw new Error('Could not retrieve event body');
  }

  return JSON.parse(event.body) as T;
}
