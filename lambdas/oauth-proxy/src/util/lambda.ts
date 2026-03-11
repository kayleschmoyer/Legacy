import { LOGGER } from '@legacy-sports/logging';
import { APIGatewayEvent } from 'aws-lambda';
import { ZodType } from 'zod';

export function parseEventBody<T>(event: APIGatewayEvent): T;
export function parseEventBody<T>(
  event: APIGatewayEvent,
  schema: ZodType<T>,
): T;
export function parseEventBody<T>(
  event: APIGatewayEvent,
  schema?: ZodType<T>,
): T {
  LOGGER.debug('Processing event', { event });

  if (!event.body) {
    throw new Error('Could not retrieve event body');
  }

  const raw: unknown = JSON.parse(event.body);

  if (schema) {
    return schema.parse(raw);
  }

  return raw as T;
}
