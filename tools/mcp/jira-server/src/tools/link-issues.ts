import { jiraRequest } from '../jira-api.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface LinkIssuesParams {
  inwardKey: string;
  outwardKey: string;
  linkType: string;
}

/**
 * Create an issue link between two Jira tickets.
 *
 * Jira POST semantics: inwardIssue reads the inward phrase, outwardIssue reads the outward phrase.
 *
 * Common link types:
 * - "Blocks" → inwardIssue "is blocked by" outwardIssue (inward = blocked ticket, outward = blocker).
 *   Note: when viewing the blocked ticket's links via GET, the blocker appears as `inwardIssue`
 *   (Jira flips perspective on GET). This is why jira_check_blockers reads `inwardIssue` as the
 *   blocker when querying the blocked ticket.
 * - "Relates" → bidirectional "relates to"
 */
export async function linkIssues(
  params: LinkIssuesParams,
): Promise<CallToolResult> {
  const { inwardKey, outwardKey, linkType } = params;

  if (inwardKey === outwardKey) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: `Cannot link an issue to itself: inwardKey and outwardKey are both "${inwardKey}"`,
          }),
        },
      ],
    };
  }

  try {
    await jiraRequest({
      method: 'POST',
      path: '/rest/api/3/issueLink',
      body: {
        type: { name: linkType },
        inwardIssue: { key: inwardKey },
        outwardIssue: { key: outwardKey },
      },
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            linkType,
            inwardKey,
            outwardKey,
            message: `Created "${linkType}" link: ${inwardKey} (inward) ← ${outwardKey} (outward)`,
          }),
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
          text: JSON.stringify({
            success: false,
            error: `Failed to create issue link: ${message}`,
          }),
        },
      ],
    };
  }
}
