import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface ClearCiFailureLabelsParams {
  number: number;
}

interface GitHubLabel {
  name: string;
}

/** Fetch all labels on an issue, paginating with per_page=100 until exhausted. */
async function fetchAllLabels(basePath: string): Promise<string[]> {
  const allNames: string[] = [];
  let page = 1;
  while (true) {
    const page_labels = await githubRest<GitHubLabel[]>({
      method: 'GET',
      path: basePath,
      query: { per_page: '100', page: String(page) },
    });
    for (const l of page_labels) {
      allNames.push(l.name);
    }
    if (page_labels.length < 100) break;
    page++;
  }
  return allNames;
}

export async function clearCiFailureLabels(
  params: ClearCiFailureLabelsParams,
): Promise<ToolResult> {
  try {
    const repo = await getRepoOwnerName();
    const basePath = `/repos/${repo.owner}/${repo.name}/issues/${params.number}/labels`;

    const allLabels = await fetchAllLabels(basePath);

    const ciFailureLabels = allLabels.filter((name) =>
      name.startsWith('ci-failure-'),
    );

    if (ciFailureLabels.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              { prNumber: params.number, removed: [], failed: [] },
              null,
              2,
            ),
          },
        ],
      };
    }

    const removed: string[] = [];
    const failed: Array<{ label: string; error: string }> = [];

    for (const label of ciFailureLabels) {
      try {
        await githubRest({
          method: 'DELETE',
          path: `${basePath}/${encodeURIComponent(label)}`,
        });
        removed.push(label);
      } catch (removeErr) {
        // 404 = label not on PR, 422 = validation error (already removed) — safe to ignore
        const msg = removeErr instanceof Error ? removeErr.message : '';
        if (msg.includes('(404)') || msg.includes('(422)')) {
          removed.push(label);
        } else {
          failed.push({ label, error: msg });
        }
      }
    }

    return {
      isError: failed.length > 0,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { prNumber: params.number, removed, failed },
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
          text: `Failed to clear ci-failure labels on PR #${params.number}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
