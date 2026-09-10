import { minifiedJson } from '@legacy-sports/mcp-format';
import { githubGet } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface IsHeadShaParams {
  prNumber: number;
  sha: string;
}

interface GitHubPullRequest {
  head: { sha: string };
  state: string;
}

/**
 * Answers "is this SHA still the PR's current head?" in a single call
 * (LS-9267), replacing the manual pull_request_read + ci_list_runs/ci_view_run
 * cross-check previously needed to tell whether a webhook-delivered
 * check-run/CI-comment event still refers to the PR's live head or has
 * already been superseded by a later push.
 */
export async function isHeadSha(params: IsHeadShaParams): Promise<ToolResult> {
  const { prNumber, sha } = params;

  try {
    const pr = await githubGet<GitHubPullRequest>(`/pulls/${prNumber}`);
    const currentHeadSha = pr.head.sha;
    const isCurrent = currentHeadSha === sha;

    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            prNumber,
            sha,
            currentHeadSha,
            isCurrent,
            superseded: !isCurrent,
            prState: pr.state,
          }),
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to check head SHA for PR #${prNumber}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
