import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import { resolveHeadShaFromPrNumber } from '../pr-utils.js';
import type { ToolResult } from '../types.js';

interface SetCommitStatusParams {
  number: number;
  context: string;
  state: 'success' | 'failure' | 'pending' | 'error';
  description?: string;
}

interface StatusResponse {
  state: string;
  context: string;
  description: string | null;
  created_at: string;
}

export async function setCommitStatus(
  params: SetCommitStatusParams,
): Promise<ToolResult> {
  try {
    const repo = await getRepoOwnerName();

    // 1. Resolve head commit SHA from PR number
    const sha = await resolveHeadShaFromPrNumber(params.number);
    if (!sha) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `PR #${params.number} not found or has no commits.`,
          },
        ],
      };
    }

    // 2. Create commit status via REST API
    const body: Record<string, string> = {
      state: params.state,
      context: params.context,
    };
    if (params.description) {
      body.description = params.description;
    }

    const status = await githubRest<StatusResponse>({
      method: 'POST',
      path: `/repos/${repo.owner}/${repo.name}/statuses/${sha}`,
      body,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              sha: sha.slice(0, 7),
              context: status.context,
              state: status.state,
              description: status.description,
              createdAt: status.created_at,
            },
            null,
            2,
          ),
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
          text: `Failed to set commit status on PR #${params.number}: ${message}`,
        },
      ],
    };
  }
}
