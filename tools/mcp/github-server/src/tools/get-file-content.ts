import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface GetFileContentParams {
  path: string;
  ref?: string;
}

interface GitHubFileResponse {
  path: string;
  sha: string;
  size: number;
  content: string;
  encoding: string;
}

export async function getFileContent(
  params: GetFileContentParams,
): Promise<ToolResult> {
  try {
    const repo = await getRepoOwnerName();
    const ref = params.ref ?? 'main';

    const data = await githubRest<GitHubFileResponse>({
      method: 'GET',
      path: `/repos/${repo.owner}/${repo.name}/contents/${params.path}`,
      query: { ref },
    });

    if (data.encoding !== 'base64') {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Unsupported encoding "${data.encoding}" for ${params.path}`,
          },
        ],
      };
    }

    const content = Buffer.from(
      data.content.replace(/\n/g, ''),
      'base64',
    ).toString('utf-8');

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              path: data.path,
              ref,
              sha: data.sha,
              content,
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
          text: `Failed to get file content for ${params.path} at ref "${params.ref ?? 'main'}": ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
