import {
  markdownTable,
  pickFields,
  type FlatRecord,
} from '@legacy-sports/mcp-format';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  activeBlockers,
  BLOCKER_COLUMNS,
  BLOCKER_FIELD,
  blockerColumns,
  type JiraIssueLink,
} from '../blockers.js';
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
  includeBlockers?: boolean;
}

interface ChildFields {
  summary: string;
  status: { name: string };
  issuetype: { name: string };
  priority: { name: string } | null;
  created: string;
  issuelinks?: JiraIssueLink[];
}

const JIRA_KEY_RE = /^[A-Z][A-Z0-9_]+-\d+$/;

/** List child tickets of an epic or story via JQL search (paginated). */
export async function listChildren(
  params: ListChildrenParams,
): Promise<CallToolResult> {
  const {
    key,
    status,
    limit = 25,
    pageToken,
    paginate = false,
    includeBlockers = false,
  } = params;

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
    return listAllChildren(key, jql, includeBlockers);
  }

  try {
    const fields = ['summary', 'status', 'issuetype', 'priority', 'created'];
    if (includeBlockers) fields.push(BLOCKER_FIELD);

    const result = await searchJql<ChildFields>({
      jql,
      fields,
      maxResults: limit,
      pageToken,
    });

    const columns: string[] = includeBlockers
      ? [...CHILD_COLUMNS, ...BLOCKER_COLUMNS]
      : [...CHILD_COLUMNS];

    const children: FlatRecord[] = result.issues.map((issue) => {
      const row: FlatRecord = {
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status.name,
        type: issue.fields.issuetype.name,
        priority: issue.fields.priority?.name ?? '',
        created: issue.fields.created,
      };
      return includeBlockers
        ? { ...row, ...blockerColumns(issue.fields.issuelinks) }
        : row;
    });

    const text =
      children.length === 0
        ? `No children found for ${key}.`
        : withNextPageHint(
            markdownTable(pickFields(children, columns), { columns }),
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
 * cap is reached. Returns compact JSON (key + summary + status, plus blocked /
 * blockers[] when includeBlockers is set) to keep token usage predictable
 * regardless of child count.
 */
async function listAllChildren(
  key: string,
  jql: string,
  includeBlockers: boolean,
): Promise<CallToolResult> {
  interface CompactChild {
    key: string;
    summary: string;
    status: string;
    blocked?: boolean;
    blockers?: Array<{ key: string; status: string }>;
  }

  try {
    const all: CompactChild[] = [];
    let cursor: string | undefined;
    let truncated = false;

    do {
      const result = await searchJql<ChildFields>({
        jql,
        fields: includeBlockers
          ? ['summary', 'status', BLOCKER_FIELD]
          : ['summary', 'status'],
        maxResults: PAGINATE_PAGE_SIZE,
        pageToken: cursor,
      });

      for (const issue of result.issues) {
        const child: CompactChild = {
          key: issue.key,
          summary: issue.fields.summary,
          status: issue.fields.status.name,
        };
        if (includeBlockers) {
          const active = activeBlockers(issue.fields.issuelinks);
          child.blocked = active.length > 0;
          child.blockers = active;
        }
        all.push(child);
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
