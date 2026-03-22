import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface ManageLabelsParams {
  number: number;
  add?: string[];
  remove?: string[];
}

export async function manageLabels(
  params: ManageLabelsParams,
): Promise<ToolResult> {
  if (!params.add?.length && !params.remove?.length) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'No labels to add or remove. Provide at least one of "add" or "remove".',
        },
      ],
    };
  }

  const results: Array<{
    action: string;
    label: string;
    success: boolean;
    error?: string;
  }> = [];

  try {
    const repo = await getRepoOwnerName();
    const basePath = `/repos/${repo.owner}/${repo.name}/issues/${params.number}/labels`;

    // Add labels (single request)
    if (params.add?.length) {
      try {
        await githubRest({
          method: 'POST',
          path: basePath,
          body: { labels: params.add },
        });
        for (const label of params.add) {
          results.push({ action: 'add', label, success: true });
        }
      } catch (error) {
        for (const label of params.add) {
          results.push({
            action: 'add',
            label,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    // Remove labels (one request per label)
    if (params.remove?.length) {
      for (const label of params.remove) {
        try {
          await githubRest({
            method: 'DELETE',
            path: `${basePath}/${encodeURIComponent(label)}`,
          });
          results.push({ action: 'remove', label, success: true });
        } catch (error) {
          results.push({
            action: 'remove',
            label,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to update labels on PR #${params.number}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ prNumber: params.number, results }, null, 2),
      },
    ],
  };
}
