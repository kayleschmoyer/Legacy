import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface SecretListResponse {
  total_count: number;
  secrets: Array<{
    name: string;
    created_at: string;
    updated_at: string;
  }>;
}

export async function secretList(): Promise<ToolResult> {
  try {
    const repo = await getRepoOwnerName();
    const basePath = `/repos/${repo.owner}/${repo.name}/actions/secrets`;

    const allSecrets: Array<{
      name: string;
      createdAt: string;
      updatedAt: string;
    }> = [];
    let page = 1;
    let totalCount = 0;

    // Paginate through all secrets (100 per page)
    for (;;) {
      const result = await githubRest<SecretListResponse>({
        method: 'GET',
        path: `${basePath}?per_page=100&page=${page}`,
      });

      totalCount = result.total_count;
      for (const s of result.secrets) {
        allSecrets.push({
          name: s.name,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
        });
      }

      if (allSecrets.length >= totalCount || result.secrets.length === 0) {
        break;
      }
      page++;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { count: totalCount, secrets: allSecrets },
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
          text: `Failed to list secrets: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
