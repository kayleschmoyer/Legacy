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

// Postgres driver error fields worth surfacing. Both node-postgres and
// postgres.js expose `code` (the SQLSTATE) plus these descriptive fields on
// their error objects; each is emitted as `pg<Field>` when present.
const PG_ERROR_FIELDS = [
  'code',
  'severity',
  'routine',
  'detail',
  'hint',
  'schema',
  'table',
  'column',
  'constraint',
] as const;

/**
 * Flatten a handler error — and every `.cause` beneath it — into a plain object
 * for logging (LS-7935, hardened in LS-8008).
 *
 * Drizzle wraps every failed query in a `DrizzleQueryError` whose `message` is
 * only `"Failed query: <sql>"`. The originating Postgres error (connection
 * reset, statement timeout, `undefined_column`, "too many clients", …) carries
 * the actionable SQLSTATE `code`/`severity`/`detail`/`routine`.
 *
 * The original LS-7935 implementation read only `error.cause`, but in
 * production these `Failed query` 500s arrived with `cause === undefined`
 * (LS-8008) — so it emitted nothing and the real Postgres failure stayed
 * invisible in CloudWatch. This version is robust to where the pg fields
 * actually live:
 *   - it walks the full `error → error.cause → …` chain (guarding against
 *     cycles) and inspects the top-level error itself, so a pg error thrown
 *     directly (no Drizzle wrapper) is handled identically to a wrapped one;
 *   - it extracts the SQLSTATE fields from whichever level carries a `code`;
 *   - it always preserves the originating `message` and `stack`, so even a
 *     fully opaque error (no structured pg fields anywhere) is still
 *     diagnosable from the single log line.
 *
 * The logger's serializer JSON-stringifies object args but drops `undefined`
 * fields, so absent fields are simply omitted rather than logged as noise.
 */
export function describeErrorCause(error: unknown): Record<string, unknown> {
  // Walk error -> error.cause -> ... collecting every Error in the chain.
  const chain: Error[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    current = (current as Error & { cause?: unknown }).cause;
  }

  if (chain.length === 0) {
    // Non-Error throw (string, plain object, …). Keep strings verbatim;
    // JSON-stringify anything else to avoid the "[object Object]" coercion.
    return {
      cause: typeof error === 'string' ? error : JSON.stringify(error),
    };
  }

  // The Postgres driver error is the deepest level exposing a SQLSTATE `code`;
  // fall back to the innermost error in the chain when none expose one (the
  // genuinely opaque case — at least its message/stack are still surfaced).
  const pgError =
    chain.find((e) => typeof (e as { code?: unknown }).code === 'string') ??
    chain[chain.length - 1];
  const pg = pgError as Error & Record<string, unknown>;

  const result: Record<string, unknown> = {
    causeName: pg.name,
    causeMessage: pg.message,
    // Last-resort diagnosability when no structured pg fields are present.
    causeStack: pg.stack,
  };
  for (const field of PG_ERROR_FIELDS) {
    const value = pg[field];
    if (value !== undefined && value !== null) {
      result[`pg${field[0].toUpperCase()}${field.slice(1)}`] = value;
    }
  }
  return result;
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
