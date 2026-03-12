import { jiraRequest } from '../jira-api.js';
import { extractAdfText } from '../adf.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface GetCommentsParams {
  key: string;
}

interface JiraComment {
  id: string;
  author: { displayName: string };
  body: unknown;
  created: string;
  updated: string;
}

interface JiraCommentsResponse {
  comments: JiraComment[];
  total: number;
  startAt: number;
  maxResults: number;
}

/** Fetch all comments for a Jira ticket, handling pagination. */
export async function getComments(
  params: GetCommentsParams,
): Promise<CallToolResult> {
  const { key } = params;

  try {
    const allComments: JiraComment[] = [];
    let startAt = 0;
    const maxResults = 50;
    let total = Infinity;

    while (allComments.length < total) {
      const result = await jiraRequest<JiraCommentsResponse>({
        method: 'GET',
        path: `/rest/api/3/issue/${key}/comment`,
        query: {
          orderBy: 'created',
          startAt: String(startAt),
          maxResults: String(maxResults),
        },
      });

      total = result.total;
      allComments.push(...result.comments);
      startAt += result.comments.length;

      if (result.comments.length === 0) {
        // Defensive: avoid infinite loop if server returns empty page unexpectedly
        break;
      }
    }

    const comments = allComments.map((c) => ({
      id: c.id,
      author: c.author.displayName,
      body: extractAdfText(c.body),
      created: c.created,
      updated: c.updated,
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ key, total, comments }, null, 2),
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
          text: `Failed to fetch comments for Jira issue ${key}: ${message}`,
        },
      ],
    };
  }
}
