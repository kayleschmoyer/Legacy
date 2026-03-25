import { jiraRequest } from './jira-api.js';

/**
 * Shared helper for Jira's POST /rest/api/3/search/jql endpoint.
 *
 * This endpoint uses cursor-based pagination (nextPageToken), NOT offset-based
 * (startAt). Sending startAt in the body causes a 400 "Invalid request payload".
 */

/** Raw response shape from POST /rest/api/3/search/jql. */
interface JqlSearchResponse<F> {
  issues: Array<{ key: string; fields: F }>;
  nextPageToken?: string;
}

interface SearchOptions {
  jql: string;
  fields: string[];
  maxResults?: number;
  pageToken?: string;
}

type SearchResult<F> = JqlSearchResponse<F>;

/**
 * Execute a JQL search and return a single page of results.
 * Use when you know the result set is small or want to cap output.
 */
export async function searchJql<F>(
  opts: SearchOptions,
): Promise<SearchResult<F>> {
  const { jql, fields, maxResults = 100, pageToken } = opts;
  const body: Record<string, unknown> = { jql, fields, maxResults };
  if (pageToken) {
    body.nextPageToken = pageToken;
  }
  return jiraRequest<JqlSearchResponse<F>>({
    method: 'POST',
    path: '/rest/api/3/search/jql',
    body,
  });
}

/**
 * Execute a JQL search and paginate through ALL results.
 * Uses cursor-based nextPageToken pagination.
 */
export async function searchJqlAll<F>(
  opts: SearchOptions,
): Promise<Array<{ key: string; fields: F }>> {
  const { jql, fields, maxResults = 100 } = opts;
  const allIssues: Array<{ key: string; fields: F }> = [];
  let nextPageToken: string | undefined;

  do {
    const body: Record<string, unknown> = {
      jql,
      fields,
      maxResults,
    };
    if (nextPageToken) {
      body.nextPageToken = nextPageToken;
    }

    const result = await jiraRequest<JqlSearchResponse<F>>({
      method: 'POST',
      path: '/rest/api/3/search/jql',
      body,
    });

    allIssues.push(...result.issues);
    nextPageToken = result.nextPageToken;
  } while (nextPageToken);

  return allIssues;
}
