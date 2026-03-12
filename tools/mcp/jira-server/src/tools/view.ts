import { jiraRequest } from '../jira-api.js';
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
    parent?: { key: string };
    issuelinks: JiraIssueLink[];
  };
}

type AdfNode = {
  text?: string;
  content?: AdfNode[];
  [key: string]: unknown;
};

/** Extract plain text from Atlassian Document Format (ADF) recursively. */
function extractAdfText(adf: unknown): string {
  if (!adf || typeof adf !== 'object') return '';
  const doc = adf as { content?: AdfNode[] };
  if (!Array.isArray(doc.content)) return '';

  const parts: string[] = [];

  const collectText = (node: AdfNode): void => {
    if (typeof node.text === 'string') {
      parts.push(node.text);
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        collectText(child);
      }
    }
  };

  const topLevel = doc.content;
  topLevel.forEach((block, index) => {
    const beforeLength = parts.length;
    collectText(block);
    if (parts.length > beforeLength && index < topLevel.length - 1) {
      parts.push('\n\n');
    }
  });

  return parts
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
          'summary,status,issuetype,description,assignee,parent,issuelinks',
      },
    });

    const ticket = {
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status.name,
      type: issue.fields.issuetype.name,
      description: extractAdfText(issue.fields.description),
      assignee: issue.fields.assignee?.displayName ?? '',
      parent: issue.fields.parent?.key ?? '',
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
