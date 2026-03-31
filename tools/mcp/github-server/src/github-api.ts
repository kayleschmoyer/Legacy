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
 * Make an authenticated GitHub REST API request.
 *
 * - 401: invalidates token cache and retries once
 * - 502/503: retries once after 1 second
 * - Rate limit (403 with x-ratelimit-remaining=0): includes reset time in error
 */
export async function githubRest<T>(opts: RestOptions): Promise<T> {
  return doRest<T>(opts, true);
}

async function doRest<T>(opts: RestOptions, canRetry: boolean): Promise<T> {
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
    return doRest<T>(opts, false);
  }

  // 502/503 — transient, retry once after 1s
  if ((response.status === 502 || response.status === 503) && canRetry) {
    await new Promise((r) => setTimeout(r, 1_000));
    return doRest<T>(opts, false);
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
    throw new Error(
      `GitHub API ${opts.method} ${opts.path} failed (${response.status}): ${sanitizeErrorBody(text)}`,
    );
  }

  // DELETE returns 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
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
  return doGraphQL<T>(query, variables, true);
}

async function doGraphQL<T>(
  query: string,
  variables: Record<string, unknown>,
  canRetry: boolean,
): Promise<GraphQLResult<T>> {
  const headers = await buildHeaders();

  const response = await fetch(`${BASE_URL}/graphql`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (response.status === 401 && canRetry) {
    await invalidateToken();
    return doGraphQL<T>(query, variables, false);
  }

  // 502/503 — transient, retry once after 1s
  if ((response.status === 502 || response.status === 503) && canRetry) {
    await new Promise((r) => setTimeout(r, 1_000));
    return doGraphQL<T>(query, variables, false);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `GitHub GraphQL failed (${response.status}): ${sanitizeErrorBody(text)}`,
    );
  }

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
