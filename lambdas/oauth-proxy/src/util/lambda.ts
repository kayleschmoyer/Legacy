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

/**
 * Build the externally-reachable base URL for the current request from the API
 * Gateway context, e.g. `https://api.example.com/prod`. Used to construct links
 * (such as password-reset URLs) that point back at the proxy's own endpoints.
 */
export function getRequestBaseUrl(event: APIGatewayEvent): string {
  const { domainName, stage } = event.requestContext;
  return `https://${domainName}/${stage}`;
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
 * Flatten the underlying cause of a handler error into a plain object for
 * logging (LS-7935).
 *
 * Drizzle wraps every failed query in a `DrizzleQueryError` whose `message` is
 * only `"Failed query: <sql>"` — the originating Postgres error (connection
 * reset, statement timeout, Aurora resume, "too many clients", …) is attached
 * as `cause` and carries the actionable fields (`code`, `severity`, `routine`,
 * `detail`). The logger's serializer only preserves `name`/`message`/`stack`
 * on `Error` instances, so a bare `cause` Error would still drop `code`; this
 * returns a flat object whose primitive fields always survive serialization.
 */
export function describeErrorCause(error: unknown): Record<string, unknown> {
  const cause =
    error instanceof Error
      ? (error as Error & { cause?: unknown }).cause
      : undefined;

  if (cause == null) {
    return { cause: cause === null ? null : undefined };
  }

  if (cause instanceof Error) {
    const pg = cause as Error & {
      code?: string;
      detail?: string;
      severity?: string;
      routine?: string;
    };
    return {
      causeName: pg.name,
      causeMessage: pg.message,
      pgCode: pg.code,
      pgSeverity: pg.severity,
      pgRoutine: pg.routine,
      pgDetail: pg.detail,
    };
  }

  // Non-Error cause (defensive): pg/drizzle always attach an Error, so this is
  // a fallback. Keep strings verbatim; JSON-stringify anything else to avoid
  // the "[object Object]" default coercion.
  if (typeof cause === 'string') {
    return { cause };
  }
  return { cause: JSON.stringify(cause) };
}

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
