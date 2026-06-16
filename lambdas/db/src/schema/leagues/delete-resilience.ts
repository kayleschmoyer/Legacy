/**
 * League-delete resilience helpers (LS-8100).
 *
 * Drizzle wraps the underlying postgres.js driver error in `error.cause` and
 * sets its own message to `Failed query: <sql>\nparams: …`, which discards the
 * SQLSTATE, constraint name, and detail line. That made the `deleteAllLeagues`
 * Rollbar reports undiagnosable (the real cause never left the Lambda). These
 * helpers pull the driver fields back out and identify transient failures
 * (deadlock / lock-timeout) that are worth retrying.
 */

/**
 * Postgres SQLSTATE codes for transient failures that can occur mid-cascade and
 * succeed on a retry: deadlock detected, serialization failure, and
 * lock-not-available (statement hit `lock_timeout`).
 */
export const RETRYABLE_PG_CODES = new Set(['40P01', '40001', '55P03']);

export interface DbErrorDetail {
  message: string;
  code?: string;
  detail?: string;
  constraint?: string;
  table?: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Extract the underlying Postgres error fields from a (possibly Drizzle-wrapped)
 * error. Looks at `error.cause` first (where Drizzle stores the driver error),
 * then falls back to the error's own properties when the driver error is thrown
 * directly. postgres.js exposes PG fields as `code`, `detail`, `constraint_name`,
 * `table_name`; older/other drivers use `constraint`/`table`, so both are read.
 */
export function describeDbError(error: unknown): DbErrorDetail {
  const top = error instanceof Error ? error : new Error(String(error));
  const source =
    asRecord((top as { cause?: unknown }).cause) ?? asRecord(top) ?? {};
  return {
    message: top.message,
    code: nonEmptyString(source.code),
    detail: nonEmptyString(source.detail),
    constraint:
      nonEmptyString(source.constraint_name) ??
      nonEmptyString(source.constraint),
    table: nonEmptyString(source.table_name) ?? nonEmptyString(source.table),
  };
}

/** True when the error is a transient Postgres failure worth retrying. */
export function isRetryablePgError(error: unknown): boolean {
  return RETRYABLE_PG_CODES.has(describeDbError(error).code ?? '');
}

/** Render a DbErrorDetail into a single, log/throw-friendly line. */
export function formatDbError(detail: DbErrorDetail): string {
  const parts = [detail.message];
  if (detail.code) parts.push(`[code ${detail.code}]`);
  if (detail.constraint) parts.push(`[constraint ${detail.constraint}]`);
  if (detail.table) parts.push(`[table ${detail.table}]`);
  if (detail.detail) parts.push(`[detail ${detail.detail}]`);
  return parts.join(' ');
}

export interface TransientRetryOptions {
  /** Max attempts including the first try. Default 3. */
  maxAttempts?: number;
  /** Called before each retry (not before the first attempt). */
  onRetry?: (attempt: number, detail: DbErrorDetail) => void;
  /** Backoff before retry `n` (1-based). Default: 25ms * n. Injectable for tests. */
  delay?: (attempt: number) => Promise<void>;
}

const defaultDelay = (attempt: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 25 * attempt));

/**
 * Run `op`, retrying only on transient Postgres errors (deadlock / lock-timeout
 * / serialization). Non-transient errors and the final attempt's error are
 * rethrown unchanged so the caller still sees the real cause.
 */
export async function withTransientRetry<T>(
  op: () => Promise<T>,
  options: TransientRetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const delay = options.delay ?? defaultDelay;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await op();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts && isRetryablePgError(error)) {
        options.onRetry?.(attempt, describeDbError(error));
        await delay(attempt);
        continue;
      }
      throw error;
    }
  }
  // Unreachable (loop either returns or throws), but satisfies the type checker.
  throw lastError;
}
