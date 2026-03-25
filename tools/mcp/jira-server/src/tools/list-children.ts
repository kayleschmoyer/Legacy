import { searchJql } from '../jql-search.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface ListChildrenParams {
  key: string;
  status?: string;
  limit?: number;
  pageToken?: string;
}

interface ChildFields {
  summary: string;
  status: { name: string };
  issuetype: { name: string };
  priority: { name: string } | null;
  created: string;
}

const JIRA_KEY_RE = /^[A-Z][A-Z0-9_]+-\d+$/;

/** List child tickets of an epic or story via JQL search (paginated). */
export async function listChildren(
  params: ListChildrenParams,
): Promise<CallToolResult> {
  const { key, status, limit = 25, pageToken } = params;

  if (!JIRA_KEY_RE.test(key)) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Invalid Jira issue key: ${key}. Expected format like LS-123.`,
        },
      ],
    };
  }

  try {
    // Quote values in JQL to prevent injection
    const quotedKey = JSON.stringify(key);
    let jql = `parent = ${quotedKey} ORDER BY created DESC`;
    if (status) {
      const quotedStatus = JSON.stringify(status);
      jql = `parent = ${quotedKey} AND status = ${quotedStatus} ORDER BY created DESC`;
    }

    const result = await searchJql<ChildFields>({
      jql,
      fields: ['summary', 'status', 'issuetype', 'priority', 'created'],
      maxResults: limit,
      pageToken,
    });

    const children = result.issues.map((issue) => ({
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status.name,
      type: issue.fields.issuetype.name,
      priority: issue.fields.priority?.name ?? '',
      created: issue.fields.created,
    }));

    const response: Record<string, unknown> = {
      parent: key,
      count: children.length,
      total: children.length,
      children,
    };

    if (result.nextPageToken) {
      response.nextPageToken = result.nextPageToken;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
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
          text: `Failed to list children of ${key}: ${message}`,
        },
      ],
    };
  }
}
