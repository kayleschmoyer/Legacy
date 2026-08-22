import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  activeBlockers,
  BLOCKER_FIELD,
  type JiraIssueLink,
} from '../blockers.js';
import { searchJqlAll } from '../jql-search.js';
import { matchesStatus } from '../locale.js';

export interface GetAllDescendantsParams {
  key: string;
  status?: string;
  unblockedOnly?: boolean;
  maxDepth?: number;
}

interface DescendantFields {
  summary: string;
  status: { name: string };
  issuetype: { name: string };
  priority: { name: string } | null;
  issuelinks?: JiraIssueLink[];
}

interface RawChild {
  key: string;
  summary: string;
  status: string;
  type: string;
  priority: string;
  issuelinks: JiraIssueLink[];
}

export interface DescendantEntry {
  key: string;
  summary: string;
  status: string;
  type: string;
  priority: string;
  blocked: boolean;
  blockers: Array<{ key: string; status: string }>;
}

/** Issue types treated as intermediate nodes — their children are recursed into. */
const CONTAINER_TYPES = new Set(['Epic', 'Story']);
const JIRA_KEY_RE = /^[A-Z][A-Z0-9_]+-\d+$/;
const CONCURRENCY = 5;

/**
 * Recursively traverse the ticket tree rooted at `key` and return all
 * leaf-typed descendants (Task / Bug / Sub-task) that match the optional
 * filters. Container-typed tickets (Epic / Story) are traversal nodes only.
 * Blocker status is annotated inline — no separate jira_check_blockers calls
 * needed.
 */
export async function getAllDescendants(
  params: GetAllDescendantsParams,
): Promise<CallToolResult> {
  const { key, status, unblockedOnly = false, maxDepth = 10 } = params;

  if (!JIRA_KEY_RE.test(key)) {
    return errorResult(
      `Invalid Jira issue key: ${key}. Expected format like LS-123.`,
    );
  }

  const result: DescendantEntry[] = [];
  const errors: Array<{ key: string; error: string }> = [];
  let skippedByStatus = 0;
  let skippedByBlockers = 0;

  // BFS: start from the root's children, not the root itself
  const visited = new Set<string>([key]);
  let frontier: string[] = [key];
  let depth = 0;

  while (frontier.length > 0 && depth < maxDepth) {
    const nextContainers: string[] = [];

    // Fetch children for the current frontier in parallel, CONCURRENCY at a time
    for (let i = 0; i < frontier.length; i += CONCURRENCY) {
      const chunk = frontier.slice(i, i + CONCURRENCY);
      const chunkResults = await Promise.all(
        chunk.map((parentKey) => fetchChildren(parentKey, errors)),
      );

      for (const children of chunkResults) {
        for (const child of children) {
          if (visited.has(child.key)) continue;
          visited.add(child.key);

          if (CONTAINER_TYPES.has(child.type)) {
            nextContainers.push(child.key);
            continue;
          }

          // Leaf ticket — apply status filter
          if (status && !matchesStatus(child.status, status)) {
            skippedByStatus++;
            continue;
          }

          // Compute active blockers (not yet Done or In Review)
          const blockers = activeBlockers(child.issuelinks);
          const blocked = blockers.length > 0;

          if (unblockedOnly && blocked) {
            skippedByBlockers++;
            continue;
          }

          result.push({
            key: child.key,
            summary: child.summary,
            status: child.status,
            type: child.type,
            priority: child.priority,
            blocked,
            blockers,
          });
        }
      }
    }

    frontier = nextContainers;
    depth++;
  }

  const response: Record<string, unknown> = {
    root: key,
    total: result.length,
    descendants: result,
    skipped: {
      byStatus: skippedByStatus,
      byBlockers: skippedByBlockers,
    },
  };
  if (errors.length > 0) response.errors = errors;

  return {
    content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
  };
}

async function fetchChildren(
  parentKey: string,
  errors: Array<{ key: string; error: string }>,
): Promise<RawChild[]> {
  try {
    const issues = await searchJqlAll<DescendantFields>({
      jql: `parent = ${JSON.stringify(parentKey)} ORDER BY created DESC`,
      fields: ['summary', 'status', 'issuetype', 'priority', BLOCKER_FIELD],
    });
    return issues.map((issue) => ({
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status.name,
      type: issue.fields.issuetype.name,
      priority: issue.fields.priority?.name ?? '',
      issuelinks: issue.fields.issuelinks ?? [],
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push({ key: parentKey, error: message });
    return [];
  }
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
