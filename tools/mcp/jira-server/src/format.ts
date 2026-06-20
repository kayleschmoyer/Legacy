// Shared token-efficient formatting for jira-server's list-shaped tools
// (jira_search, jira_list_children, jira_get_comments). The cross-server
// standard and helper live in `@legacy-sports/mcp-format` (epic LS-8018 /
// LS-8019); this module only pins the per-tool column sets (the first-order
// field-selection lever) and the pagination-hint footer so the three list
// tools render identically.

/** jira_search (full): fields an agent reads off a search result row. */
export const SEARCH_COLUMNS = [
  'key',
  'summary',
  'status',
  'type',
  'assignee',
  'priority',
] as const;

/** jira_search (compact): just enough to identify and triage an issue. */
export const SEARCH_COMPACT_COLUMNS = ['key', 'summary', 'status'] as const;

/** jira_list_children: the child-ticket fields the work-ticket flow consumes. */
export const CHILD_COLUMNS = [
  'key',
  'summary',
  'status',
  'type',
  'priority',
  'created',
] as const;

/**
 * jira_get_comments: `updated` is dropped — it equals `created` for the vast
 * majority of comments and agents read author/body/created. `body` is kept full
 * (clarifications and ACs added as comments are the payload) but the Markdown
 * table flattens its newlines to spaces.
 */
export const COMMENT_COLUMNS = ['id', 'author', 'created', 'body'] as const;

/**
 * Append a pagination footer when the search/list endpoint returned a
 * `nextPageToken`, so an agent still sees the cursor it must pass back as
 * `pageToken` even though the rows are now a Markdown table rather than JSON.
 * Returns the table unchanged when there is no further page.
 */
export function withNextPageHint(
  table: string,
  nextPageToken?: string,
): string {
  if (!nextPageToken) return table;
  return `${table}\n\n_More results — pass pageToken: ${nextPageToken} to fetch the next page._`;
}
