import { markdownTable, pickFields } from '@legacy-sports/mcp-format';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { CHILD_COLUMNS, withNextPageHint } from '../format.js';
import { searchJql } from '../jql-search.js';

const PAGINATE_PAGE_SIZE = 100;
const PAGINATE_CAP = 500;

interface ListChildrenParams {
  key: string;
  status?: string;
  limit?: number;
  pageToken?: string;
  paginate?: boolean;
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
  const { key, status, limit = 25, pageToken, paginate = false } = params;

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

  // Quote values in JQL to prevent injection
  const quotedKey = JSON.stringify(key);
  const jql = status
    ? `parent = ${quotedKey} AND status = ${JSON.stringify(status)} ORDER BY created DESC`
    : `parent = ${quotedKey} ORDER BY created DESC`;

  if (paginate) {
    return listAllChildren(key, jql);
  }

  try {
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

    const text =
      children.length === 0
        ? `No children found for ${key}.`
        : withNextPageHint(
            markdownTable(pickFields(children, CHILD_COLUMNS), {
              columns: CHILD_COLUMNS,
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
          text: `Failed to list children of ${key}: ${message}`,
        },
      ],
    };
  }
}

/**
 * Fetch all children by paginating internally until exhausted or the 500-item
 * cap is reached. Returns compact JSON (key + summary + status only) to keep
 * token usage predictable regardless of child count.
 */
async function listAllChildren(
  key: string,
  jql: string,
): Promise<CallToolResult> {
  interface CompactChild {
    key: string;
    summary: string;
    status: string;
  }

  try {
    const all: CompactChild[] = [];
    let cursor: string | undefined;
    let truncated = false;

    do {
      const result = await searchJql<ChildFields>({
        jql,
        fields: ['summary', 'status'],
        maxResults: PAGINATE_PAGE_SIZE,
        pageToken: cursor,
      });

      for (const issue of result.issues) {
        all.push({
          key: issue.key,
          summary: issue.fields.summary,
          status: issue.fields.status.name,
        });
        if (all.length >= PAGINATE_CAP) {
          truncated = true;
          break;
        }
      }

      cursor = truncated ? undefined : result.nextPageToken;
    } while (cursor);

    const payload: {
      parent: string;
      total: number;
      truncated?: boolean;
      children: CompactChild[];
    } = { parent: key, total: all.length, children: all };
    if (truncated) payload.truncated = true;

    return {
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to list all children of ${key}: ${message}`,
        },
      ],
    };
  }
}
