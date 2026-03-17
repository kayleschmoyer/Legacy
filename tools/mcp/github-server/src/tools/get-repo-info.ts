import { runGhJson } from '../gh.js';
import type { ToolResult } from '../types.js';

interface RepoInfo {
  owner: { login: string };
  name: string;
  defaultBranchRef: { name: string };
  url: string;
}

export async function getRepoInfo(): Promise<ToolResult> {
  try {
    const repo = await runGhJson<RepoInfo>([
      'repo',
      'view',
      '--json',
      'owner,name,defaultBranchRef,url',
    ]);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              owner: repo.owner.login,
              name: repo.name,
              defaultBranch: repo.defaultBranchRef.name,
              url: repo.url,
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
