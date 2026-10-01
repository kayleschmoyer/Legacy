/**
 * Surface the underlying database error hidden behind Drizzle's wrapper
 * (LS-10330).
 *
 * Drizzle rethrows every failed statement as `DrizzleQueryError` whose
 * `message` is only `Failed query: <sql>` with the parameters. The real
 * Postgres error — SQLSTATE `code`, `detail`, `constraint`, `table`, `hint` —
 * lives on `error.cause` (a `pg` `DatabaseError`), which neither the GraphQL
 * `formatError` log line nor Rollbar's stack capture ever included. An
 * `updateDraftSettings` INTERNAL_SERVER_ERROR therefore read as an opaque
 * "Failed query: insert into drafts …" when the actual cause was an FK
 * violation against a league that a concurrent test run had just deleted.
 */

/** Fields lifted from `pg`'s `DatabaseError` when present. */
const PG_ERROR_FIELDS = [
  'code',
  'detail',
  'hint',
  'constraint',
  'table',
  'schema',
  'column',
  'severity',
  'routine',
] as const;

export interface DescribedCause {
  name?: string;
  message: string;
  code?: string;
  detail?: string;
  hint?: string;
  constraint?: string;
  table?: string;
  schema?: string;
  column?: string;
  severity?: string;
  routine?: string;
  /** Nested cause, when the chain continues (bounded by MAX_CAUSE_DEPTH). */
  cause?: DescribedCause;
}

function safeJson(value: Record<string, unknown>): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable cause]';
  }
}

function primitiveMessage(value: unknown): string {
  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
    case 'boolean':
    case 'bigint':
      return String(value);
    case 'symbol':
      return value.description ?? 'Symbol()';
    default:
      return typeof value;
  }
}

/** How many `.cause` hops to follow before giving up (guards against cycles). */
export const MAX_CAUSE_DEPTH = 3;

function describeOne(value: unknown): DescribedCause | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'object') {
    // Primitive cause (string/number/etc.) — its own string form is the message.
    return { message: primitiveMessage(value) };
  }
  const record = value as Record<string, unknown>;
  const described: DescribedCause = {
    message:
      typeof record.message === 'string'
        ? record.message
        : // Non-Error object without a message: fall back to a JSON snapshot
          // rather than "[object Object]" so the log line stays informative.
          safeJson(record),
  };
  if (typeof record.name === 'string') described.name = record.name;
  for (const field of PG_ERROR_FIELDS) {
    const fieldValue = record[field];
    if (typeof fieldValue === 'string' && fieldValue.length > 0) {
      described[field] = fieldValue;
    }
  }
  return described;
}

/**
 * Describe `error.cause` (and its own causes, up to `MAX_CAUSE_DEPTH` deep) as
 * a plain, log-safe object. Returns `undefined` when the error carries no
 * cause so callers can spread it into a context object without adding noise
 * for ordinary errors.
 */
export function describeErrorCause(
  error: unknown,
  depth: number = MAX_CAUSE_DEPTH,
): DescribedCause | undefined {
  if (depth <= 0 || error == null || typeof error !== 'object') {
    return undefined;
  }
  const cause = (error as { cause?: unknown }).cause;
  if (cause == null || cause === error) return undefined;
  const described = describeOne(cause);
  if (!described) return undefined;
  const nested = describeErrorCause(cause, depth - 1);
  if (nested) described.cause = nested;
  return described;
}
