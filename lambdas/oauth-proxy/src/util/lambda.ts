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
  LOGGER.debug('Processing event', {
    httpMethod: event.httpMethod,
    path: event.path,
  });

  if (!event.body) {
    throw new Error('Could not retrieve event body');
  }

  const raw: unknown = JSON.parse(event.body);

  if (schema) {
    return schema.parse(raw);
  }

  return raw as T;
}

const SAFE_HEADER_ALLOWLIST = new Set([
  'user-agent',
  'x-forwarded-for',
  'x-forwarded-proto',
  'x-amzn-trace-id',
  'content-type',
  'content-length',
]);

/**
 * Return a copy of API Gateway headers containing only an allowlist of
 * non-sensitive fields. Strips Cookie, Authorization, and any unrecognized
 * header that could carry credentials. Lookup is case-insensitive; output
 * keys are normalized to lowercase.
 */
export function sanitizeHeaders(
  headers: APIGatewayEvent['headers'] | null | undefined,
): Record<string, string> {
  if (!headers) {
    return {};
  }
  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (SAFE_HEADER_ALLOWLIST.has(lower)) {
      safe[lower] = value;
    }
  }
  return safe;
}
