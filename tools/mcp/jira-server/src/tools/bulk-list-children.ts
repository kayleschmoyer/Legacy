import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { searchJql } from '../jql-search.js';

interface BulkListChildrenParams {
  keys: string[];
  status?: string;
  limit?: number;
}

interface ChildFields {
  summary: string;
  status: { name: string };
  issuetype: { name: string };
  priority: { name: string } | null;
  created: string;
}

interface ChildEntry {
  key: string;
  summary: string;
  status: string;
  type: string;
  priority: string;
  created: string;
}

interface SucceededEntry {
  parent: string;
  count: number;
  children: ChildEntry[];
  nextPageToken?: string;
}

interface FailedEntry {
  key: string;
  error: string;
}

const CONCURRENCY = 5;

/**
 * List children of up to 50 parent tickets in one call. Each parent is queried
 * independently; one parent failing never fails the whole batch. This tool does
 * not accept a page cursor — it returns only the first page per parent (capped
 * by `limit`, max 100). When a parent has more children than `limit`, its
 * `nextPageToken` is surfaced as a truncation signal; page that specific parent
 * with the single-item `jira_list_children` (passing the token as `pageToken`).
 */
export async function bulkListChildren(
  params: BulkListChildrenParams,
): Promise<CallToolResult> {
  const { keys, status, limit = 25 } = params;

  if (keys.length === 0) {
    return errorResult('keys array is empty');
  }
  if (keys.length > 50) {
    return errorResult(
      `Too many keys (${keys.length}). Maximum per call is 50. Split into batches.`,
    );
  }

  const succeeded: SucceededEntry[] = [];
  const failed: FailedEntry[] = [];

  async function runOne(key: string): Promise<void> {
    try {
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
      });

      const children: ChildEntry[] = result.issues.map((issue) => ({
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status.name,
        type: issue.fields.issuetype.name,
        priority: issue.fields.priority?.name ?? '',
        created: issue.fields.created,
      }));

      const entry: SucceededEntry = {
        parent: key,
        count: children.length,
        children,
      };
      // Surfaced only as a truncation signal — this tool does not consume it.
      // The caller pages the affected parent via single-item jira_list_children.
      if (result.nextPageToken) entry.nextPageToken = result.nextPageToken;
      succeeded.push(entry);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push({ key, error: message });
    }
  }

  for (let i = 0; i < keys.length; i += CONCURRENCY) {
    const chunk = keys.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(runOne));
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: failed.length === 0,
            total: keys.length,
            succeeded,
            failed,
          },
          null,
          2,
        ),
      },
    ],
    ...(failed.length > 0 ? { isError: true } : {}),
  };
}

function errorResult(message: string): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify({ success: false, error: message }),
      },
    ],
  };
}
