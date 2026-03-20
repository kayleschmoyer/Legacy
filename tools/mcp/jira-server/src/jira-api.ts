import { getAtlassianCredentials, basicAuthHeader } from './netrc.js';

const JIRA_BASE = 'https://bkrupa.atlassian.net';

interface JiraRequestOptions {
  method: 'GET' | 'PUT' | 'POST';
  path: string;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
}

/** Make an authenticated Jira REST API request. */
export async function jiraRequest<T = unknown>(
  opts: JiraRequestOptions,
): Promise<T> {
  const creds = await getAtlassianCredentials();
  let url = `${JIRA_BASE}${opts.path}`;

  if (opts.query) {
    const params = new URLSearchParams(opts.query);
    url += `?${params.toString()}`;
  }

  const response = await fetch(url, {
    method: opts.method,
    headers: {
      Authorization: basicAuthHeader(creds),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Jira API ${opts.method} ${opts.path} failed (${response.status}): ${text}`,
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
