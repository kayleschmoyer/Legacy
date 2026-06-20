import { markdownTable, pickFields } from '@legacy-sports/mcp-format';
import { searchJql } from '../jql-search.js';
import {
  SEARCH_COLUMNS,
  SEARCH_COMPACT_COLUMNS,
  withNextPageHint,
} from '../format.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface SearchParams {
  jql: string;
  maxResults?: number;
  compact?: boolean;
  pageToken?: string;
}

interface SearchFields {
  summary: string;
  status: { name: string };
  issuetype: { name: string };
  assignee: { displayName: string; emailAddress?: string } | null;
  priority: { name: string } | null;
}

const DEFAULT_FIELDS = [
  'summary',
  'status',
  'issuetype',
  'assignee',
  'priority',
];
const COMPACT_FIELDS = ['summary', 'status'];

/** Search Jira issues using JQL via the v3 search/jql endpoint. */
export async function search(params: SearchParams): Promise<CallToolResult> {
  const { jql, maxResults: rawMax = 15, compact = false, pageToken } = params;
  const maxResults = Math.max(1, Math.min(50, Math.floor(rawMax)));

  try {
    const result = await searchJql<SearchFields>({
      jql,
      fields: compact ? COMPACT_FIELDS : DEFAULT_FIELDS,
      maxResults,
      pageToken,
    });

    if (compact) {
      const issues = result.issues.map((issue) => ({
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status.name,
      }));
      const text =
        issues.length === 0
          ? 'No issues match this query.'
          : withNextPageHint(
              markdownTable(pickFields(issues, SEARCH_COMPACT_COLUMNS), {
                columns: SEARCH_COMPACT_COLUMNS,
              }),
              result.nextPageToken,
            );
      return { content: [{ type: 'text', text }] };
    }

    const issues = result.issues.map((issue) => ({
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status.name,
      type: issue.fields.issuetype.name,
      assignee: issue.fields.assignee?.displayName ?? '',
      priority: issue.fields.priority?.name ?? '',
    }));

    const text =
      issues.length === 0
        ? 'No issues match this query.'
        : withNextPageHint(
            markdownTable(pickFields(issues, SEARCH_COLUMNS), {
              columns: SEARCH_COLUMNS,
            }),
            result.nextPageToken,
          );

    return { content: [{ type: 'text', text }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Jira search failed: ${message}`,
        },
      ],
    };
  }
}
