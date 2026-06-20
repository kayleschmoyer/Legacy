import { minifiedJson } from '@legacy-sports/mcp-format';
import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

export interface SecretDeleteParams {
  name: string;
}

export async function secretDelete(
  params: SecretDeleteParams,
): Promise<ToolResult> {
  try {
    const repo = await getRepoOwnerName();

    const encodedName = encodeURIComponent(params.name);

    await githubRest({
      method: 'DELETE',
      path: `/repos/${repo.owner}/${repo.name}/actions/secrets/${encodedName}`,
    });

    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({
            success: true,
            name: params.name,
            message: `Secret "${params.name}" deleted`,
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
          text: `Failed to delete secret "${params.name}": ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
