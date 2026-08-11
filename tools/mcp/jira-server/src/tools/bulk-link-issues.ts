import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { jiraRequest } from '../jira-api.js';

export interface BulkLinkInput {
  inwardKey: string;
  outwardKey: string;
  linkType: string;
}

interface BulkLinkParams {
  links: BulkLinkInput[];
}

interface SucceededEntry {
  index: number;
  inwardKey: string;
  outwardKey: string;
  linkType: string;
}

interface FailedEntry {
  index: number;
  inwardKey: string;
  outwardKey: string;
  linkType: string;
  error: string;
}

const CONCURRENCY = 5;

/**
 * Create up to 50 issue links in one call. Public contract matches
 * `jira_link_issues`: `inwardKey` is the ticket that reads the link type's
 * inward phrase about `outwardKey` (e.g. for "Blocks", `inwardKey` is the
 * blocked ticket). One link failing never fails the whole batch.
 */
export async function bulkLinkIssues(
  params: BulkLinkParams,
): Promise<CallToolResult> {
  const { links } = params;

  if (links.length === 0) {
    return errorResult('links array is empty');
  }
  if (links.length > 50) {
    return errorResult(
      `Too many links (${links.length}). Maximum per call is 50. Split into batches.`,
    );
  }

  const succeeded: SucceededEntry[] = [];
  const failed: FailedEntry[] = [];

  async function runOne(link: BulkLinkInput, index: number): Promise<void> {
    const { inwardKey, outwardKey, linkType } = link;
    if (inwardKey === outwardKey) {
      failed.push({
        index,
        inwardKey,
        outwardKey,
        linkType,
        error: `Cannot link an issue to itself: inwardKey and outwardKey are both "${inwardKey}"`,
      });
      return;
    }

    try {
      // Same param swap as single-item link-issues.ts — Jira's POST treats
      // `inwardIssue` as the outward (blocker) end of the link.
      await jiraRequest({
        method: 'POST',
        path: '/rest/api/3/issueLink',
        body: {
          type: { name: linkType },
          inwardIssue: { key: outwardKey },
          outwardIssue: { key: inwardKey },
        },
      });
      succeeded.push({ index, inwardKey, outwardKey, linkType });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push({ index, inwardKey, outwardKey, linkType, error: message });
    }
  }

  for (let i = 0; i < links.length; i += CONCURRENCY) {
    const chunk = links.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map((l, j) => runOne(l, i + j)));
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: failed.length === 0,
            total: links.length,
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
