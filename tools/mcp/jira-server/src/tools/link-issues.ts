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
 * Public contract: `inwardKey` is the ticket that reads the link type's inward phrase
 * about `outwardKey`. For "Blocks", that means `inwardKey` is the blocked ticket and
 * `outwardKey` is the blocker — i.e. the relationship reads "inwardKey is blocked by
 * outwardKey" / "outwardKey blocks inwardKey".
 *
 * Implementation note: this is the inverse of what Jira's REST POST body expects.
 * Empirically, `POST /rest/api/3/issueLink` with `{ inwardIssue: X, outwardIssue: Y,
 * type: { name: "Blocks" } }` creates "X blocks Y" — Jira treats the POST `inwardIssue`
 * field as the *outward* (blocker) side of the link. To honour the user-friendly
 * contract above, we swap the params when building the POST body.
 *
 * GET semantics (used by consumers like view.ts / check-blockers.ts) follow the same
 * Jira convention: when querying the blocked ticket, the blocker appears as
 * `inwardIssue` of the issuelinks entry.
 *
 * Common link types:
 * - "Blocks"  → contract: inwardKey "is blocked by" outwardKey
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
    // Jira's POST treats `inwardIssue` as the outward (e.g. blocker) end of the link
    // and `outwardIssue` as the inward (e.g. blocked) end — the inverse of our public
    // contract. Swap them when forwarding so callers get the relationship they asked for.
    await jiraRequest({
      method: 'POST',
      path: '/rest/api/3/issueLink',
      body: {
        type: { name: linkType },
        inwardIssue: { key: outwardKey },
        outwardIssue: { key: inwardKey },
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
