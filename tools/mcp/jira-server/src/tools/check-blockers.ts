import { jiraRequest } from '../jira-api.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface CheckBlockersParams {
  key: string;
}

interface BlockerInfo {
  key: string;
  status: string;
  reason: string;
}

interface CheckBlockersResult {
  canProceed: boolean;
  blockers: BlockerInfo[];
  recommendation: string;
}

interface JiraIssueLink {
  type: { name: string; inward: string };
  inwardIssue?: { key: string; fields: { status: { name: string } } };
}

interface JiraIssueResponse {
  fields: {
    issuelinks: JiraIssueLink[];
  };
}

/**
 * Check if a ticket's blockers are resolved.
 * Implements the 3-way dependency check from copilot-instructions.md Step 3:
 * - Blocker not In Review/Done → STOP
 * - Blocker In Review → base off blocker's branch
 * - Blocker Done (or no blockers) → base off main
 */
export async function checkBlockers(
  params: CheckBlockersParams,
): Promise<CallToolResult> {
  const { key } = params;

  try {
    const issue = await jiraRequest<JiraIssueResponse>({
      method: 'GET',
      path: `/rest/api/3/issue/${key}`,
      query: { fields: 'issuelinks' },
    });

    // Extract "is blocked by" links with their statuses
    const blockerLinks = issue.fields.issuelinks.filter(
      (link) =>
        link.inwardIssue &&
        link.type.inward.toLowerCase().includes('is blocked by'),
    );

    if (blockerLinks.length === 0) {
      return makeResult({
        canProceed: true,
        blockers: [],
        recommendation: 'base off main',
      });
    }

    const blockers: BlockerInfo[] = blockerLinks.map((link) => {
      const blockerKey = link.inwardIssue!.key;
      const status = link.inwardIssue!.fields.status.name;

      let reason: string;
      if (status === 'Done') {
        reason = 'Resolved — no longer blocking';
      } else if (status === 'In Review') {
        reason = 'In Review — use its branch as parent';
      } else {
        reason = `Status is "${status}" — must reach at least "In Review" before proceeding`;
      }

      return { key: blockerKey, status, reason };
    });

    // Determine recommendation based on blocker statuses
    const unresolvedBlockers = blockers.filter(
      (b) => b.status !== 'Done' && b.status !== 'In Review',
    );
    const inReviewBlockers = blockers.filter((b) => b.status === 'In Review');

    let canProceed: boolean;
    let recommendation: string;

    if (unresolvedBlockers.length > 0) {
      canProceed = false;
      recommendation = `STOP — blocker(s) not ready: ${unresolvedBlockers.map((b) => `${b.key} (${b.status})`).join(', ')}`;
    } else if (inReviewBlockers.length === 1) {
      canProceed = true;
      const parentKey = inReviewBlockers[0].key;
      recommendation = `base off ${parentKey} branch`;
    } else if (inReviewBlockers.length > 1) {
      canProceed = false;
      const inReviewList = inReviewBlockers.map((b) => b.key).join(', ');
      recommendation = `STOP — multiple blockers are In Review; a human must choose the parent branch from: ${inReviewList}`;
    } else {
      canProceed = true;
      recommendation = 'base off main';
    }

    return makeResult({ canProceed, blockers, recommendation });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to check blockers for ${key}: ${message}`,
        },
      ],
    };
  }
}

function makeResult(result: CheckBlockersResult): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
