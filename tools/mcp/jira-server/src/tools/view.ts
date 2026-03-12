import { jiraRequest } from '../jira-api.js';
import { extractAdfText } from '../adf.js';
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
    const issue = await jiraRequest<JiraIssueResponse>({
      method: 'GET',
      path: `/rest/api/3/issue/${key}`,
      query: {
        fields:
          'summary,status,issuetype,description,assignee,reporter,parent,issuelinks,labels,priority,created,updated',
      },
    });

    const ticket = {
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
