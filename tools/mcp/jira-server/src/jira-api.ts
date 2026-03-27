import {
  getJiraCredentials,
  basicAuthHeader,
  JIRA_SITE_URL_DEFAULT,
  type JiraCredentials,
} from './netrc.js';
import { getAccessToken } from './oauth.js';

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

/** Make an authenticated Jira REST API request. */
export async function jiraRequest<T = unknown>(
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
