import { getRollbarToken } from './auth.js';
import type { RollbarEnvelope } from './types.js';

/** Base URL for the Rollbar REST API (v1). */
export const ROLLBAR_API_BASE = 'https://api.rollbar.com/api/1';

/**
 * Determine whether a fetch error represents a transient connection issue
 * (ECONNRESET, ECONNREFUSED, ETIMEDOUT, fetch failures) that warrants a retry.
 */
function isConnectionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  const cause = (err as Error & { cause?: unknown }).cause;
  const causeCode =
    cause !== null &&
    typeof cause === 'object' &&
    'code' in cause &&
    typeof cause.code === 'string'
      ? cause.code
      : '';
  return (
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('etimedout') ||
    msg.includes('enotfound') ||
    msg.includes('und_err_connect_timeout') ||
    msg.includes('socket hang up') ||
    msg.includes('network error') ||
    msg.includes('fetch failed') ||
    causeCode === 'ECONNRESET' ||
    causeCode === 'ECONNREFUSED' ||
    causeCode === 'ETIMEDOUT' ||
    causeCode === 'ENOTFOUND' ||
    causeCode === 'UND_ERR_SOCKET' ||
    causeCode === 'UND_ERR_CONNECT_TIMEOUT'
  );
}

/** Truncate API error bodies and redact potential access tokens. */
function sanitizeErrorBody(text: string, maxLen = 500): string {
  let sanitized = text
    .replace(/Bearer\s+[A-Za-z0-9_\-.]+/gi, 'Bearer ***')
    .replace(/[a-f0-9]{32}/gi, '***');
  if (sanitized.length > maxLen) {
    const suffix = '... (truncated)';
    sanitized = sanitized.slice(0, maxLen - suffix.length) + suffix;
  }
  return sanitized;
}

interface RollbarRequestOptions {
  /** Path under the API base, e.g. `/items`. */
  path: string;
  /** Query string parameters (omit entries whose value is undefined). */
  query?: Record<string, string | number | undefined>;
}

/**
 * Error thrown when the Rollbar API rejects a write with 401/403 — typically
 * because the project access token lacks the `write` scope. Callers can catch
 * this to surface an actionable scope hint instead of a generic API error.
 */
export class RollbarWriteScopeError extends Error {
  readonly status: number;
  constructor(status: number, body: string) {
    super(
      `Rollbar API rejected the write with HTTP ${status} — the token in ` +
        `${ROLLBAR_READ_TOKEN_SECRET_NAME_HINT} likely lacks the "write" scope. ` +
        `Rotate it for a token with both "read" and "write" scopes ` +
        `(Rollbar → Project Settings → Access Tokens). Response: ${sanitizeErrorBody(body)}`,
    );
    this.status = status;
    this.name = 'RollbarWriteScopeError';
  }
}

const ROLLBAR_READ_TOKEN_SECRET_NAME_HINT =
  'dev/rollbar-read-access-token (ROLLBAR_READ_TOKEN_SECRET_NAME)';

/** Execute a single GET against the Rollbar API and unwrap its envelope. */
async function rollbarGetOnce<T>(opts: RollbarRequestOptions): Promise<T> {
  const token = await getRollbarToken();

  let url = `${ROLLBAR_API_BASE}${opts.path}`;
  if (opts.query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(opts.query)) {
      if (value !== undefined && value !== '') {
        params.append(key, String(value));
      }
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Rollbar-Access-Token': token,
      Accept: 'application/json',
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Rollbar API GET ${opts.path} failed (${response.status}): ${sanitizeErrorBody(text)}`,
    );
  }

  let envelope: RollbarEnvelope<T>;
  try {
    envelope = JSON.parse(text) as RollbarEnvelope<T>;
  } catch {
    throw new Error(
      `Rollbar API GET ${opts.path} returned non-JSON response: ${sanitizeErrorBody(text)}`,
    );
  }

  if (envelope.err !== 0) {
    throw new Error(
      `Rollbar API GET ${opts.path} returned err=${envelope.err}: ${envelope.message ?? 'unknown error'}`,
    );
  }

  return envelope.result as T;
}

/**
 * Make an authenticated GET request to the Rollbar REST API, unwrapping the
 * `{ err, result }` envelope. Retries once on transient connection errors —
 * safe because all calls in this server are read-only GETs with no side effects.
 */
export async function rollbarGet<T>(opts: RollbarRequestOptions): Promise<T> {
  try {
    return await rollbarGetOnce<T>(opts);
  } catch (err) {
    if (!isConnectionError(err)) throw err;
    process.stderr.write(
      `[legacy-sports-rollbar] Connection error on GET ${opts.path}. Retrying…\n`,
    );
    return rollbarGetOnce<T>(opts);
  }
}

interface RollbarPatchOptions {
  /** Path under the API base, e.g. `/item/12345/`. */
  path: string;
  /** JSON body to send. */
  body: Record<string, unknown>;
}

/**
 * Execute an authenticated PATCH against the Rollbar REST API and unwrap its
 * envelope. Throws {@link RollbarWriteScopeError} on 401/403 so callers can
 * surface an actionable "token lacks write scope" hint. Not retried — PATCH is
 * not idempotent in the general case, even though Rollbar's status mutation is.
 */
export async function rollbarPatch<T>(opts: RollbarPatchOptions): Promise<T> {
  const token = await getRollbarToken();

  const url = `${ROLLBAR_API_BASE}${opts.path}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'X-Rollbar-Access-Token': token,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(opts.body),
  });

  const text = await response.text();

  if (response.status === 401 || response.status === 403) {
    throw new RollbarWriteScopeError(response.status, text);
  }

  if (!response.ok) {
    throw new Error(
      `Rollbar API PATCH ${opts.path} failed (${response.status}): ${sanitizeErrorBody(text)}`,
    );
  }

  let envelope: RollbarEnvelope<T>;
  try {
    envelope = JSON.parse(text) as RollbarEnvelope<T>;
  } catch {
    throw new Error(
      `Rollbar API PATCH ${opts.path} returned non-JSON response: ${sanitizeErrorBody(text)}`,
    );
  }

  if (envelope.err !== 0) {
    throw new Error(
      `Rollbar API PATCH ${opts.path} returned err=${envelope.err}: ${envelope.message ?? 'unknown error'}`,
    );
  }

  return envelope.result as T;
}
