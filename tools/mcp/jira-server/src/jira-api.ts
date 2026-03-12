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

  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return (await response.json()) as T;
  }
  return undefined as T;
}
