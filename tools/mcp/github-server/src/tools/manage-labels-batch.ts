import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface ManageLabelsBatchParams {
  prs: number[];
  add?: string[];
  remove?: string[];
}

export async function manageLabelsBatch(
  params: ManageLabelsBatchParams,
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

  const results: Array<{
    prNumber: number;
    success: boolean;
    error?: string;
  }> = [];

  try {
    const repo = await getRepoOwnerName();

    // Process PRs in parallel batches of 10 to avoid overwhelming the API
    const BATCH_SIZE = 10;
    for (let i = 0; i < uniquePrs.length; i += BATCH_SIZE) {
      const batch = uniquePrs.slice(i, i + BATCH_SIZE);
      const promises = batch.map(async (prNumber) => {
        const basePath = `/repos/${repo.owner}/${repo.name}/issues/${prNumber}/labels`;

        try {
          // Add labels (single request)
          if (params.add?.length) {
            await githubRest({
              method: 'POST',
              path: basePath,
              body: { labels: params.add },
            });
          }

          // Remove labels (one request per label)
          if (params.remove?.length) {
            for (const label of params.remove) {
              try {
                await githubRest({
                  method: 'DELETE',
                  path: `${basePath}/${encodeURIComponent(label)}`,
                });
              } catch (removeErr) {
                // 404 = label not on PR, 422 = validation error (already removed) — safe to ignore
                const msg = removeErr instanceof Error ? removeErr.message : '';
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
      });

      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
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

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return {
    isError: failed > 0,
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            requestedTotal: params.prs.length,
            total: results.length,
            succeeded,
            failed,
            labelsAdded: params.add ?? [],
            labelsRemoved: params.remove ?? [],
            results,
          },
          null,
          2,
        ),
      },
    ],
  };
}
