import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface GitHubRepoResponse {
  owner: { login: string };
  name: string;
  default_branch: string;
  html_url: string;
}

export async function getRepoInfo(): Promise<ToolResult> {
  try {
    const repo = await getRepoOwnerName();
    const data = await githubRest<GitHubRepoResponse>({
      method: 'GET',
      path: `/repos/${repo.owner}/${repo.name}`,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              owner: data.owner.login,
              name: data.name,
              defaultBranch: data.default_branch,
              url: data.html_url,
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to get repo info: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
