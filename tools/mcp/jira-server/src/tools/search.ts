import { searchJql } from '../jql-search.js';
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
      const output: Record<string, unknown> = { issues };
      if (result.nextPageToken) {
        output.nextPageToken = result.nextPageToken;
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
      };
    }

    const issues = result.issues.map((issue) => ({
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status.name,
      type: issue.fields.issuetype.name,
      assignee: issue.fields.assignee?.displayName ?? '',
      priority: issue.fields.priority?.name ?? '',
    }));

    const output: Record<string, unknown> = {
      returned: issues.length,
      issues,
    };
    if (result.nextPageToken) {
      output.nextPageToken = result.nextPageToken;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(output, null, 2),
        },
      ],
    };
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
