import { jiraRequest } from '../jira-api.js';
import { searchJqlAll } from '../jql-search.js';
import { extractAdfText } from '../adf.js';
import { matchesStatus } from '../locale.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface ViewParams {
  key: string;
}

interface JiraIssueLink {
  type: { name: string; inward: string };
  inwardIssue?: { key: string };
}

interface JiraIssueResponse {
  key: string;
  fields: {
    summary: string;
    status: { name: string };
    issuetype: { name: string };
    description: unknown;
    assignee: { displayName: string } | null;
    reporter: { displayName: string } | null;
    parent?: { key: string };
    issuelinks: JiraIssueLink[];
    labels: string[];
    priority: { name: string } | null;
    created: string;
    updated: string;
  };
}

/** Extract blocker keys from issue links. */
function extractBlockers(
  links: JiraIssueLink[],
): Array<{ key: string; type: string }> {
  return links
    .filter(
      (link) =>
        link.inwardIssue &&
        link.type.inward.toLowerCase().includes('is blocked by'),
    )
    .map((link) => ({
      key: link.inwardIssue!.key,
      type: 'blocked-by',
    }));
}

/** View ticket details via REST API. */
export async function view(params: ViewParams): Promise<CallToolResult> {
  const { key } = params;

  try {
    // Fetch issue details and child issues concurrently to reduce latency
    const [issue, childResult] = await Promise.all([
      jiraRequest<JiraIssueResponse>({
        method: 'GET',
        path: `/rest/api/3/issue/${key}`,
        query: {
          fields:
            'summary,status,issuetype,description,assignee,reporter,parent,issuelinks,labels,priority,created,updated',
        },
      }),
      // Child search materializes full issue objects but only status is used for
      // bucketing. This is acceptable because epics rarely exceed 100 children
      // and the Jira search API does not support returning only aggregated counts.
      searchJqlAll<{ status: { name: string } }>({
        jql: `parent = ${JSON.stringify(key)}`,
        fields: ['status'],
        maxResults: 100,
      }).catch(() => undefined as undefined), // Non-critical — omit on error
    ]);

    // Build child issue summary from search results
    let children:
      | {
          total: number;
          toDo: number;
          inProgress: number;
          inReview: number;
          done: number;
        }
      | undefined;
    if (childResult && childResult.length > 0) {
      const counts = { toDo: 0, inProgress: 0, inReview: 0, done: 0 };
      for (const child of childResult) {
        const status = child.fields.status.name;
        if (matchesStatus(status, 'Done')) counts.done++;
        else if (matchesStatus(status, 'In Review')) counts.inReview++;
        else if (matchesStatus(status, 'In Progress')) counts.inProgress++;
        else counts.toDo++;
      }
      children = { total: childResult.length, ...counts };
    }

    const ticket: Record<string, unknown> = {
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status.name,
      type: issue.fields.issuetype.name,
      priority: issue.fields.priority?.name ?? '',
      description: extractAdfText(issue.fields.description),
      assignee: issue.fields.assignee?.displayName ?? '',
      reporter: issue.fields.reporter?.displayName ?? '',
      parent: issue.fields.parent?.key ?? '',
      labels: issue.fields.labels,
      created: issue.fields.created,
      updated: issue.fields.updated,
      blockers: extractBlockers(issue.fields.issuelinks),
    };

    if (children) {
      ticket.children = children;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(ticket, null, 2),
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
          text: `Failed to fetch Jira issue ${key}: ${message}`,
        },
      ],
    };
  }
}
