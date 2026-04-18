import { searchJql } from '../jql-search.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface SearchParams {
  jql: string;
  maxResults?: number;
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

/** Search Jira issues using JQL via the v3 search/jql endpoint. */
export async function search(params: SearchParams): Promise<CallToolResult> {
  const { jql, maxResults: rawMax = 15 } = params;
  const maxResults = Math.max(1, Math.min(50, Math.floor(rawMax)));

  try {
    const result = await searchJql<SearchFields>({
      jql,
      fields: DEFAULT_FIELDS,
      maxResults,
    });

    const issues = result.issues.map((issue) => ({
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status.name,
      type: issue.fields.issuetype.name,
      assignee: issue.fields.assignee?.displayName ?? '',
      priority: issue.fields.priority?.name ?? '',
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ returned: issues.length, issues }, null, 2),
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
