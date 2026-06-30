import { getToken, invalidateToken } from './auth.js';

const BASE_URL = 'https://api.github.com';
const API_VERSION = '2022-11-28';

/** Truncate API error bodies and redact potential auth tokens. */
function sanitizeErrorBody(text: string, maxLen = 500): string {
  let sanitized = text
    .replace(/Bearer\s+[A-Za-z0-9_\-.]+/gi, 'Bearer ***')
    .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, 'Basic ***')
    .replace(/token\s+[A-Za-z0-9_\-.]+/gi, 'token ***')
    .replace(/ghp_[A-Za-z0-9_]+/g, 'ghp_***')
    .replace(/gho_[A-Za-z0-9_]+/g, 'gho_***')
    .replace(/ghs_[A-Za-z0-9_]+/g, 'ghs_***')
    .replace(/ghu_[A-Za-z0-9_]+/g, 'ghu_***')
    .replace(/github_pat_[A-Za-z0-9_]+/g, 'github_pat_***');
  if (sanitized.length > maxLen) {
    const suffix = '... (truncated)';
    sanitized = sanitized.slice(0, maxLen - suffix.length) + suffix;
  }
  return sanitized;
}

interface RestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  query?: Record<string, string>;
}

/**
 * Max attempts to retry a request that hit a GitHub *secondary* rate limit
 * (a.k.a. abuse-detection throttle), distinct from the primary hourly quota.
 * Secondary limits fire on short bursts of content-creating requests — e.g.
 * many agents opening PRs and applying labels at the same time — and GitHub
 * signals them with a 403/429 plus a `Retry-After` header. Without a retry
 * these surface as a hard failure; for best-effort callers (e.g. the
 * `bot:ready-for-review` label apply) that failure is swallowed, leaving the
 * PR silently un-labeled and the merge queue stuck on a never-registered
 * `bot-review` check. See LS-8274 / `.github/workflows/review.yml`.
 */
const MAX_SECONDARY_RATE_LIMIT_RETRIES = 3;

/**
 * Decide whether a non-OK response is a *secondary* rate limit (retryable),
 * as opposed to the primary quota (handled separately via
 * `x-ratelimit-remaining=0`). GitHub returns 403 or 429 with a `Retry-After`
 * header and/or a body mentioning the secondary limit / abuse detection.
 */
function isSecondaryRateLimit(status: number, body: string): boolean {
  if (status !== 403 && status !== 429) return false;
  return /secondary rate limit|abuse detection mechanism/i.test(body);
}

/**
 * Backoff for a secondary-rate-limit retry. Honors the server's `Retry-After`
 * header (seconds) when present, otherwise falls back to exponential backoff
 * (1s, 2s, 4s …). Capped at 60s so a misbehaving header can't hang the call.
 */
function secondaryRateLimitBackoffMs(
  retryAfter: string | null,
  attempt: number,
): number {
  if (retryAfter !== null) {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs) && secs >= 0) {
      return Math.min(secs * 1_000, 60_000);
    }
  }
  return Math.min(1_000 * 2 ** attempt, 60_000);
}

/**
 * Shared secondary-rate-limit handler for both REST and GraphQL transports.
 * If `response` is a retryable secondary rate limit and the attempt budget
 * isn't exhausted, waits the appropriate backoff and returns `true` (caller
 * should re-issue the request with `secondaryRetries + 1`); otherwise returns
 * `false`. Keeps the detect → backoff → log → sleep sequence in one place —
 * the recursion itself stays in each caller since their signatures differ.
 */
async function handleSecondaryRateLimit(
  response: Response,
  body: string,
  secondaryRetries: number,
  context: string,
): Promise<boolean> {
  if (
    !isSecondaryRateLimit(response.status, body) ||
    secondaryRetries >= MAX_SECONDARY_RATE_LIMIT_RETRIES
  ) {
    return false;
  }
  const waitMs = secondaryRateLimitBackoffMs(
    response.headers.get('retry-after'),
    secondaryRetries,
  );
  process.stderr.write(
    `[github-api:secondary-rate-limit] ${context} ` +
      `retry ${secondaryRetries + 1}/${MAX_SECONDARY_RATE_LIMIT_RETRIES} after ${waitMs}ms\n`,
  );
  await new Promise((r) => setTimeout(r, waitMs));
  return true;
}

async function buildHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': API_VERSION,
    'Content-Type': 'application/json',
  };
}

/**
 * Log GitHub rate-limit headers from a response for observability.
 * Writes to stderr so it doesn't pollute MCP stdout (JSON protocol).
 */
function logRateLimit(headers: Headers, context: string): void {
  const remaining = headers.get('x-ratelimit-remaining');
  const used = headers.get('x-ratelimit-used');
  const limit = headers.get('x-ratelimit-limit');
  if (remaining !== null) {
    process.stderr.write(
      `[github-api:rate-limit] ${context} remaining=${remaining}/${limit} used=${used}\n`,
    );
  }
}

/**
 * Make an authenticated GitHub REST API request.
 *
 * - 401: invalidates token cache and retries once
 * - 502/503: retries once after 1 second
 * - Secondary rate limit (403/429 abuse throttle): retries with Retry-After backoff
 * - Primary rate limit (403 with x-ratelimit-remaining=0): includes reset time in error
 */
export async function githubRest<T>(opts: RestOptions): Promise<T> {
  return doRest<T>(opts, true, 0);
}

async function doRest<T>(
  opts: RestOptions,
  canRetry: boolean,
  secondaryRetries: number,
): Promise<T> {
  const headers = await buildHeaders();
  let url = `${BASE_URL}${opts.path}`;

  if (opts.query) {
    const params = new URLSearchParams(opts.query);
    url += `?${params.toString()}`;
  }

  const response = await fetch(url, {
    method: opts.method,
    headers,
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });

  // 401 — token invalid, invalidate and retry once
  if (response.status === 401 && canRetry) {
    await invalidateToken();
    return doRest<T>(opts, false, secondaryRetries);
  }

  // 502/503 — transient, retry once after 1s
  if ((response.status === 502 || response.status === 503) && canRetry) {
    await new Promise((r) => setTimeout(r, 1_000));
    return doRest<T>(opts, false, secondaryRetries);
  }

  // Rate limit
  if (
    response.status === 403 &&
    response.headers.get('x-ratelimit-remaining') === '0'
  ) {
    const reset = response.headers.get('x-ratelimit-reset');
    const resetAt = reset
      ? new Date(Number(reset) * 1000).toISOString()
      : 'unknown';
    throw new Error(`GitHub API rate limit exceeded. Resets at ${resetAt}.`);
  }

  if (!response.ok) {
    const text = await response.text();
    const sanitized = sanitizeErrorBody(text);

    // Secondary rate limit (abuse-detection throttle) — distinct from the
    // primary quota handled above. Retry honoring Retry-After. This is the
    // failure mode that silently dropped the bot:ready-for-review label apply
    // during parallel PR bursts (LS-8274).
    if (
      await handleSecondaryRateLimit(
        response,
        text,
        secondaryRetries,
        `${opts.method} ${opts.path}`,
      )
    ) {
      return doRest<T>(opts, canRetry, secondaryRetries + 1);
    }

    // A 403 that reaches here is NOT a rate limit (that case is handled above) —
    // GitHub returns "Resource not accessible by integration" when a token WAS
    // provisioned and accepted but the GitHub App installation lacks the
    // repository permission governing this endpoint. Surface that explicitly so
    // it is not confused with the "no token provisioned" failure thrown by
    // getToken() (LS-5248).
    if (
      response.status === 403 &&
      /resource not accessible by integration/i.test(text)
    ) {
      throw new Error(
        `GitHub API ${opts.method} ${opts.path} failed (403): ${sanitized}. ` +
          'This is a missing GitHub App permission/scope, not a missing token — a ' +
          'token was provisioned and accepted. The Agent Author GitHub App installation ' +
          'lacks the repository permission governing this endpoint (e.g. "Commit ' +
          'statuses: Read" for /statuses, "Checks: Read" for /check-runs). Grant the ' +
          "permission in the App's settings and approve the updated installation, then retry.",
      );
    }
    throw new Error(
      `GitHub API ${opts.method} ${opts.path} failed (${response.status}): ${sanitized}`,
    );
  }

  logRateLimit(response.headers, `${opts.method} ${opts.path}`);

  // DELETE returns 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

/**
 * Make an authenticated GET to the GitHub REST API, returning raw bytes.
 * Used for binary endpoints like Actions log downloads that serve ZIP archives
 * or plain-text logs behind a 302 redirect.
 */
export async function githubGetArrayBuffer(
  owner: string,
  repo: string,
  path: string,
): Promise<ArrayBuffer> {
  const headers = await buildHeaders();
  const url = `https://api.github.com/repos/${owner}/${repo}${path}`;

  const response = await fetch(url, { headers });

  if (response.status === 401) {
    await invalidateToken();
    const retryHeaders = await buildHeaders();
    const retryResponse = await fetch(url, { headers: retryHeaders });
    if (!retryResponse.ok) {
      const text = await retryResponse.text();
      throw new Error(
        `GitHub API GET ${path} failed (${retryResponse.status}): ${sanitizeErrorBody(text)}`,
      );
    }
    logRateLimit(retryResponse.headers, `GET ${path}`);
    return retryResponse.arrayBuffer();
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `GitHub API GET ${path} failed (${response.status}): ${sanitizeErrorBody(text)}`,
    );
  }

  logRateLimit(response.headers, `GET ${path}`);
  return response.arrayBuffer();
}

export interface GraphQLError {
  message: string;
  type?: string;
  path?: Array<string | number>;
}

interface GraphQLResponse<T> {
  data?: T | null;
  errors?: GraphQLError[];
}

export interface GraphQLResult<T> {
  data: T;
  /** Per-node warnings from partial GraphQL responses (e.g. permission-gated fields). */
  warnings?: GraphQLError[];
}

/**
 * Make an authenticated GitHub GraphQL API request.
 *
 * GitHub returns 200 even on GraphQL errors. When partial data is available
 * (data + errors), returns the data with errors attached as `warnings`.
 * When no data is available, throws.
 */
export async function githubGraphQL<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<GraphQLResult<T>> {
  return doGraphQL<T>(query, variables, true, 0);
}

async function doGraphQL<T>(
  query: string,
  variables: Record<string, unknown>,
  canRetry: boolean,
  secondaryRetries: number,
): Promise<GraphQLResult<T>> {
  const headers = await buildHeaders();

  const response = await fetch(`${BASE_URL}/graphql`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (response.status === 401 && canRetry) {
    await invalidateToken();
    return doGraphQL<T>(query, variables, false, secondaryRetries);
  }

  // 502/503 — transient, retry once after 1s
  if ((response.status === 502 || response.status === 503) && canRetry) {
    await new Promise((r) => setTimeout(r, 1_000));
    return doGraphQL<T>(query, variables, false, secondaryRetries);
  }

  if (!response.ok) {
    const text = await response.text();

    // Secondary rate limit — retry honoring Retry-After (mirrors doRest).
    if (
      await handleSecondaryRateLimit(
        response,
        text,
        secondaryRetries,
        'POST /graphql',
      )
    ) {
      return doGraphQL<T>(query, variables, canRetry, secondaryRetries + 1);
    }

    throw new Error(
      `GitHub GraphQL failed (${response.status}): ${sanitizeErrorBody(text)}`,
    );
  }

  logRateLimit(response.headers, 'POST /graphql');

  const result = (await response.json()) as GraphQLResponse<T>;
  if (result.errors?.length) {
    // Partial response: data is present alongside errors (e.g. per-node
    // permission failures for fields like statusCheckRollup with app tokens).
    // Return the usable data with errors attached as warnings.
    if (result.data != null) {
      return { data: result.data, warnings: result.errors };
    }
    // Fatal: no data at all — throw as before.
    throw new Error(
      `GitHub GraphQL errors: ${result.errors.map((e) => e.message).join('; ')}`,
    );
  }

  if (result.data == null) {
    throw new Error('GitHub GraphQL returned no data and no errors');
  }

  return { data: result.data };
}
