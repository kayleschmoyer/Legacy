import {
  basicAuthHeader,
  getJiraCredentials,
  JIRA_SITE_URL_DEFAULT,
  type JiraCredentials,
} from './netrc.js';
import { getAccessToken } from './oauth.js';

/**
 * Determine whether a fetch error represents a transient connection issue
 * that warrants a retry (ECONNRESET, ECONNREFUSED, ETIMEDOUT, fetch failures).
 */
function isConnectionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  // `Error.cause` is an ES2022 addition; tsconfig.base.json's `lib` predates
  // it, so the property is accessed through an explicit local type rather
  // than relying on the (unavailable) ambient `Error` typing.
  const cause = (err as { cause?: unknown }).cause;
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

/** Truncate API error bodies and redact potential auth tokens. */
function sanitizeErrorBody(text: string, maxLen = 500): string {
  let sanitized = text
    .replace(/Bearer\s+[A-Za-z0-9_\-.]+/gi, 'Bearer ***')
    .replace(/token\s+[A-Za-z0-9_\-.]+/gi, 'token ***')
    .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, 'Basic ***');
  if (sanitized.length > maxLen) {
    const suffix = '... (truncated)';
    sanitized = sanitized.slice(0, maxLen - suffix.length) + suffix;
  }
  return sanitized;
}

interface JiraRequestOptions {
  method: 'GET' | 'PUT' | 'POST' | 'DELETE';
  path: string;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
}

/**
 * Resolve the base URL for API calls based on credential type.
 *
 * - OAuth 2.0: https://api.atlassian.com/ex/jira/{cloudId}
 * - Basic Auth: https://bkrupa.atlassian.net (direct site URL)
 */
function getApiBaseUrl(creds: JiraCredentials): string {
  if (creds.type === 'oauth') {
    return `https://api.atlassian.com/ex/jira/${creds.cloudId}`;
  }
  return JIRA_SITE_URL_DEFAULT;
}

/**
 * Build the Authorization header for the given credential type.
 */
async function getAuthHeader(creds: JiraCredentials): Promise<string> {
  if (creds.type === 'oauth') {
    const token = await getAccessToken(creds.clientId, creds.clientSecret);
    return `Bearer ${token}`;
  }
  return basicAuthHeader(creds);
}

/**
 * Get the site URL for building human-readable browse links.
 * Browse links always use the direct site URL, not the API gateway.
 */
export function getSiteUrl(creds: JiraCredentials): string {
  if (creds.type === 'oauth') {
    return creds.siteUrl;
  }
  return JIRA_SITE_URL_DEFAULT;
}

/** Get the Jira site URL for browse links. Resolves credentials to determine the URL. */
export async function getJiraSiteUrl(): Promise<string> {
  const creds = await getJiraCredentials();
  return getSiteUrl(creds);
}

/**
 * Execute one HTTP attempt against the Jira REST API.
 * Separated from jiraRequest so the retry wrapper can call it cleanly.
 */
async function jiraRequestOnce<T = unknown>(
  opts: JiraRequestOptions,
): Promise<T> {
  const creds = await getJiraCredentials();
  const baseUrl = getApiBaseUrl(creds);
  const authHeader = await getAuthHeader(creds);

  let url = `${baseUrl}${opts.path}`;

  if (opts.query) {
    const params = new URLSearchParams(opts.query);
    url += `?${params.toString()}`;
  }

  const response = await fetch(url, {
    method: opts.method,
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Language': 'en',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Jira API ${opts.method} ${opts.path} failed (${response.status}): ${sanitizeErrorBody(text)}`,
    );
  }

  // Some Jira endpoints (e.g. PUT) return 204 No Content with an empty body
  // but may still include a content-type header. Guard against JSON parse errors.
  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    const text = await response.text();
    if (!text) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
  }
  return undefined as T;
}

/**
 * Make an authenticated Jira REST API request.
 *
 * Automatically retries once on transient connection errors (ECONNRESET,
 * ECONNREFUSED, ETIMEDOUT, fetch failures) for GET requests only. Non-GET
 * requests (POST/PUT/DELETE) are not retried because the first request may
 * have completed before the connection dropped, and retrying could duplicate
 * side effects (e.g. creating duplicate issues or comments).
 *
 * This handles mid-session disconnects that occur after ~40 minutes of
 * inactivity when the underlying HTTP connection has been silently dropped.
 */
export async function jiraRequest<T = unknown>(
  opts: JiraRequestOptions,
): Promise<T> {
  try {
    return await jiraRequestOnce<T>(opts);
  } catch (err) {
    if (!isConnectionError(err) || opts.method !== 'GET') {
      throw err;
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    const cause =
      err instanceof Error ? (err as { cause?: unknown }).cause : undefined;
    const causeMsg =
      cause !== null &&
      typeof cause === 'object' &&
      'message' in cause &&
      typeof cause.message === 'string'
        ? ` (cause: ${cause.message})`
        : cause !== null &&
            typeof cause === 'object' &&
            'code' in cause &&
            typeof cause.code === 'string'
          ? ` (code: ${cause.code})`
          : '';
    process.stderr.write(
      `[legacy-sports-jira] Connection error on ${opts.method} ${opts.path}: ${errMsg}${causeMsg}. Retrying…\n`,
    );
    // Retry once — getJiraCredentials and getAuthHeader are re-called inside
    // jiraRequestOnce to re-resolve credentials.
    return jiraRequestOnce<T>(opts);
  }
}

interface JiraBinaryResponse {
  /** Raw response bytes. */
  bytes: Uint8Array;
  /** Content-Type reported by Jira (or the redirect target), lower-cased. */
  contentType: string;
}

/**
 * Fetch a binary Jira resource (e.g. attachment content or thumbnail) using the
 * server's own credentials.
 *
 * This exists because attachment content lives behind `api.atlassian.com` /
 * media-CDN URLs that agent sessions cannot reach directly (egress proxy blocks
 * them). Routing the download through this server's credentials is what makes
 * screenshot-only bug tickets readable (LS-10016).
 *
 * Jira answers the content endpoint with a 302 to a pre-signed media URL;
 * `fetch` follows it, and undici drops the Authorization header on the
 * cross-origin hop, which is exactly what the pre-signed URL expects.
 *
 * Retries once on transient connection errors, matching `jiraRequest` (these
 * are GETs, so the retry is safe).
 */
export async function jiraRequestBinary(
  path: string,
): Promise<JiraBinaryResponse> {
  const attempt = async (): Promise<JiraBinaryResponse> => {
    const creds = await getJiraCredentials();
    const response = await fetch(`${getApiBaseUrl(creds)}${path}`, {
      method: 'GET',
      headers: {
        Authorization: await getAuthHeader(creds),
        Accept: '*/*',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Jira API GET ${path} failed (${response.status}): ${sanitizeErrorBody(text)}`,
      );
    }

    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      contentType: (
        response.headers.get('content-type') ?? 'application/octet-stream'
      )
        .split(';')[0]
        .trim()
        .toLowerCase(),
    };
  };

  try {
    return await attempt();
  } catch (err) {
    if (!isConnectionError(err)) throw err;
    process.stderr.write(
      `[legacy-sports-jira] Connection error on GET ${path}. Retrying…\n`,
    );
    return attempt();
  }
}
