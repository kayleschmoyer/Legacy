import { markdownTable, pickFields } from '@legacy-sports/mcp-format';
import { jiraRequest } from '../jira-api.js';
import { extractAdfText } from '../adf.js';
import { COMMENT_COLUMNS } from '../format.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface GetCommentsParams {
  key?: string;
  keys?: string[];
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

interface NormalizedComment {
  [field: string]: unknown;
  id: string;
  author: string;
  body: string;
  created: string;
  updated: string;
}

export const MAX_BATCH_KEYS = 50;
const BATCH_CONCURRENCY = 5;

async function fetchCommentsForKey(key: string): Promise<NormalizedComment[]> {
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
      break;
    }
  }

  return allComments.map((c) => ({
    id: c.id,
    author: c.author.displayName,
    created: c.created,
    updated: c.updated,
    body: extractAdfText(c.body),
  }));
}

function errorResult(message: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  };
}

/**
 * Fetch comments for one Jira ticket (markdown table) or many (JSON map).
 *
 * Single-key (`key`): markdown table rendering, unchanged from the prior
 * token-efficient migration.
 *
 * Batch (`keys`, 1-50): returns `{ comments: { [key]: [...] }, missing: [...] }`
 * with per-key failures routed to `missing[]` so a single bad key never sinks
 * the whole call. Concurrency capped at 5 to avoid hammering Jira.
 */
export async function getComments(
  params: GetCommentsParams,
): Promise<CallToolResult> {
  const { key, keys } = params;

  if (keys !== undefined) {
    if (key !== undefined) {
      return errorResult(
        'Provide either `key` (single) or `keys` (batch), not both.',
      );
    }
    if (keys.length < 1 || keys.length > MAX_BATCH_KEYS) {
      return errorResult(
        `\`keys\` must contain between 1 and ${MAX_BATCH_KEYS} ticket keys (got ${keys.length}).`,
      );
    }

    const comments: Record<
      string,
      Array<Pick<NormalizedComment, (typeof COMMENT_COLUMNS)[number]>>
    > = {};
    const missing: string[] = [];

    for (let i = 0; i < keys.length; i += BATCH_CONCURRENCY) {
      const chunk = keys.slice(i, i + BATCH_CONCURRENCY);
      const settled = await Promise.allSettled(
        chunk.map((k) => fetchCommentsForKey(k)),
      );
      settled.forEach((result, j) => {
        const k = chunk[j]!;
        if (result.status === 'fulfilled') {
          comments[k] = pickFields(result.value, COMMENT_COLUMNS);
        } else {
          missing.push(k);
        }
      });
    }

    // Per the MCP partial-failure rule, surface isError when *any* key fails so
    // agents that only check the top-level flag can't silently drop a partial
    // failure (mirrors consolidated-transition's batch contract).
    return {
      isError: missing.length > 0,
      content: [
        {
          type: 'text',
          text: JSON.stringify({ comments, missing }),
        },
      ],
    };
  }

  if (key === undefined) {
    return errorResult('Provide either `key` (single) or `keys` (batch).');
  }

  try {
    const comments = await fetchCommentsForKey(key);

    const text =
      comments.length === 0
        ? `No comments on ${key}.`
        : markdownTable(pickFields(comments, COMMENT_COLUMNS), {
            columns: COMMENT_COLUMNS,
          });

    return { content: [{ type: 'text', text }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResult(
      `Failed to fetch comments for Jira issue ${key}: ${message}`,
    );
  }
}
