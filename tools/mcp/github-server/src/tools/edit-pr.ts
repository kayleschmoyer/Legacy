import { minifiedJson } from '@legacy-sports/mcp-format';
import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';
import {
  extractJiraLinkBlock,
  stripJiraLinkBlocks,
  validateJiraLinkMarker,
} from './jira-link.js';

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

const MARKER_FIXIT =
  'A well-formed marker looks like:\n\n' +
  '<!-- jira-link\n' +
  'primary: LS-1234\n' +
  '-->\n\n' +
  'Re-send the edit with that block at the top of the body (or omit the ' +
  'marker entirely and it will be re-injected from the PR).';

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

    // Repair the jira-link marker if the new body drops it, or declares one
    // that Jira Link Check would reject, but the current PR body has a good
    // one — prevents Jira Link Check CI failures (LS-8017, LS-8721). A
    // caller-supplied marker is only trusted once it is *structurally valid*;
    // matching `<!-- jira-link` is not enough (LS-8721).
    let effectiveBody = body;
    const warnings: string[] = [];
    if (body !== undefined) {
      const marker = validateJiraLinkMarker(body);
      if (!marker.valid) {
        const currentPr = await githubRest<PullRequest>({
          method: 'GET',
          path: `/repos/${repo.owner}/${repo.name}/pulls/${number}`,
        });
        const existingBlock = extractJiraLinkBlock(currentPr.body ?? '');
        const canFallBack =
          existingBlock !== null && validateJiraLinkMarker(existingBlock).valid;

        if (canFallBack) {
          const rest = marker.present ? stripJiraLinkBlocks(body) : body;
          effectiveBody = `${existingBlock}\n\n${rest}`;
          warnings.push(
            marker.present
              ? `Replaced a malformed jira-link marker in the supplied body ` +
                  `with PR #${number}'s existing well-formed block ` +
                  `(${marker.errors.join(' ')}).`
              : `Re-injected PR #${number}'s existing jira-link block — the ` +
                  `supplied body had none.`,
          );
        } else if (marker.present) {
          // Nothing good to fall back on: refuse rather than PATCH a body
          // that is guaranteed to fail Jira Link Check.
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text:
                  `Refusing to edit PR #${number}: the supplied body declares ` +
                  `a jira-link marker that Jira Link Check would reject, and ` +
                  `the PR has no well-formed marker to fall back on.\n` +
                  marker.errors.map((e) => `  - ${e}`).join('\n') +
                  `\n\n${MARKER_FIXIT}`,
              },
            ],
          };
        }
        // Otherwise: no marker in either body — nothing to preserve, pass through.
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
            ...(warnings.length > 0 ? { warnings } : {}),
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
