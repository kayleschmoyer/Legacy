import { minifiedJson } from '@legacy-sports/mcp-format';
import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';
import { hasJiraLinkMarker } from './jira-link.js';

interface EditPRParams {
  number: number;
  title?: string;
  body?: string;
}

interface PullRequest {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
}

const JIRA_LINK_BLOCK_RE =
  /<!--\s*jira-link[\s\S]*?-->(?:\s*\n\n\*\*Jira:\*\*[^\n]*)?\n*/i;

/** Extract the jira-link block (comment + optional Jira: line) from a body. */
function extractJiraLinkBlock(body: string): string | null {
  const match = JIRA_LINK_BLOCK_RE.exec(body);
  return match ? match[0].trimEnd() : null;
}

/** Update a pull request's title and/or body. */
export async function editPR(params: EditPRParams): Promise<ToolResult> {
  const { number, title, body } = params;

  if (title === undefined && body === undefined) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'At least one of title or body must be provided.',
        },
      ],
    };
  }

  try {
    const repo = await getRepoOwnerName();

    // Re-inject the jira-link marker if the new body drops it but the current
    // PR body has one — prevents Jira Link Check CI failures (LS-8017).
    let effectiveBody = body;
    if (body !== undefined && !hasJiraLinkMarker(body)) {
      const currentPr = await githubRest<PullRequest>({
        method: 'GET',
        path: `/repos/${repo.owner}/${repo.name}/pulls/${number}`,
      });
      const existingBlock = extractJiraLinkBlock(currentPr.body ?? '');
      if (existingBlock) {
        effectiveBody = `${existingBlock}\n\n${body}`;
      }
    }

    const patchBody: Record<string, string> = {};
    if (title !== undefined) patchBody['title'] = title;
    if (effectiveBody !== undefined) patchBody['body'] = effectiveBody;

    const pr = await githubRest<PullRequest>({
      method: 'PATCH',
      path: `/repos/${repo.owner}/${repo.name}/pulls/${number}`,
      body: patchBody,
    });
    const updatedFields: Record<string, string> = {};
    if (title !== undefined) updatedFields['title'] = pr.title;
    if (effectiveBody !== undefined) updatedFields['body'] = pr.body ?? '';
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            success: true,
            number: pr.number,
            url: pr.html_url,
            updatedFields,
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
          text: `Failed to edit PR #${number}: ${message}`,
        },
      ],
    };
  }
}
