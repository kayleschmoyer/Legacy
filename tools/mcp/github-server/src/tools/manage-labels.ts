import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface ManageLabelsParams {
  prs: number[];
  add?: string[];
  remove?: string[];
}

/** Add or remove labels on one or more PRs. Accepts a single PR number or an array. */
export async function manageLabels(
  params: ManageLabelsParams,
): Promise<ToolResult> {
  const uniquePrs = [...new Set(params.prs)];

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

  const perPrResults: Array<{
    prNumber: number;
    success: boolean;
    error?: string;
  }> = [];

  try {
    const repo = await getRepoOwnerName();

    // Process PRs in parallel batches of 10
    const BATCH_SIZE = 10;
    for (let i = 0; i < uniquePrs.length; i += BATCH_SIZE) {
      const batch = uniquePrs.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (prNumber) => {
          const basePath = `/repos/${repo.owner}/${repo.name}/issues/${prNumber}/labels`;
          try {
            if (params.add?.length) {
              await githubRest({
                method: 'POST',
                path: basePath,
                body: { labels: params.add },
              });
            }
            if (params.remove?.length) {
              for (const label of params.remove) {
                try {
                  await githubRest({
                    method: 'DELETE',
                    path: `${basePath}/${encodeURIComponent(label)}`,
                  });
                } catch (removeErr) {
                  // 404 = label not on PR, 422 = already removed — safe to ignore
                  const msg =
                    removeErr instanceof Error ? removeErr.message : '';
                  if (!msg.includes('(404)') && !msg.includes('(422)')) {
                    throw removeErr;
                  }
                }
              }
            }
            return { prNumber, success: true };
          } catch (error) {
            return {
              prNumber,
              success: false,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        }),
      );
      perPrResults.push(...batchResults);
    }
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

  const succeeded = perPrResults.filter((r) => r.success).length;
  const failed = perPrResults.filter((r) => !r.success).length;

  // For single-PR calls, emit a flatter response shape
  if (uniquePrs.length === 1) {
    return {
      isError: failed > 0,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              prNumber: uniquePrs[0],
              success: failed === 0,
              requestedLabelsAdded: params.add ?? [],
              requestedLabelsRemoved: params.remove ?? [],
              ...(perPrResults[0].error
                ? { error: perPrResults[0].error }
                : {}),
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  return {
    isError: failed > 0,
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            total: uniquePrs.length,
            succeeded,
            failed,
            requestedLabelsAdded: params.add ?? [],
            requestedLabelsRemoved: params.remove ?? [],
            results: perPrResults,
          },
          null,
          2,
        ),
      },
    ],
  };
}
